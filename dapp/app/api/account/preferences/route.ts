/** GET+PUT /api/account/preferences — perfil, idioma y país de la cuenta. */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToApi("/accounts/me/preferences", { method: "GET" });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  return forwardToApi("/accounts/me/preferences", { method: "PUT" }, body);
}
