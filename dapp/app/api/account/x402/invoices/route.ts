/**
 * GET /api/account/x402/invoices — facturas x402 de la cuenta autenticada.
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const environment = new URL(req.url).searchParams.get("environment");
  const query = environment ? `?environment=${encodeURIComponent(environment)}` : "";
  return forwardToApi(`/accounts/me/x402/invoices${query}`, { method: "GET" });
}
