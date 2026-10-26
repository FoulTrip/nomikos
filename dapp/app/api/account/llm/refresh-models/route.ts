/**
 * POST /api/account/llm/refresh-models — re-lista los modelos del
 * proveedor desde el servidor (la key sellada nunca sale del api).
 * Body opcional {provider} (defecto: el activo). Best-effort: si el
 * proveedor falla, la lista guardada queda intacta.
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return forwardToApi("/accounts/me/llm/refresh-models", { method: "POST" }, body ?? {});
}
