/**
 * _helpers.ts — infraestructura compartida de la suite E2E.
 *
 * Modularidad: cliente único + schemas zod (contratos de la API).
 * Mantenibilidad: URLs desde env, fixtures con setup/teardown.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test as base, expect } from 'e2e';
import { z } from 'zod';

// ── URLs del ecosistema (env override para CI/despliegues) ──
export const API_URL = process.env.API_URL ?? 'http://localhost:8080/api';
export const BRAIN_URL = process.env.BRAIN_URL ?? 'http://localhost:8322';
const LEDGER_DB = process.env.LEDGER_DB ?? '../api/data/agent-os.db';

// ── Cliente fetch con prefijo y helpers de aserción ──
export async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, init);
}

export async function brain(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BRAIN_URL}${path}`, init);
}

export const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const auth = (token: string): RequestInit => ({
  method: 'GET',
  headers: { Authorization: `Bearer ${token}` },
});

// ── Contratos (zod): la suite falla si la API deja de cumplirlos ──
export const HealthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  version: z.string(),
  device: z.string(),
  modules: z.object({
    erp_medusa: z.string(), // URL del ERP (Payload CMS)
    x402_solana: z.string(),
    cloudflare_r2: z.boolean(),
  }),
});

export const RegisterSchema = z.object({
  ok: z.boolean(),
  account_id: z.string().startsWith('acc-'),
  email: z.string().email(),
});

export const LoginSchema = z.object({
  ok: z.boolean(),
  account_id: z.string().startsWith('acc-'),
  token: z.string().min(32),
  token_type: z.literal('Bearer'),
  expires_at: z.number().int().positive(),
});

export const InvoiceSchema = z.object({
  id: z.string().startsWith('x402-'),
  resource: z.string(),
  amount_lamports: z.number().int().positive(),
  payee: z.string().min(32),
  status: z.enum(['pending', 'verifying', 'settled', 'failed']),
  account_id: z.string(),
  consumed_at: z.number().int().nullable(),
  device_id: z.string().nullable(),
  execution_environment: z.enum(['production', 'sandbox']),
  network: z.enum(['local', 'devnet', 'testnet', 'mainnet']),
  pay_hint: z.string(),
});

export const PaymentRequiredSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  invoice: InvoiceSchema,
  how: z.array(z.string()).min(3),
});

export const ContextSchema = z.object({
  ok: z.boolean(),
  account: z.object({ id: z.string(), email: z.string() }),
  llm: z
    .object({
      provider: z.string(),
      base_url: z.string().url(),
      api_key: z.string(),
      models: z.array(z.string()).min(1),
      default_model: z.string(),
    })
    .nullable(),
  chain: z
    .object({
      network: z.enum(['local', 'devnet', 'testnet', 'mainnet']),
      wallet_pubkey: z.string().nullable(),
      payee: z.string().nullable(),
      payer_configured: z.boolean(),
      daily_limit_lamports: z.number().int().nullable(),
      tx_limit_lamports: z.number().int().nullable(),
    })
    .nullable(),
  wallets: z.array(z.object({ label: z.string(), pubkey: z.string() })),
});

export const GatewayResponseSchema = z.object({
  ok: z.boolean(),
  reply: z.string(),
  tools_used: z.array(z.string()),
  shield_in: z.object({ verdict: z.enum(['safe', 'unsafe', 'unknown', 'disabled']), categories: z.array(z.string()) }),
  shield_out: z.object({ verdict: z.enum(['safe', 'unsafe', 'unknown', 'disabled']), categories: z.array(z.string()) }),
  x402: z.array(
    z.object({
      status: z.enum(['skipped', 'settled', 'verifying', 'manual', 'failed', 'replay']),
      invoice_id: z.string().nullable(),
      tx_signature: z.string().nullable(),
    }),
  ),
  account: z.object({
    id: z.string().optional(),
    email: z.string().optional(),
  }),
  backend: z.string(),
  model: z.string(),
  iterations: z.number().int().positive(),
});

// ── Utilidades ──
export const randomEmail = () =>
  `qa+${Date.now().toString(36)}${randomBytes(4).toString('hex')}@tripkode.dev`;

export const randomPassword = () => `qa-${randomBytes(9).toString('base64url')}`;

/** Keypair de Solana VÁLIDO (seed ed25519 + pubkey derivada) en formato id.json
 *  ([seed(32) ‖ pubkey(32)]) — generado con crypto de Node, sin dependencias. */
export function generateSolanaKeypair(): { keypair: number[]; pubkey: string } {
  // pkcs8 DER de ed25519: 16 bytes header + seed(32). spki: 12 bytes + pubkey(32).
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const der = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const seed = der.subarray(der.length - 32);
  const pub = spki.subarray(spki.length - 32);
  const kp = [...seed, ...pub];
  return { keypair: kp, pubkey: Buffer.from(pub).toString('base64') };
}

/** Confirma una factura on-chain simulando al settler (SQLite local).
 *  Solo para pruebas de integración: el flujo real lo hace el settler_loop
 *  cuando la tx confirma en la red de la cuenta. */
