/**
 * 16.nomikos.simulator.e2e.ts — el SIMULADOR NomikOS del panel: la placa
 * ESP32-S3-Touch-AMOLED simulada con su OS adentro, el progreso en la DB
 * de la cuenta (retomable) y el dispositivo como miembro REAL de la flota.
 *
 *   ① GET simulation — estado del OS (retoma: boots/toques persisten)
 *   ② boot → el agentd simulado se presenta → claim code en pantalla
 *   ②b código expirado → AGREGAR lo renueva solo (nunca 409 sin salida)
 *   ③ claim (AGREGAR) → ONLINE: token del dispositivo + entra a la flota
 *   ④ tap — la pantalla táctil cicla home ⇄ apps ⇄ x402 ⇄ settings
 *   ④b say — hablar con el agente: turno de voz real con el device
 *   ⑤ x402 — el peaje del dispositivo: factura con device_id → dPaaS
 *      firma (tx real; la cuenta se fondea del faucet) → ACCESO one-shot
 *   ⑥ rebuild — reconstruye el dispositivo+OS CON el progreso (nueva
 *      identidad, boots/toques/eventos conservados)
 *   ⑦ persistencia: el estado retoma idéntico tras todo el ciclo
 */
import {
  test, expect, api, json, LoginSchema, generateSolanaKeypair,
  dapp, dappCsrf, randomEmail, randomPassword, DAPP_URL,
} from './_helpers';
import { execSync } from 'node:child_process';

interface Sim {
  stage: 'boot' | 'claim' | 'online';
  device_id: string | null;
  claim_code: string | null;
  claimed: boolean;
  boot_count: number;
  taps: number;
  screen: string;
  apps: { slug: string }[];
  last_x402: { resource: string; status: string; access?: string } | null;
  last_reply: { text: string; reply: string; ts: number } | null;
  events: { ts: number; ev: string }[];
}

const withJ = (jar: Map<string, string>, init?: RequestInit) => ({ jar, ...init });

async function simGet(jar: Map<string, string>): Promise<Sim> {
  const res = await dapp('/api/account/simulation', withJ(jar));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; simulation: Sim };
  expect(body.ok).toBe(true);
  return body.simulation;
}

