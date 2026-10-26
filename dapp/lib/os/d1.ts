/* Persistencia del OS en Cloudflare D1 (SQLite serverless).
 *
 * Base: hackaton-meta-db · Region ENAM
 *   - Cuenta:  0964e70b52f328d3bb21ec13eeedad43 (no es secreta)
 *   - Database ID: c476d348-6598-4a37-9e21-8e8cb446fb9e
 *
 * Credenciales (orden de prioridad):
 *   1. CLOUDFLARE_D1_TOKEN en .env.local — token de API con permiso D1:Edit
 *      (dash.cloudflare.com → My Profile → API Tokens → Create Token)
 *   2. El login de wrangler de esta máquina (~/.config/.wrangler/config),
 *      que se refresca solo cuando ejecutas cualquier comando wrangler.
 *
 * Sin credenciales o si falla la API, el OS sigue funcionando en memoria
 * (comportamiento anterior): D1 es persistencia best-effort, nunca bloquea.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "0964e70b52f328d3bb21ec13eeedad43";
const DATABASE_ID =
  process.env.D1_DATABASE_ID?.trim() || "c476d348-6598-4a37-9e21-8e8cb446fb9e";

const D1_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

const WRANGLER_CONFIG = path.join(
  os.homedir(),
  ".config",
  ".wrangler",
  "config",
  "default.toml"
);

// caché del token de wrangler (30s) para no leer el archivo en cada consulta
let wranglerTokenCache: { token: string; at: number } | null = null;
const WRANGLER_CACHE_MS = 30_000;

function resolveToken(): string | null {
  // 1) token de API dedicado
  const envToken = process.env.CLOUDFLARE_D1_TOKEN?.trim();
  if (envToken) return envToken;

  // 2) login de wrangler en esta máquina
  if (
    wranglerTokenCache &&
    Date.now() - wranglerTokenCache.at < WRANGLER_CACHE_MS
  ) {
    return wranglerTokenCache.token;
  }
  try {
    const toml = fs.readFileSync(WRANGLER_CONFIG, "utf8");
    const m = toml.match(/^oauth_token\s*=\s*"([^"]+)"/m);
    if (m) {
      wranglerTokenCache = { token: m[1], at: Date.now() };
      return m[1];
    }
  } catch {
    /* sin wrangler en esta máquina */
  }
  return null;
}

export function d1Enabled(): boolean {
  return resolveToken() !== null;
}

/**
 * Ejecuta una consulta contra D1 vía REST.
 * Devuelve las filas, o null si D1 no está disponible (modo memoria).
 */
export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<T[] | null> {
  const token = resolveToken();
  if (!token) return null;
  try {
    const res = await fetch(D1_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.errors?.[0]?.message || "D1: respuesta sin success");
    }
    return (data.result?.[0]?.results ?? []) as T[];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[d1] modo memoria (", msg.slice(0, 120), ")");
    return null;
  }
}

/** Igual que d1Query pero ignora el resultado (INSERT/UPDATE/DELETE). */
export async function d1Exec(
  sql: string,
  params: (string | number | null)[] = []
): Promise<boolean> {
  const rows = await d1Query(sql, params);
  return rows !== null;
}
