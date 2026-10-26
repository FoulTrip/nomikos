/**
 * POST /api/account/chain/keypair/generate — crea la wallet dPaaS de la
 * cuenta (botón "Crear wallet" del modal). 409 si ya existe.
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function POST() {
  return forwardToApi("/accounts/me/chain/keypair/generate", { method: "POST" }, {});
}
