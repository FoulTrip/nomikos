/**
 * 10.devices.fleet.e2e.ts — NomikOS Fase 1: flota de dispositivos.
 *
 * Ciclo de vida completo del dispositivo contra el api (y el agente):
 *
 *   ① enroll: la placa se presenta sin auth (board + pubkey ed25519) →
 *      device_id + claim_code (15 min) + enroll_secret (solo sha256 en DB)
 *   ② claim: la cuenta canjea el código → el device queda ligado a ella
 *   ③ token: la placa sondea con su enroll_secret → Bearer de dispositivo
 *      (sesión con device_id, TTL 30 días); antes del claim → 202
 *   ④ runtime: GET /devices/me + heartbeat (online/offline)
 *   ⑤ flota + límites dPaaS por dispositivo
 *   ⑥ x402: el peaje del dispositivo lleva account_id + device_id
 *   ⑦ el agente (brain) opera la flota con la tool fleet_status
 */
import {
  test, expect, api, json, auth, randomEmail, randomPassword, brain, LoginSchema,
  dapp, dappLogin, setupAccountLLM,
} from './_helpers';

/** Pubkey ed25519 válida (base58) para simular la identidad de la placa. */
const DEVICE_PUBKEY = '9EgkxJXATAppZgRViFFBNmhSeQbXj664zKV9ErCm6cVS';

const withH = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

/** Enrolla una placa y devuelve {device_id, claim_code, enroll_secret}. */
async function enroll(board = 'esp32-s3-amoled-143', name = 'ESP32 QA') {
  const res = await api('/devices/enroll', json({ board, name, pubkey: DEVICE_PUBKEY }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    device_id: string; claim_code: string; enroll_secret: string; claim_expires_at: number;
  };
  expect(body.claim_code).toMatch(/^[0-9A-F]{8}$/);
  expect(body.enroll_secret.length).toBeGreaterThan(20);
  return body;
}

test('①→⑥ ciclo completo: enroll → claim → token → runtime → flota → x402 con device_id', async ({ account }) => {
  const dev = await enroll();

  // ① sin claim: el token responde 202 (pendiente de emparejado)
  const pending = await api('/devices/token', json({ device_id: dev.device_id, enroll_secret: dev.enroll_secret }));
  expect(pending.status).toBe(202);

  // ② claim de OTRA cuenta no puede robar el código — solo el Bearer correcto
  expect((await api('/devices/claim', json({ code: dev.claim_code }))).status).toBe(401);

  const claim = await api('/devices/claim', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ code: dev.claim_code }) });
  expect(claim.status).toBe(200);
  const claimed = (await claim.json()) as { device: { account_id: string } };
  expect(claimed.device.account_id).toBe(account.accountId);

  // ②bis el código ya no es reutilizable por otra cuenta (claim atómico)
  const otherEmail = randomEmail();
  const otherPassword = randomPassword();
  await api('/auth/register', json({ email: otherEmail, password: otherPassword }));
  const otherLogin = await api('/auth/login', json({ email: otherEmail, password: otherPassword }));
  const otherTok = LoginSchema.parse(await otherLogin.json()).token;
  const reClaim = await api('/devices/claim', {
    method: 'POST', headers: withH(otherTok), body: JSON.stringify({ code: dev.claim_code }),
  });
  expect(reClaim.status).toBe(404);

  // ③ token del dispositivo (la placa sondea con su enroll_secret)
  const tokenRes = await api('/devices/token', json({ device_id: dev.device_id, enroll_secret: dev.enroll_secret }));
  expect(tokenRes.status).toBe(200);
  const dtok = (await tokenRes.json()) as { token: string; token_type: string; expires_at: number };
  expect(dtok.token_type).toBe('Bearer');
  expect(dtok.expires_at).toBeGreaterThan(Date.now());

  // ④ runtime con el Bearer de dispositivo
  const me = await api('/devices/me', auth(dtok.token));
  expect(me.status).toBe(200);
  const meDev = (await me.json()) as { device: { id: string; online: boolean; account_id: string } };
  expect(meDev.device.id).toBe(dev.device_id);
  expect(meDev.device.online).toBe(false); // aún sin heartbeat

  const hb = await api('/devices/me/heartbeat', { method: 'POST', headers: withH(dtok.token), body: JSON.stringify({ agent_version: 'agentd-0.1.0' }) });
  expect(hb.status).toBe(200);
  const hbDev = (await hb.json()) as { device: { status: string; online: boolean; agent_version: string } };
  expect(hbDev.device.status).toBe('online');
  expect(hbDev.device.online).toBe(true);
  expect(hbDev.device.agent_version).toBe('agentd-0.1.0');

  // ⑤ flota de la cuenta + límites dPaaS por dispositivo
  const fleet = await api('/devices', auth(account.token));
  const fleetBody = (await fleet.json()) as { count: number; devices: { id: string; online: boolean }[] };
  expect(fleetBody.count).toBe(1);
  expect(fleetBody.devices[0].id).toBe(dev.device_id);
  expect(fleetBody.devices[0].online).toBe(true);

  const limits = await api(`/devices/${dev.device_id}/limits`, {
    method: 'PUT', headers: withH(account.token),
    body: JSON.stringify({ daily_limit_lamports: 50_000_000, tx_limit_lamports: 1_000_000 }),
  });
  expect(limits.status).toBe(200);
  const limDev = (await limits.json()) as { device: { daily_limit_lamports: number; tx_limit_lamports: number } };
  expect(limDev.device.daily_limit_lamports).toBe(50_000_000);

  // ⑥ x402: el peaje del dispositivo lleva account_id + device_id
  const toll = await api('/device', auth(dtok.token));
  expect(toll.status).toBe(402);
  const inv = ((await toll.json()) as { invoice: { account_id: string; device_id: string; resource: string } }).invoice;
  expect(inv.account_id).toBe(account.accountId);
  expect(inv.device_id).toBe(dev.device_id); // atribuible a la placa
  expect(inv.resource).toBe('x402:path:/api/device');

  // y el mismo path con Bearer de CUENTA no lleva device_id
  const tollAcc = await api('/device', auth(account.token));
  const invAcc = ((await tollAcc.json()) as { invoice: { device_id: string | null } }).invoice;
  expect(invAcc.device_id).toBeNull();
});

