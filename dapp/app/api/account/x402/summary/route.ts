/**
 * GET /api/account/x402/summary — dPaaS de la cuenta (wallet + balance
 * vivo + límites + facturas) para el modal Wallet·Red.
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToApi("/accounts/me/x402/summary", { method: "GET" });
}