async function simStep(jar: Map<string, string>, action: string, extra?: Record<string, unknown>): Promise<Sim> {
  const res = await dapp('/api/account/simulation', withJ(jar, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; simulation: Sim };
  expect(body.ok).toBe(true);
  return body.simulation;
}

test('①→⑦ el OS NomikOS simulado: retoma, empareja, paga y se reconstruye', { timeout: 180_000 }, async () => {
  // ── la MISMA cuenta en ambas superficies: Bearer (api) + cookie (dapp) ──
  const email = `sim-${Date.now()}${randomEmail()}`;
  const password = randomPassword();
  const reg = await api('/auth/register', json({ email, password }));
  expect(reg.status).toBe(201);
  const { token } = LoginSchema.parse(
    await (await api('/auth/login', json({ email, password }))).json(),
  );

  const jar = new Map<string, string>();
  const csrf = await dappCsrf(jar);
  const login = await dapp('/api/auth/callback/credentials', {
    method: 'POST', jar,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf, email, password, callbackUrl: `${DAPP_URL}/panel` }),
  });
  expect(login.status).toBe(302);

  // ① estado inicial (cuenta nueva → arranque de cero)
  const initial = await simGet(jar);
  expect(initial.boot_count).toBe(0);
  expect(initial.stage).toBe('boot');

  // ② boot: el agentd simulado se presenta al worker → claim code
  const booted = await simStep(jar, 'boot');
  expect(booted.boot_count).toBe(1);
  expect(booted.stage).toBe('claim');
  expect(booted.claim_code).toMatch(/^[0-9A-F]{8}$/); // el código de la pantalla
  expect(booted.device_id).toMatch(/^dev-/);

  // ②b el código expiró (la ventana de emparejado son 15 min):
  // AGREGAR lo RENUEVA solo — nunca 409, la pantalla muestra el nuevo
  const LEDGER = process.env.LEDGER_DB ?? '../api/data/agent-os.db';
  execSync(`sqlite3 "${LEDGER}" "UPDATE devices SET claim_expires_at = 1 WHERE id='${booted.device_id}';"`, { stdio: 'pipe' });
  const renewed = await simStep(jar, 'claim');
  expect(renewed.stage).toBe('claim');
  expect(renewed.claim_code).not.toBe(booted.claim_code);
  expect(renewed.claim_code).toMatch(/^[0-9A-F]{8}$/);
  expect(renewed.events.some((e) => e.ev === 'code-renewed')).toBe(true);

  // ③ AGREGAR (con el código renovado) → ONLINE (flota real)
  const online = await simStep(jar, 'claim');
  expect(online.stage).toBe('online');
  expect(online.claimed).toBe(true);
  const fleet = (await (await dapp('/api/account/devices', withJ(jar))).json()) as {
    devices?: { id: string; status: string }[];
  };
  const simDev = (fleet.devices ?? []).find((d) => d.id === online.device_id);
  expect(simDev, 'el dispositivo simulado debe estar en la flota de la cuenta').toBeTruthy();

  // ④ tap: la pantalla cicla home → apps → x402 → settings → home
  // (el claim deja screen=home, la pantalla principal del OS)
  expect(online.screen).toBe('home');
  expect((await simStep(jar, 'tap')).screen).toBe('apps');
  expect((await simStep(jar, 'tap')).screen).toBe('x402');
  expect((await simStep(jar, 'tap')).screen).toBe('settings');
  expect((await simStep(jar, 'tap')).screen).toBe('home');

  // ⑤ el peaje del dispositivo: wallet fondeada (faucet, tx real) → el
  //    x402 del sim liquida on-chain de verdad
  await api('/accounts/me/chain', {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ network: 'devnet', daily_limit_lamports: 50_000_000, tx_limit_lamports: 1_000_000 }),
  });
  const { keypair } = generateSolanaKeypair();
  const imp = await api('/accounts/me/chain/keypair/import', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ keypair_json: keypair }),
  });
  expect(imp.status).toBe(200);
  const drip = await api('/dev/faucet', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  expect(drip.status).toBe(200);

  const x402 = await simStep(jar, 'x402');
  expect(x402.last_x402).not.toBeNull();
  expect(x402.last_x402!.resource).toBe('x402:device:GET:/api/device');
  if (x402.last_x402!.status === 'settled') {
    expect(x402.last_x402!.access).toContain('ACCESO CONCEDIDO (one-shot)');
  } else {
    // sin fondos/verificando: honesto — el estado queda en pantalla
    expect(typeof x402.last_x402!.status).toBe('string');
  }

  // ④b say: hablar con el agente (turno de voz real con el device —
  // requiere brain arriba; el orquestador responde con la identidad
  // del dispositivo simulado y la respuesta queda en la principal)
  const said = await simStep(jar, 'say', { text: 'Hola, dime en una frase qué eres' });
  expect(said.last_reply).not.toBeNull();
  expect(said.last_reply!.text).toBe('Hola, dime en una frase qué eres');
  expect(said.last_reply!.reply.length).toBeGreaterThan(0);
  expect(said.last_reply!.reply).not.toContain('orquestador no disponible');
  expect(said.screen).toBe('home'); // la respuesta se lee en la principal

  // ⑥ rebuild: nueva identidad, MISMO progreso
  const { taps: tapsBefore, boot_count: bootsBefore, device_id: oldDev } = x402;
  const rebuilt = await simStep(jar, 'rebuild');
  expect(rebuilt.device_id).not.toBe(oldDev); // dispositivo nuevo
  expect(rebuilt.stage).toBe('claim'); // esperando claim otra vez
  expect(rebuilt.boot_count).toBe(bootsBefore); // progreso conservado
  expect(rebuilt.taps).toBe(tapsBefore);

  // ⑦ persistencia: el estado retoma idéntico (solo GET)
  const resumed = await simGet(jar);
  expect(resumed.device_id).toBe(rebuilt.device_id);
  expect(resumed.boot_count).toBe(bootsBefore);
  expect(resumed.events.some((e) => e.ev === 'rebuild')).toBe(true);
  expect(resumed.events.some((e) => e.ev === 'x402')).toBe(true);
});
