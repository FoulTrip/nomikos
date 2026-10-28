/**
 * GET /api/account/diagnosis — datos para la tarjeta de diagnóstico del
 * panel: el módulo x402 (facturas por estado, payouts, payer) y la salud
 * del ERP, tal como los reporta el agente (x402_summary / erp_status).
 * Server-side; la sesión del panel es requisito de contexto.
 */
import { NextResponse } from "next/server";
import { API_GATEWAY_URL, auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json(
      { ok: false, error: "Sin sesión. Vuelve a iniciar sesión." },
      { status: 401 },
    );
  }
  try {
    const res = await fetch(`${API_GATEWAY_URL}/modules`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as {
      modules?: { id?: string }[];
    } | null;
    const mods = data?.modules ?? [];
    const x402 = mods.find((m) => m.id === "x402-solana") ?? null;
    const erp = mods.find((m) => m.id === "erp-salud-kodetap") ?? null;
    return NextResponse.json({ ok: x402 !== null, x402, erp });
  } catch {
    return NextResponse.json(
      { ok: false, error: "La API no responde. ¿Está corriendo el gateway (:8080)?" },
      { status: 502 },
    );
  }
}
