/** GET /api/account/devices — la flota de la cuenta (Bearer de sesión). */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToApi("/devices");
}
