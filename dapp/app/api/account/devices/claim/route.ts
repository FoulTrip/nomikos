/**
 * POST /api/account/devices/claim — empareja un dispositivo con la cuenta
 * canjeando el claim_code que la placa enseña en su pantalla.
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = String((body as { code?: string } | null)?.code ?? "").trim();
  if (!code) {
    return Response.json({ ok: false, error: "Falta el código de emparejado" }, { status: 400 });
  }
  return forwardToApi("/devices/claim", { method: "POST" }, { code });
}
