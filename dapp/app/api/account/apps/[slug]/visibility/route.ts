/** Control de visibilidad de una DApp para los dispositivos de la cuenta. */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const { slug } = await params;
  return forwardToApi(
    `/accounts/me/apps/${encodeURIComponent(slug)}/visibility`,
    { method: "GET" },
  );
}

export async function PUT(req: Request, { params }: RouteContext) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  return forwardToApi(
    `/accounts/me/apps/${encodeURIComponent(slug)}/visibility`,
    { method: "PUT" },
    body,
  );
}
