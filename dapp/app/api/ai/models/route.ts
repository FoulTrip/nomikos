import { NextResponse } from "next/server";
import OpenAI from "openai";
import { AI_PROVIDERS } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

interface Body {
  provider?: string; // ABIERTO: "nvidia" | "meta" | "custom" | "baseten" | cualquier OpenAI-compat
  baseUrl?: string;
  apiKey?: string;
  model?: string; // modelo concreto con el que validar (opcional; sin él no se hace ping)
}

interface ModelEntry {
  id: string;
  free: boolean;
}

// -----------------------------------------------------------------
// Catálogo público models.dev (el mismo que usa opencode) — cacheado
// en el servidor 1h. Da el coste (input 0 = gratis) y el tipo de modelo.
interface CatalogModel {
  type?: string;
  modalities?: { output?: string[] };
  cost?: { input?: number };
}
type Catalog = Record<string, { models?: Record<string, CatalogModel> }>;

let catalogCache: { data: Catalog; at: number } | null = null;
const CATALOG_TTL = 60 * 60 * 1000;

async function getCatalog(): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL) return catalogCache.data;
  const res = await fetch("https://models.dev/api.json", { cache: "no-store" });
  if (!res.ok) return catalogCache?.data ?? {};
  const data = (await res.json()) as Catalog;
  catalogCache = { data, at: Date.now() };
  return data;
}

// "Meta Llama API" YA NO aparece en models.dev → sin catálogo, solo listado en vivo.
function catalogKey(provider: string): string | null {
  switch (provider) {
    case "nvidia":
    case "openai":
      return provider;
    default:
      return null; // meta/baseten/custom: sin catálogo, solo listado en vivo
  }
}

// ¿es un modelo de chat? (excluye imagen, video, embedding, reranking, tts…)
function isChatModel(m: CatalogModel | undefined): boolean {
  if (!m) return true; // sin info en el catálogo → asumir chat
  if (m.type && m.type !== "chat") return false;
  if (m.modalities?.output) return m.modalities.output.includes("text");
  return true;
}

// Errores que indican que la CREDENCIAL es el problema (no el modelo).
const KEY_ERROR_RE = /401|invalid_api_key|invalid key|unauthorized|authentication/i;
// 403 "please check the api-key you provided" de Baseten es un ERROR DE
// MODELO (key válida para listar, pero no autoriza ese modelo), no un error de key.
const MODEL_ERROR_RE = /404|403|model|not found|not authorized|not available/i;

const KEY_HINT =
  "copia la key completa de nuevo (solo se muestra una vez al crearla) " +
  "y confirma que tu proyecto tiene acceso a la API";

