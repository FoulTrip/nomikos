/**
 * Proxy al gateway agéntico (brain :8322) operando como la CUENTA:
 * adjunta el Bearer guardado en la sesión Auth.js (regla #4 del
 * workspace: la identidad vive en api, el dapp solo la transporta).
 *
 * Con Bearer válido brain resuelve el contexto de la cuenta (LLM, red,
 * wallet dPaaS) — el mismo flujo que valida tests/06: tool protegida →
 * 402 → firma delegada → reintento, con shields Llama Guard in/out.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // flujo agéntico real: LLM + tools + x402 (≈195 s en E2E 06)

const BRAIN_URL = (process.env.BRAIN_URL ?? "http://localhost:8322").replace(
  /\/+$/,
  "",
);
const DEVICE_ID = "ESP32-S3-Touch-AMOLED-1.43";

interface GatewayBody {
  ok?: boolean;
  reply?: string;
  error?: string;
  [key: string]: unknown;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json(
      { ok: false, error: "Sin sesión. Vuelve a iniciar sesión." },
      { status: 401 },
    );
  }

  let text = "";
  try {
    const body = (await req.json()) as { text?: string };
    text = String(body.text ?? "").trim();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cuerpo JSON inválido" },
      { status: 400 },
    );
  }
  if (!text)
    return NextResponse.json({ ok: false, error: "Texto vacío" }, { status: 400 });

  try {
    const res = await fetch(`${BRAIN_URL}/v1/agentic-gateway`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ device_id: DEVICE_ID, text }),
      cache: "no-store",
      signal: AbortSignal.timeout(240_000),
    });

    const data = (await res.json().catch(() => null)) as GatewayBody | null;
    if (!data) {
      return NextResponse.json(
        { ok: false, error: `brain respondió HTTP ${res.status} sin JSON` },
        { status: 502 },
      );
    }

    // La sesión local expiró/revocó en api antes que la cookie del dapp:
    if (res.status === 401) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La sesión de la API ya no es válida (token revocado o expirado). Vuelve a iniciar sesión.",
        },
        { status: 401 },
      );
    }

    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json(
      {
        ok: false,
        error: timeout
          ? "El gateway agéntico tardó demasiado en responder."
          : "brain (:8322) no disponible.",
      },
      { status: 502 },
    );
  }
}