export function settleInvoiceViaLedger(invoiceId: string): void {
  const sql = `UPDATE x402_invoices SET status='settled', confirmation_status='confirmed' WHERE id='${invoiceId}';`;
  execSync(`sqlite3 "${LEDGER_DB}" "${sql}"`, { stdio: 'pipe' });
}

/** Lee la api_key de NVIDIA NIM desde api/.env del workspace (sin hardcodear). */
export async function nvidiaKeyFromApiEnv(): Promise<string> {
  const envPath = path.resolve(process.cwd(), '../api/.env');
  // La credencial NIM vive en api/.env (regla #4: las credenciales LLM
  // viven en api) — respaldo: env del runner o dapp/credentials.json.
  try {
    const env = await readFile(envPath, 'utf8');
    const m = env.match(/^NVIDIA_API_KEY=(.+)$/m);
    if (m?.[1]?.trim()) return m[1].trim();
  } catch {
    /* sin api/.env → seguir con los respaldos */
  }
  const nvapi = process.env.NVIDIA_API_KEY;
  if (nvapi) return nvapi;
  const creds = path.resolve(process.cwd(), '../dapp/credentials.json');
  try {
    const raw = JSON.parse(await readFile(creds, 'utf8'));
    const entry = raw.find?.((c: { name: string }) => /nvidia/i.test(c.name));
    if (entry?.key) return entry.key;
  } catch {
    /* sin credentials.json */
  }
  throw new Error('Sin NVIDIA_API_KEY (env o dapp/credentials.json)');
}

/** Configura el LLM DE LA CUENTA (NIM real) — sin esto el agente no
 *  razona: no existe backend global, la cuenta trae sus keys. */
export async function setupAccountLLM(token: string, model = 'meta/muse-glimmer-30b'): Promise<void> {
  const nvKey = await nvidiaKeyFromApiEnv();
  const res = await api('/accounts/me/llm', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'nvidia-nim',
      api_key: nvKey,
      models: [model],
      default_model: model,
    }),
  });
  if (res.status !== 200) throw new Error(`setupAccountLLM: HTTP ${res.status} ${await res.text()}`);
}

// ── Fixture: cuenta efímera con login y teardown (logout) ──
export interface TestAccount {
  email: string;
  password: string;
  accountId: string;
  token: string;
}

export const test = base.extend<{ account: TestAccount }>({
  account: async ({}, use) => {
    const email = randomEmail();
    const password = randomPassword();
    const reg = await api('/auth/register', json({ email, password, display_name: 'QA Suite' }));
    if (reg.status !== 201) throw new Error(`register fixture: HTTP ${reg.status} ${await reg.text()}`);
    const login = await api('/auth/login', json({ email, password }));
    const { token, account_id } = LoginSchema.parse(await login.json());
    await use({ email, password, accountId: account_id, token });
    // teardown: revocar la sesión (best-effort)
    await api('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  },
});

export { expect };

// ── dapp (Next.js, default :3000) — cookie jar manual + sesión Auth.js ──
export const DAPP_URL = process.env.DAPP_URL ?? 'http://localhost:3000';

/** fetch al dapp con cookie jar manual (fetch de Node no guarda cookies). */
export async function dapp(path: string, init?: RequestInit & { jar?: Map<string, string> }) {
  const { jar, ...rest } = init ?? {};
  const headers = new Headers(rest.headers);
  if (jar?.size) headers.set('cookie', [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
  const res = await fetch(`${DAPP_URL}${path}`, { ...rest, headers, redirect: 'manual' });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair, ...attrs] = raw.split(';');
    const [name, value] = pair.split('=');
    const isDeletion = attrs.some((a) => a.trim().startsWith('Max-Age=0'));
    if (isDeletion) jar?.delete(name);
    else jar?.set(name, value);
  }
  return res;
}

/** CSRF de Auth.js (persiste su cookie en el jar). */
export async function dappCsrf(jar: Map<string, string>): Promise<string> {
  const res = await dapp('/api/auth/csrf', { jar });
  expect(res.status).toBe(200);
  return ((await res.json()) as { csrfToken: string }).csrfToken;
}

/** Sesión del dapp: login vía Auth.js con cuenta recién creada en el IdP. */
export async function dappLogin(): Promise<Map<string, string>> {
  const email = randomEmail();
  const password = randomPassword();
  const reg = await api('/auth/register', json({ email, password }));
  if (reg.status !== 201) throw new Error(`dappLogin register: HTTP ${reg.status}`);
  const jar = new Map<string, string>();
  const csrf = await dappCsrf(jar);
  const login = await dapp('/api/auth/callback/credentials', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf, email, password, callbackUrl: `${DAPP_URL}/panel` }),
  });
  if (login.status !== 302) throw new Error(`dappLogin login: HTTP ${login.status}`);
  return jar;
}

/** Path del header Location (el dev server de Next lo emite relativo). */
export function locationPath(res: Response, fallback = DAPP_URL): string {
  const loc = res.headers.get('location');
  return loc ? new URL(loc, fallback).pathname : '';
}
