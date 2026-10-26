/**
 * LLM de la cuenta — multi-proveedor, uno solo ACTIVO (el que usa brain):
 *
 *  PUT    — guarda (upsert) UN proveedor: provider, api_key (sellada AEAD
 *           en la DB de api), base_url y modelos. Sin api_key → conserva
 *           la existente. El primero queda activo solo.
 *  POST   — {provider?, model?} selecciona el activo y/o su modelo.
 *  DELETE — ?provider=X borra ESE proveedor (sin query: el activo). Sin
 *           activo, el agente exige configurar (sin fallback global).
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  return forwardToApi("/accounts/me/llm", { method: "PUT" }, body);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  return forwardToApi("/accounts/me/llm/active", { method: "POST" }, body);
}

export async function DELETE(req: Request) {
  const provider = new URL(req.url).searchParams.get("provider")?.trim();
  const path = provider
    ? `/accounts/me/llm?provider=${encodeURIComponent(provider)}`
    : "/accounts/me/llm";
  return forwardToApi(path, { method: "DELETE" });
}
