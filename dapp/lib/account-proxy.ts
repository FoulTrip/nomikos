/**
 * account-proxy.ts — forward server-side del panel a `api` con el Bearer
 * de la sesión Auth.js (regla #4: la identidad vive en api, el dapp la
 * transporta; el navegador nunca ve el token).
 */
import { NextResponse } from "next/server";
import { API_GATEWAY_URL, auth } from "@/auth";

export async function forwardToApi(
  path: string,
  init: RequestInit = {},
  body?: unknown,
  timeoutMs = 10_000,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json(
      { ok: false, error: "Sin sesión. Vuelve a iniciar sesión." },
      { status: 401 },
    );
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  try {
    const res = await fetch(`${API_GATEWAY_URL}${path}`, {
      ...init,
      headers,
      body: body !== undefined ? JSON.stringify(body) : init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "La API no responde. ¿Está corriendo el gateway (:8080)?" },
      { status: 502 },
    );
  }
}
