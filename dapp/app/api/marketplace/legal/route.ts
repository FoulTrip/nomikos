import { API_GATEWAY_URL } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const namespace = query.get("namespace")?.trim() ?? "";
  const document = query.get("document") ?? "";
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(namespace) || !["terms", "privacy"].includes(document)) {
    return Response.json({ ok: false, error: "Documento legal inválido" }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${API_GATEWAY_URL}/marketplace/apps/${encodeURIComponent(namespace)}/legal/${document}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    const headers = new Headers({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${document}.txt"`,
    });
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers });
  } catch {
    return Response.json({ ok: false, error: "La API no responde" }, { status: 502 });
  }
}
