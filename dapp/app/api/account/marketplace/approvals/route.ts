import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToApi("/accounts/me/marketplace/approvals", { method: "GET" });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    id?: string;
    approved?: boolean;
  } | null;
  const id = body?.id?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id) || typeof body?.approved !== "boolean") {
    return Response.json({ ok: false, error: "Decisión de aprobación inválida" }, { status: 400 });
  }
  return forwardToApi(`/accounts/me/marketplace/approvals/${encodeURIComponent(id)}`, {
    method: "POST",
  }, { approved: body.approved });
}
