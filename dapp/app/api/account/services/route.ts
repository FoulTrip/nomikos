/**
 * Servicios del agente — dapps que usará con x402 en todo su flujo.
 * GET  → catálogo + estado por cuenta
 * POST → { service: "medusa" } registra el vínculo cuenta→servicio→x402 en DB
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToApi("/accounts/me/services");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const service = String((body as { service?: string } | null)?.service ?? "").trim();
  if (!service) {
    return Response.json({ ok: false, error: "Falta el servicio" }, { status: 400 });
  }
  return forwardToApi("/accounts/me/services", { method: "POST" }, { service });
}
