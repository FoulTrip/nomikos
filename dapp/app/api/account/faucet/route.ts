/**
 * POST /api/account/faucet — solicita Devnet SOL de prueba directamente
 * para la wallet dPaaS Devnet automática de la cuenta.
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function POST() {
  return forwardToApi("/dev/faucet", { method: "POST" }, {});
}
