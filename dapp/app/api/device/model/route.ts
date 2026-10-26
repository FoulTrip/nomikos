import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// URL de la API Gateway (agent-os-api). Es la única fuente para el modelo 3D.
const API_GATEWAY_URL = (process.env.API_GATEWAY_URL ?? "http://localhost:8080/api").replace(
  /\/+$/,
  "");

// GET /api/device/model → proxy a agent-os-api, que sirve el GLB desde Cloudflare R2.
export async function GET() {
  try {
    const res = await fetch(`${API_GATEWAY_URL}/device/model`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const bytes = await res.arrayBuffer();
    return new NextResponse(bytes, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "model/gltf-binary",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "No se pudo obtener el modelo 3D de la API Gateway" },
      { status: 502 }
    );
  }
}
