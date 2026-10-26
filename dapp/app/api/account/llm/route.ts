/**
 * Proveedor LLM de la cuenta (la que usará el agente vía brain):
 *
 *  PUT    — provider, api_key (sellada AEAD en la DB de api), base_url y
 *           modelo por defecto. Sin api_key → conserva la existente.
 *  DELETE — desconecta: borra account_llm y el agente vuelve al backend
 *           global del ecosistema (botón "Desconectar" del modal Modelos).
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

export async function DELETE() {
  return forwardToApi("/accounts/me/llm", { method: "DELETE" });
}
