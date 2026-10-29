/**
 * GET /api/account/x402/summary — dPaaS de la cuenta (wallet + balance
 * vivo + límites + facturas) para el modal Wallet·Red.
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const environment = new URL(req.url).searchParams.get("environment");
  const query = environment ? `?environment=${encodeURIComponent(environment)}` : "";
  return forwardToApi(`/accounts/me/x402/summary${query}`, { method: "GET" });
}
