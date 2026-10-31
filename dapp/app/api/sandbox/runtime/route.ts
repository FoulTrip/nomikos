import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const API_GATEWAY_URL = (
  process.env.API_GATEWAY_URL ?? "http://localhost:8080/api"
).replace(/\/+$/, "");
const BRAIN_URL = (process.env.BRAIN_URL ?? "http://localhost:8322").replace(
  /\/+$/,
  "",
);

async function isReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function isModelReady(): Promise<boolean> {
  try {
    const response = await fetch(`${API_GATEWAY_URL}/device/model`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const ready =
      response.ok &&
      response.headers.get("content-type")?.includes("model/gltf-binary") === true;
    await response.body?.cancel();
    return ready;
  } catch {
    return false;
  }
}

export async function GET() {
  const [apiReady, brainReady, modelReady] = await Promise.all([
    isReady(`${API_GATEWAY_URL}/health`),
    isReady(`${BRAIN_URL}/v1/health`),
    isModelReady(),
  ]);

  return Response.json({
    docker: process.env.NOMIKOS_RUNTIME === "docker",
    apiReady,
    brainReady,
    modelReady,
  });
}

export async function POST() {
  if (process.env.NOMIKOS_RUNTIME !== "docker") {
    return Response.json(
      { ok: false, error: "Docker runtime no detectado" },
      { status: 409 },
    );
  }

  const session = await auth();
  if (!session?.accessToken) {
    return Response.json(
      { ok: false, error: "Inicia sesión para preparar el simulador" },
      { status: 401 },
    );
  }

  if (await isModelReady()) {
    return Response.json({ ok: true, alreadyReady: true });
  }

  try {
    const response = await fetch(`${API_GATEWAY_URL}/device/model/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return Response.json(
        body ?? { ok: false, error: `API respondió HTTP ${response.status}` },
        { status: response.status },
      );
    }
    return Response.json(body ?? { ok: true });
  } catch {
    return Response.json(
      { ok: false, error: "No se pudo preparar el modelo a través de la API" },
      { status: 502 },
    );
  }
}
