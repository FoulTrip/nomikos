/** PUT /api/account/chain — red y wallet operativa del agente. */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return Response.json({ ok: false, error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  return forwardToApi("/accounts/me/chain", { method: "PUT" }, body);
}
