/** Catálogo real de aplicaciones disponible en la API del ecosistema. */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const path = query ? `/apps?q=${encodeURIComponent(query)}` : "/apps";
  return forwardToApi(path, { method: "GET" });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const slug = String((body as { slug?: string } | null)?.slug ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return Response.json({ ok: false, error: "DApp inválida" }, { status: 400 });
  }

  return forwardToApi(`/apps/${encodeURIComponent(slug)}/install`, { method: "POST" });
}
