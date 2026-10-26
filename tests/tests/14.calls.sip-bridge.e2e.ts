/**
 * 14.calls.sip-bridge.e2e.ts — NomikOS W4: el puente baresip.
 *
 * El api guarda la sesión y cobra el peaje x402 por minuto; la PLACA
 * mueve el audio. `GET /api/calls/for-device` (token de dispositivo) es
 * el contrato: la Pi consulta su llamada y decide marcar (`active`) o
 * colgar (`ended`/ausente). baresip real corre en la Pi; aquí su place
 * lo toma un mock que registra los comandos de control (pipe mode).
 *
 *   ① for-device: la llamada del DISPOSITIVO, con aislamiento y validaciones
 *   ② agentd (AGENTD_SIP=1) ve la llamada activa → `/dial sip:…` al mock
 *   ③ end en el api → agentd cuelga → `/hangup`
 *   ④ for-device vacía tras terminar
 */
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, api, json, auth, LoginSchema, settleInvoiceViaLedger, API_URL } from './_helpers';

const withH = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
const AGENTD_BIN =
  process.env.AGENTD_BIN ?? path.resolve(process.cwd(), '../firmware/target/release/agentd-host');
const DEST = '+573001234567';

interface CallShape { id: string; device_id: string | null; status: string; destination: string }

/** enroll + claim + Bearer de dispositivo. */
async function newDevice(accountToken: string, name: string): Promise<{ token: string; device_id: string }> {
  const enr = await api('/devices/enroll', json({ board: 'rpi4', name, pubkey: '9EgkxJXATAppZgRViFFBNmhSeQbXj664zKV9ErCm6cVS' }));
  const { claim_code, enroll_secret, device_id } = (await enr.json()) as {
    claim_code: string; enroll_secret: string; device_id: string;
  };
  await api('/devices/claim', { method: 'POST', headers: withH(accountToken), body: JSON.stringify({ code: claim_code }) });
  const tok = LoginSchema.parse(await (await api('/devices/token', json({ device_id, enroll_secret }))).json()).token;
  return { token: tok, device_id };
}

/** Crea la llamada y paga el minuto 0 → active (la secuencia de place_call). */
async function placePaidCall(deviceToken: string): Promise<CallShape> {
  const first = await api('/calls', { method: 'POST', headers: withH(deviceToken), body: JSON.stringify({ destination: DEST }) });
  expect(first.status).toBe(402);
  const b402 = (await first.json()) as { call: CallShape; invoice: { id: string } };
  settleInvoiceViaLedger(b402.invoice.id);
  const second = await api('/calls', {
    method: 'POST', headers: { ...withH(deviceToken), 'X-Payment': b402.invoice.id },
    body: JSON.stringify({ destination: DEST }),
  });
  expect(second.status).toBe(200);
  const active = (await second.json()) as { call: CallShape; invoice_next: { id: string } };
  expect(active.call.status).toBe('active');
  return active.call;
}

async function waitForLog(file: string, needle: string, ms: number): Promise<string> {
  const t0 = Date.now();
  for (;;) {
    try {
      const txt = readFileSync(file, 'utf8');
      if (txt.includes(needle)) return txt;
    } catch { /* aún no existe */ }
    if (Date.now() - t0 > ms) throw new Error(`el mock de baresip no recibió «${needle}» en ${ms} ms`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

test('① for-device: la llamada del DISPOSITIVO, con aislamiento y validaciones', async ({ account }) => {
  const dev = await newDevice(account.token, 'Pi SIP ①');
  const call = await placePaidCall(dev.token);
  expect(call.device_id).toBe(dev.device_id);

  // la Pi consulta SU llamada (respuesta plana para el firmware no_std)
  const fd = await api('/calls/for-device', auth(dev.token));
  expect(fd.status).toBe(200);
  const body = (await fd.json()) as {
    has_call: string; call_id: string; call_status: string; call_destination: string;
  };
  expect(body.has_call).toBe('true');
  expect(body.call_id).toBe(call.id);
  expect(body.call_status).toBe('active');
  expect(body.call_destination).toBe(DEST);

  // con token de CUENTA → 400 (endpoint del dispositivo) · sin sesión → 401
  expect((await api('/calls/for-device', auth(account.token))).status).toBe(400);
  expect((await api('/calls/for-device')).status).toBe(401);

  // aislamiento: un dispositivo distinto no ve la llamada
  const other = await newDevice(account.token, 'Pi SIP ①bis');
  const fdOther = (await (await api('/calls/for-device', auth(other.token))).json()) as { has_call: string };
  expect(fdOther.has_call).toBe('false');

  // terminada → el poller se queda sin llamada
  expect((await api(`/calls/${call.id}/end`, { method: 'POST', headers: withH(dev.token) })).status).toBe(200);
  const fdEnd = (await (await api('/calls/for-device', auth(dev.token))).json()) as { has_call: string };
  expect(fdEnd.has_call).toBe('false');
});

test('②→④ el puente baresip: agentd marca con active y cuelga con end', { timeout: 120_000 }, async ({ account }) => {
  expect(existsSync(AGENTD_BIN), `falta ${AGENTD_BIN} — cd firmware && cargo build --release`).toBe(true);

  const dev = await newDevice(account.token, 'Pi SIP ②');
  const call = await placePaidCall(dev.token);

  // mock de baresip: registra los comandos de control (pipe mode)
  const dir = mkdtempSync('/tmp/opencode/sip-bridge-');
  const mockLog = path.join(dir, 'baresip.log');
  const mockBin = path.join(dir, 'baresip-mock');
  writeFileSync(mockBin, `#!/bin/sh\nwhile IFS= read -r line; do echo "$line" >> ${JSON.stringify(mockLog)}; done\necho EXIT >> ${JSON.stringify(mockLog)}\n`);
  chmodSync(mockBin, 0o755);

  // estado pre-escrito: identidad + token listos → agentd entra en Run directo
  const stateFile = path.join(dir, 'device.json');
  writeFileSync(stateFile, JSON.stringify({
    pubkey: 'A'.repeat(44), device_id: dev.device_id, enroll_secret: 'x', token: dev.token,
  }));

  // agentd con AGENTD_SIP=1 → poll de SU llamada cada 3 s
  const child = spawn(AGENTD_BIN, [], {
    env: {
      ...process.env,
      AGENTD_API_URL: API_URL,
      AGENTD_STATE: stateFile,
      AGENTD_SIP: '1',
      AGENTD_SIP_CMD: mockBin,
      AGENTD_X402: '0',
      AGENTD_NAME: 'Pi SIP QA',
      AGENTD_BOARD: 'rpi4',
    },
    stdio: 'ignore',
  });
  try {
    // ② la llamada está active → agentd marca via baresip
    await waitForLog(mockLog, `/dial sip:${DEST}`, 30_000);

    // ③ cuelga el api (end) → agentd cuelga el audio
    const end = await api(`/calls/${call.id}/end`, { method: 'POST', headers: withH(dev.token) });
    expect(end.status).toBe(200);
    await waitForLog(mockLog, '/hangup', 30_000);

    // ④ el poller se queda sin llamada
    const fd = (await (await api('/calls/for-device', auth(dev.token))).json()) as { has_call: string };
    expect(fd.has_call).toBe('false');
  } finally {
    child.kill('SIGKILL');
  }
});
