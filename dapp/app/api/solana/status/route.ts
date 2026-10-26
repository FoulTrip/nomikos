import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { homedir } from "os";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** URL base de la API Gateway (agent-os-api) — fuente única de verdad para las URLs RPC de Solana. */
const AGENT_OS_API_URL = (process.env.API_GATEWAY_URL ?? "http://localhost:8080/api").replace(
  /\/+$/,
  ""
);

/** Obtiene las URLs RPC de Solana por red desde agent-os-api. */
async function fetchSolanaUrls(): Promise<Record<string, string>> {
  const res = await fetch(`${AGENT_OS_API_URL}/config/solana/urls`, {
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`agent-os-api /api/config/solana/urls: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok || typeof data.urls !== "object" || data.urls === null) {
    throw new Error("agent-os-api respondió sin mapa de URLs de Solana");
  }
  const urls: Record<string, string> = {};
  for (const [network, url] of Object.entries(data.urls)) {
    urls[network] = String(url).replace(/\/+$/, "");
  }
  return urls;
}

/** Una llamada JSON-RPC al cluster, con timeout corto. */
async function rpc(endpoint: string, method: string, params: unknown[] = []) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(String(data.error.message ?? "error RPC"));
  return data.result;
}

/* ---------------- Wallet local (CLI de Solana) ---------------- */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Codificación base58 (el alfabeto de las pubkeys de Solana). */
function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  const digits: number[] = []; // little-endian
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

/** Pubkey de un keypair JSON del CLI (los últimos 32 bytes del array). */
async function pubkeyFromKeypair(file: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(raw) || raw.length < 64) return null;
    return base58Encode(Uint8Array.from(raw).slice(32));
  } catch {
    return null;
  }
}

/** Expande un "~" inicial al home real. */
function expandHome(p: string): string {
  return p.startsWith("~/") ? path.join(homedir(), p.slice(2)) : p;
}

/** keypair_path declarado en ~/.config/solana/cli/config.yml (YAML plano). */
async function keypairPathFromCliConfig(): Promise<string | null> {
  try {
    const yml = await readFile(
      path.join(homedir(), ".config", "solana", "cli", "config.yml"),
      "utf8"
    );
    const m = yml.match(/^keypair_path:\s*['"]?([^'"\s]+)['"]?\s*$/m);
    return m ? m[1] : null;
  } catch {
    return null; // sin config del CLI
  }
}

// La wallet no cambia en cada sondeo: se resuelve como máximo 1 vez por minuto.
let walletCache: { pub: string | null; at: number } | null = null;
const WALLET_TTL = 60_000;

/**
 * Wallet cuyo saldo se muestra: SOLANA_WALLET (pubkey o ruta al keypair
 * JSON) o, por defecto, la del CLI local (config.yml → keypair_path,
 * con fallback al id.json por defecto).
 */
async function resolveWallet(): Promise<string | null> {
  if (walletCache && Date.now() - walletCache.at < WALLET_TTL) return walletCache.pub;

  let pub: string | null = null;
  const env = process.env.SOLANA_WALLET?.trim();
  if (env) {
    pub =
      env.includes("/") || env.endsWith(".json")
        ? await pubkeyFromKeypair(expandHome(env))
        : env; // pubkey directa
  } else {
    const keypair =
      (await keypairPathFromCliConfig()) ??
      path.join(homedir(), ".config", "solana", "id.json");
    pub = await pubkeyFromKeypair(expandHome(keypair));
  }

  walletCache = { pub, at: Date.now() };
  return pub;
}

// GET /api/solana/status?network=local|devnet|testnet|mainnet
// → { ok, running, network, endpoint, version?, slot?, wallet?, balance? }
// running = true si el cluster responde a getVersion.
// balance = saldo de la wallet local en esa red, en lamports (null si no aplica).
export async function GET(req: Request) {
  const network = new URL(req.url).searchParams.get("network") ?? "devnet";
  let urls: Record<string, string>;
  try {
    urls = await fetchSolanaUrls();
  } catch {
    return NextResponse.json(
      { ok: false, error: "No se pudieron obtener las URLs RPC de Solana de agent-os-api" },
      { status: 502 }
    );
  }
  const endpoint = urls[network];
  if (!endpoint) {
    return NextResponse.json(
      { ok: false, error: "Red Solana desconocida" },
      { status: 400 }
    );
  }

  try {
    const version = await rpc(endpoint, "getVersion");
    const wallet = await resolveWallet();

    // Slot y balance son informativos: si fallan no cambian el estado.
    const [slot, balance] = await Promise.all([
      rpc(endpoint, "getSlot", [{ commitment: "confirmed" }]).catch(() => null),
      wallet
        ? rpc(endpoint, "getBalance", [wallet, { commitment: "confirmed" }]).catch(
            () => null
          )
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ok: true,
      running: true,
      network,
      endpoint,
      version: version?.["solana-core"] ?? null,
      slot: typeof slot === "number" ? slot : null,
      wallet,
      balance: typeof balance?.value === "number" ? balance.value : null,
    });
  } catch {
    // Sin respuesta / timeout / conexión rechazada → no está corriendo.
    return NextResponse.json({ ok: true, running: false, network, endpoint });
  }
}