// -----------------------------------------------------------------
// POST { provider, baseUrl?, apiKey?, model? }
// "Conectar": valida la API key y devuelve los modelos de chat disponibles.
// → { ok, source: "live" | "catalog", warning?, models: [{ id, free }] }
export async function POST(req: Request) {
  try {
    const body: Body = await req.json();
    const provider = (body.provider ?? "custom").trim().toLowerCase();
    const apiKey = (body.apiKey ?? "").trim();
    // cualquier proveedor puede traer su baseUrl; si no, se usa la del catálogo conocido
    const baseUrl = (body.baseUrl ?? AI_PROVIDERS[provider]?.baseUrl)
      ?.replace(/\/+$/, "");

    // catálogo: set de modelos gratis + lista de modelos de chat (para free-tagging y fallback)
    const catalog = await getCatalog().catch(() => ({}) as Catalog);
    const ck = catalogKey(provider);
    const catModels = ck ? catalog[ck]?.models ?? {} : {};
    const catFree = new Set(
      Object.entries(catModels)
        .filter(([, m]) => isChatModel(m) && (m.cost?.input ?? -1) === 0)
        .map(([id]) => id)
    );
    const catalogChat = Object.entries(catModels)
      .filter(([, m]) => isChatModel(m))
      .map(([id]) => id)
      .sort();
    const isChat = (id: string) => isChatModel(catModels[id]);

    // sin API key → solo catálogo público
    if (!apiKey || !baseUrl) {
      if (catalogChat.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Falta API key o base URL" },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        source: "catalog",
        models: catalogChat.map((id) => ({ id, free: catFree.has(id) })),
      });
    }

    // -----------------------------------------------------------------
    // con API key → listado en vivo (librería openai)
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    let liveIds: string[] = [];
    let listError: string | null = null;
    try {
      for await (const m of client.models.list()) liveIds.push(m.id);
    } catch (e: any) {
      listError = String(e?.message ?? e);
    }

    // solo modelos de chat (excluye flux, embeddings, rerank, etc.)
    const chatIds = liveIds.filter(isChat).sort();

    if (chatIds.length > 0) {
      // models.list OK → la key es válida para este proveedor.
      // NO se hace ping "al azar" (Baseten 403 con modelo ajeno = falso negativo).
      // Ping SOLO si el usuario pidió validar un modelo concreto (body.model).
      const list: ModelEntry[] = chatIds.map((id) => ({ id, free: catFree.has(id) }));
      if (body.model && chatIds.includes(body.model)) {
        try {
          await client.chat.completions.create(
            {
              model: body.model,
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 1,
            },
            { timeout: 15_000, maxRetries: 0 },
          );
        } catch (e2: any) {
          const m2 = String(e2?.message ?? e2);
          if (KEY_ERROR_RE.test(m2)) {
            return NextResponse.json(
              { ok: false, error: `API key rechazada (${m2.slice(0, 120)}) — ${KEY_HINT}` },
              { status: 401 }
            );
          }
          // error de modelo u otro → la clave vale, advierte y sigue
          return NextResponse.json({
            ok: true,
            source: "live",
            warning: `${body.model}: ${m2.slice(0, 120)}`,
            models: list,
          });
        }
      }
      return NextResponse.json({ ok: true, source: "live", models: list });
    }

    // -----------------------------------------------------------------
    // models.list falló o no devolvió modelos de chat
    if (listError && KEY_ERROR_RE.test(listError)) {
      // /models rechazó la key: último recurso, ping con modelo explícito o default conocido
      const known = AI_PROVIDERS[provider]?.models ?? [];
      const probeModel =
        body.model ??
        (known.length > 0 ? known[0] : catalogChat[0]);
      if (probeModel) {
        try {
          const probe = new OpenAI({ apiKey, baseURL: baseUrl });
          await probe.chat.completions.create(
            {
              model: probeModel,
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 1,
            },
            { timeout: 15_000, maxRetries: 0 },
          );
          const ids = [...new Set([...catalogChat, ...known])];
          return NextResponse.json({
            ok: true,
            source: "catalog",
            warning: `listado no disponible, pero la key funciona con ${probeModel}`,
            models: ids.map((id) => ({ id, free: catFree.has(id) })),
          });
        } catch {
          /* ping también rechazado → 401 de abajo */
        }
      }
      return NextResponse.json(
        {
          ok: false,
          error: `API key rechazada por el proveedor (${listError.slice(0, 120)}) — ${KEY_HINT}`,
        },
        { status: 401 }
      );
    }

    // listado no disponible por motivo distinto a la key → catálogo como respaldo
    const known = AI_PROVIDERS[provider]?.models ?? [];
    const ids = [...new Set([...catalogChat, ...known])];
    if (ids.length > 0) {
      return NextResponse.json({
        ok: true,
        source: "catalog",
        warning: `el proveedor no permitió listar modelos — usando ${ids.length} modelo(s) conocido(s)`,
        models: ids.map((id) => ({ id, free: catFree.has(id) })),
      });
    }
    return NextResponse.json(
      { ok: false, error: listError?.slice(0, 200) ?? "Sin modelos disponibles" },
      { status: 502 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