test('validaciones: enroll inválido 422 · secret falso 401 · token de cuenta ≠ token de device 401 · flota aislada', async ({ account }) => {
  // body sin pubkey → 422 de axum
  const bad = await api('/devices/enroll', json({ board: 'x' }));
  expect(bad.status).toBe(422);

  // enroll_secret falso → 401
  const dev = await enroll();
  const fake = await api('/devices/token', json({ device_id: dev.device_id, enroll_secret: 'secreto-falso-123' }));
  expect(fake.status).toBe(401);

  // el token de CUENTA no sirve como token de dispositivo
  const asAccount = await api('/devices/me', auth(account.token));
  expect(asAccount.status).toBe(401);

  // claim de código inexistente → 404
  const ghost = await api('/devices/claim', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ code: 'DEADBEEF' }) });
  expect(ghost.status).toBe(404);

  // límites de un device de OTRA cuenta → 404 (aislamiento)
  const dev2 = await enroll('rpi4', 'Pi ajena');
  const notYours = await api(`/devices/${dev2.device_id}/limits`, {
    method: 'PUT', headers: withH(account.token),
    body: JSON.stringify({ daily_limit_lamports: 1 }),
  });
  expect(notYours.status).toBe(404);
});

test('nivel dapp (Fase 2 — modal Flota): proxies de flota con el Bearer de la sesión', async () => {
  const jar = await dappLogin();
  const H = { 'Content-Type': 'application/json' };

  // sin dispositivos → count 0
  const empty = await dapp('/api/account/devices', { jar });
  expect(empty.status).toBe(200);
  expect(((await empty.json()) as { count: number }).count).toBe(0);

  // la placa se presenta (enroll — lado del dispositivo, sin auth)
  const enr = await api('/devices/enroll', json({
    board: 'esp32-s3-amoled-143', name: 'ESP32 Panel', pubkey: DEVICE_PUBKEY,
  }));
  expect(enr.status).toBe(201);
  const { claim_code } = (await enr.json()) as { claim_code: string };

  // emparejar desde el panel (proxy con la sesión Auth.js)
  const claim = await dapp('/api/account/devices/claim', {
    method: 'POST', jar, headers: H,
    body: JSON.stringify({ code: claim_code }),
  });
  expect(claim.status).toBe(200);
  expect(((await claim.json()) as { device: { name: string } }).device.name).toBe('ESP32 Panel');

  // el panel lista la flota de la cuenta
  const fleet = await dapp('/api/account/devices', { jar });
  const fb = (await fleet.json()) as { count: number; devices: { name: string; online: boolean }[] };
  expect(fb.count).toBe(1);
  expect(fb.devices[0].name).toBe('ESP32 Panel');
  expect(fb.devices[0].online).toBe(false); // sin heartbeat aún

  // sin sesión → 401 (el Bearer de la cuenta nunca llega sin cookie)
  const noauth = await dapp('/api/account/devices/claim', {
    method: 'POST', headers: H,
    body: JSON.stringify({ code: 'AAAAAAAA' }),
  });
  expect(noauth.status).toBe(401);
});

test('⑦ el agente opera la flota: tool fleet_status con la cuenta', { timeout: 300_000, retries: 2 }, async ({ account }) => {
  // la cuenta necesita flota: enroll + claim + heartbeat
  const dev = await enroll('esp32-s3-amoled-143', 'ESP32 del QA');
  await api('/devices/claim', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ code: dev.claim_code }) });
  const dtok = (await (await api('/devices/token', json({ device_id: dev.device_id, enroll_secret: dev.enroll_secret }))).json()) as { token: string };
  await api('/devices/me/heartbeat', { method: 'POST', headers: withH(dtok.token), body: JSON.stringify({}) });

  // la cuenta trae SU key (sin fallback global, el agente la exige)
  await setupAccountLLM(account.token);

  const gw = await brain('/v1/agentic-gateway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({
      device_id: 'ESP32-S3-Touch-AMOLED-1.43',
      text: '¿Cómo está mi flota de dispositivos? Usa la herramienta fleet_status.',
    }),
  });
  expect(gw.status).toBe(200);
  const body = (await gw.json()) as { ok: boolean; tools_used: string[]; reply: string; account: { id: string } };
  expect(body.ok).toBe(true);
  expect(body.tools_used).toContain('fleet_status'); // el agente consultó la flota real
  expect(body.reply.length).toBeGreaterThan(10);
  expect(body.account.id).toBe(account.accountId);
});
