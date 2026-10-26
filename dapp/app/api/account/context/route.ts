/** GET /api/account/context — contexto completo de la cuenta (chain + wallets). */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToApi("/accounts/me/context");
}
