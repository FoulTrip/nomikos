import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// URL de la API Gateway (agent-os-api). Es la única fuente para ERP, modelo 3D y Solana.
const API_GATEWAY_URL = (process.env.API_GATEWAY_URL ?? "http://localhost:8080/api").replace(
  /\/+$/,
  ""
);

// GET /api/erp/status → { ok, running, url }
// Proxy a agent-os-api, que es quien consulta Medusa.js.
export async function GET() {
  try {
    const res = await fetch(`${API_GATEWAY_URL}/erp/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    const data = await res.json();
    return NextResponse.json({ ok: true, running: data.running ?? false, url: API_GATEWAY_URL });
  } catch {
    // Sin respuesta / timeout / conexión rechazada → no está corriendo.
    return NextResponse.json({ ok: true, running: false, url: API_GATEWAY_URL });
  }
}
