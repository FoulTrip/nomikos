import { NextResponse } from "next/server";
import OpenAI from "openai";
import { AI_PROVIDERS } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

interface Body {
  provider?: "nvidia" | "meta" | "custom";
  baseUrl?: string;
  apiKey?: string;
  model?: string; // modelo con el que validar la conexión
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

// "Meta Llama API" (api.llama.com) aparece en models.dev como "llama",
// no como "meta" (que es la API de pago de meta.ai).
function catalogKey(provider: "nvidia" | "meta" | "custom"): string | null {
  switch (provider) {
    case "nvidia":
      return "nvidia";
    case "meta":
      return "llama";
    default:
      return null; // custom: sin catálogo, solo listado en vivo
  }
}

// ¿es un modelo de chat? (excluye imagen, video, embedding, reranking, tts…)
function isChatModel(m: CatalogModel | undefined): boolean {
  if (!m) return true; // sin info en el catálogo → asumir chat
  if (m.type && m.type !== "chat") return false;
  if (m.modalities?.output) return m.modalities.output.includes("text");
  return true;
}

const KEY_ERROR_RE = /401|403|invalid|unauthorized|api\s?key|credencial/i;

// -----------------------------------------------------------------
// POST { provider, baseUrl?, apiKey?, model? }
// "Conectar": valida la API key y devuelve los modelos de chat disponibles.
// → { ok, source: "live" | "catalog", warning?, models: [{ id, free }] }
export async function POST(req: Request) {
  try {
    const body: Body = await req.json();
    const provider = body.provider ?? "nvidia";
    const apiKey = (body.apiKey ?? "").trim();
    const baseUrl = (
      provider === "custom" ? body.baseUrl : AI_PROVIDERS[provider]?.baseUrl
    )
      ?.replace(/\/+$/, "");

    // catálogo: set de modelos gratis + lista de modelos de chat
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

    // con API key → listado en vivo (librería openai) + validación real
    try {
      const client = new OpenAI({ apiKey, baseURL: baseUrl });
      const raw: string[] = [];
      for await (const m of client.models.list()) raw.push(m.id);

      // solo modelos de chat (excluye flux, embeddings, rerank, etc.)
      const ids = raw
        .filter(isChat)
        .sort(
          (a, b) =>
            (catFree.has(b) ? 1 : 0) - (catFree.has(a) ? 1 : 0) || a.localeCompare(b)
        );
      if (ids.length === 0) throw new Error("El proveedor no devolvió modelos de chat");

      const list: ModelEntry[] = ids.map((id) => ({ id, free: catFree.has(id) }));

      // El endpoint /models de algunos proveedores (p.ej. NVIDIA) es público
      // y NO valida la key: confirmamos con una petición mínima de chat.
      // Timeout 30s: los modelos gratis de NIM pueden tener cold-starts de
      // minutos — sin esto el "Cargar modelos" del modal queda colgado.
      const pingModel =
        body.model && ids.includes(body.model)
          ? body.model
          : (ids.find((id) => catFree.has(id)) ?? ids[0]);
      try {
        await client.chat.completions.create(
          {
            model: pingModel,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          },
          { timeout: 30_000, maxRetries: 0 },
        );
        return NextResponse.json({ ok: true, source: "live", models: list });
      } catch (e2: any) {
        const msg2 = String(e2?.message ?? e2);
        if (KEY_ERROR_RE.test(msg2)) {
          return NextResponse.json(
            { ok: false, error: `API key rechazada (${msg2.slice(0, 140)})` },
            { status: 401 }
          );
        }
        return NextResponse.json({
          ok: true,
          source: "live",
          warning: `la prueba con ${pingModel} falló (${msg2.slice(0, 120)})`,
          models: list,
        });
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);

      // API key inválida → se lo decimos claro al usuario
      if (KEY_ERROR_RE.test(msg)) {
        return NextResponse.json(
          { ok: false, error: `API key rechazada por el proveedor (${msg.slice(0, 140)})` },
          { status: 401 }
        );
      }

      // si el proveedor no soporta el endpoint /models → catálogo como respaldo
      // (silencioso: los modelos siguen siendo seleccionables)
      if (catalogChat.length > 0) {
        return NextResponse.json({
          ok: true,
          source: "catalog",
          models: catalogChat.map((id) => ({ id, free: catFree.has(id) })),
        });
      }
      return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 502 });
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
