/**
 * GET /api/agent/tools — inventario de tools del agente (núcleo +
 * dapps instaladas) para el dashboard del panel.
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToApi("/agent/tools", { method: "GET" });
}
