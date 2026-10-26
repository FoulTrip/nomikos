/**
 * POST /api/account/faucet — Faucet Devnet (NomikOS W6): gotea SOL
 * del treasury del ecosistema a la wallet dPaaS de la cuenta, para que
 * los peajes x402 liquiden on-chain de verdad (solo devnet).
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function POST() {
  return forwardToApi("/dev/faucet", { method: "POST" }, {});
}
