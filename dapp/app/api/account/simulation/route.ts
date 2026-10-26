/**
 * GET  /api/account/simulation — el estado del OS NomikOS simulado de la
 * cuenta (retoma el progreso; sin estado → arranque de cero).
 * POST /api/account/simulation — {action, text?} avanza la máquina de
 * estados (boot|claim|tap|heartbeat|apps|x402|say|rebuild). El api es
 * autoritativo. `say` lleva el texto del micrófono al agente.
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToApi("/accounts/me/simulation", { method: "GET" });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.action) {
    return Response.json(
      { ok: false, error: "falta action: boot|claim|tap|heartbeat|apps|x402|rebuild" },
      { status: 400 },
    );
  }
  // timeout largo: `say` espera un turno completo del orquestador (~60s
  // con NIM; el api corta a 300s) — el resto de acciones responde en ms.
  return forwardToApi(
    "/accounts/me/simulation/step",
    { method: "POST" },
    { action: body.action, text: body.text },
    310_000,
  );
}
