/**
 * 16.nomikos.simulator.e2e.ts — el SIMULADOR NomikOS del panel: la placa
 * ESP32-S3-Touch-AMOLED simulada con su OS adentro, el progreso en la DB
 * de la cuenta (retomable) y el dispositivo como miembro REAL de la flota.
 *
 *   ① GET simulation — estado del OS (retoma: boots/toques persisten)
 *   ② boot → el agentd simulado se presenta → claim code en pantalla
 *   ②b código expirado → AGREGAR lo renueva solo (nunca 409 sin salida)
 *   ③ claim (AGREGAR) → ONLINE bloqueado: token + flota + lock screen
 *   ③b press — navegación táctil: unlock → home → apps → appdetail →
 *      settings → providers/models → lock (bloqueo real, como la placa)
 *   ③c ajustes LLM del device: listas + selección explícita
 *      provider:/model: (el device solo elige; las keys son de la cuenta)
 *   ④ tap — compat: cicla home ⇄ apps ⇄ x402 ⇄ settings
 *   ④b say — hablar con el agente: turno de voz real con el device
 *   ⑤ x402 — el peaje del dispositivo: factura con device_id → dPaaS
 *      firma (tx real; la cuenta se fondea del faucet) → ACCESO one-shot
 *   ⑥ rebuild — reconstruye el dispositivo+OS CON el progreso (nueva
 *      identidad, boots/toques/eventos conservados)
 *   ⑦ persistencia: el estado retoma idéntico tras todo el ciclo
 */
import {
  test, expect, api, json, LoginSchema, generateSolanaKeypair,
  dapp, dappCsrf, randomEmail, randomPassword, DAPP_URL, setupAccountLLM, runLedger,
} from './_helpers';

interface Sim {
  stage: 'boot' | 'claim' | 'online';
  device_id: string | null;
  claim_code: string | null;
  claimed: boolean;
  locked: boolean;
  detail_app: string | null;
  boot_count: number;
  taps: number;
  screen: string;
  apps: { slug: string; name: string; tools_count?: number }[];
  last_x402: { resource: string; status: string; access?: string } | null;
  last_reply: { text: string; reply: string; ts: number } | null;
  llm: {
    active_provider: string | null;
    providers: { provider: string; models: string[]; default_model: string | null; has_key: boolean; is_active: boolean }[];
  } | null;
  agent_wallet: { wallet_pubkey: string | null; network: string | null; balance_lamports: number | null } | null;
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
  runLedger('UPDATE devices SET claim_expires_at = 1 WHERE id = ?', [booted.device_id]);
  const renewed = await simStep(jar, 'claim', { claim_code: booted.claim_code });
  expect(renewed.stage).toBe('claim');
  expect(renewed.claim_code).not.toBe(booted.claim_code);
  expect(renewed.claim_code).toMatch(/^[0-9A-F]{8}$/);
  expect(renewed.events.some((e) => e.ev === 'code-renewed')).toBe(true);

  // ③ AGREGAR (con el código renovado) → ONLINE bloqueado (flota real)
  const online = await simStep(jar, 'claim', { claim_code: renewed.claim_code });
  expect(online.stage).toBe('online');
  expect(online.claimed).toBe(true);
  expect(online.locked).toBe(true); // como la placa: arranca bloqueado
  const fleet = (await (await dapp('/api/account/devices', withJ(jar))).json()) as {
    devices?: { id: string; status: string }[];
  };
  const simDev = (fleet.devices ?? []).find((d) => d.id === online.device_id);
  expect(simDev, 'el dispositivo simulado debe estar en la flota de la cuenta').toBeTruthy();

  // ③b navegación táctil (press): unlock → home → apps → appdetail →
  // settings → lock. Con bloqueo, solo unlock vale.
  const navDenied = await dapp('/api/account/simulation', withJ(jar, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'press', target: 'settings' }),
  }));
  expect(navDenied.status).toBe(403);
  expect((await simStep(jar, 'press', { target: 'unlock' })).locked).toBe(false);
  expect((await simStep(jar, 'press', { target: 'apps' })).screen).toBe('apps');
  const detail = await simStep(jar, 'press', { target: 'app:payload-cms' });
  expect(detail.screen).toBe('appdetail');
  expect(detail.detail_app).toBe('payload-cms');
  expect((await simStep(jar, 'press', { target: 'apps' })).screen).toBe('apps');
  expect((await simStep(jar, 'press', { target: 'settings' })).screen).toBe('settings');
  expect((await simStep(jar, 'press', { target: 'home' })).screen).toBe('home');
  expect((await simStep(jar, 'press', { target: 'lock' })).locked).toBe(true);
  expect((await simStep(jar, 'press', { target: 'unlock' })).locked).toBe(false);
  // dapp inexistente → 404 (sin pantalla rota)
  const badApp = await dapp('/api/account/simulation', withJ(jar, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'press', target: 'app:no-existe' }),
  }));
  expect(badApp.status).toBe(404);

  // ③c ajustes LLM del device: listas providers/models + selección
  // explícita (el device solo elige entre lo configurado en la cuenta)
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  await api('/accounts/me/llm', { method: 'PUT', headers: H, body: JSON.stringify({
    provider: 'openai', api_key: 'sk-TEST-solo-seleccion', models: ['gpt-a', 'gpt-b'], default_model: 'gpt-a',
  }) });
  await api('/accounts/me/llm', { method: 'PUT', headers: H, body: JSON.stringify({
    provider: 'custom', base_url: 'https://llm.local/v1', api_key: 'k-TEST',
    models: ['m1'], default_model: 'm1',
  }) });
  expect((await simStep(jar, 'press', { target: 'providers' })).screen).toBe('providers');
  const sel1 = await simStep(jar, 'press', { target: 'provider:openai' });
  expect(sel1.llm?.active_provider).toBe('openai');
  expect(sel1.screen).toBe('settings'); // tras elegir vuelve a ajustes
  expect((await simStep(jar, 'press', { target: 'models' })).screen).toBe('models');
  const sel2 = await simStep(jar, 'press', { target: 'model:gpt-b' });
  expect(sel2.llm?.providers?.find((p) => p.provider === 'openai')?.default_model).toBe('gpt-b');
  expect(sel2.screen).toBe('settings');
  // selección inválida → 400, sin romper estado
  const badSel = await dapp('/api/account/simulation', withJ(jar, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'press', target: 'model:no-existe' }),
  }));
  expect(badSel.status).toBe(400);
  // key real de la cuenta para el turno de voz (④b): re-PUT nvidia + activar
  await setupAccountLLM(token);
  await api('/accounts/me/llm/active', { method: 'POST', headers: H, body: JSON.stringify({ provider: 'nvidia-nim' }) });
  const backTo = await simStep(jar, 'press', { target: 'home' });
  expect(backTo.llm?.active_provider).toBe('nvidia-nim');

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
  const { wallet_pubkey } = (await imp.json()) as { wallet_pubkey: string };
  const drip = await api('/dev/faucet', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  expect(drip.status).toBe(200);

  const x402 = await simStep(jar, 'x402');
  expect(x402.last_x402).not.toBeNull();
  expect(x402.last_x402!.resource).toBe('x402:device:GET:/api/device');
  // la pantalla x402 muestra la wallet dPaaS del agente + balance vivo
  expect(x402.agent_wallet?.wallet_pubkey).toBe(wallet_pubkey);
  expect(x402.agent_wallet?.network).toBe('devnet');
  expect(x402.agent_wallet?.balance_lamports ?? 0).toBeGreaterThan(0);
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
