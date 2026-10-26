/**
 * 12.voice.app.e2e.ts — NomikOS F5 (diagram.d2): voz por el worker y
 * peaje por CADA petición del agente a la app (Payload CMS real :3100).
 *
 *   ①→③ app-request: 402 → pagar → X-Payment → PROXY a la app con los
 *      datos REALES del CMS; el peaje se consume solo si la app respondió;
 *      replay → 409 · ajeno → 403 · path inválido → 400 · sin sesión → 401
 *   ④ una petición = una factura (no hay sesiones de pago)
 *   ⑤ petición desde un DISPOSITIVO de la flota → factura con device_id
 *   ⑥ voz (User → Worker "Voz / texto"): validaciones 400/401
 *   ⑦ un turno de voz real al orquestador (device token → /api/voice → brain)
 */
import {
  test, expect, api, json, auth, LoginSchema, randomEmail, randomPassword,
  settleInvoiceViaLedger, setupAccountLLM,
} from './_helpers';

const withH = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

interface AppReq {
  ok: boolean;
  status: number;
  app: string;
  result: { docs?: { email?: string }[] } | null;
  invoice_id: string;
  resource: string;
}

async function appRequest(token: string, path: string, xPayment?: string, method = 'GET') {
  const headers = withH(token);
  if (xPayment) headers['X-Payment'] = xPayment;
  return api('/app/request', {
    method: 'POST', headers,
    body: JSON.stringify({ path, method }),
  });
}

test('①→③ app-request: peaje → proxy a Payload REAL → one-shot → seguridad', async ({ account }) => {
  // ① sin peaje pagado → 402 + factura de ESTA petición
  const first = await appRequest(account.token, '/api/users?limit=2&depth=0');
  expect(first.status).toBe(402);
  const body402 = (await first.json()) as { invoice: { id: string; resource: string; account_id: string }; resource: string };
  expect(body402.resource).toMatch(/^x402:app:payload(-cms)?:GET:\/api\/users\?limit=2&depth=0$/);
  expect(body402.invoice.account_id).toBe(account.accountId);

  // pagar (settler) → reintento con X-Payment → PROXY a la app REAL
  settleInvoiceViaLedger(body402.invoice.id);
  const second = await appRequest(account.token, '/api/users?limit=2&depth=0', body402.invoice.id);
  expect(second.status).toBe(200);
  const done = (await second.json()) as AppReq;
  expect(done.ok).toBe(true);
  expect(done.status).toBe(200); // la app (Payload :3100) respondió
  expect(done.invoice_id).toBe(body402.invoice.id); // el peaje se consumió
  // datos REALES del CMS (colección users del template con-cloudflare-d1)
  const docs = done.result?.docs ?? [];
  expect(docs.length).toBeGreaterThan(0);
  expect(docs[0].email).toContain('@');

  // ③ replay del MISMO peaje → 409 (one-shot)
  expect((await appRequest(account.token, '/api/users?limit=1', body402.invoice.id)).status).toBe(409);

  // X-Payment de otra cuenta → 403
  const otherEmail = randomEmail();
  const otherPassword = randomPassword();
  await api('/auth/register', json({ email: otherEmail, password: otherPassword }));
  const otherTok = LoginSchema.parse(
    await (await api('/auth/login', json({ email: otherEmail, password: otherPassword }))).json(),
  ).token;
  const otherFirst = await appRequest(otherTok, '/api/users?limit=1');
  const otherInv = ((await otherFirst.json()) as { invoice: { id: string } }).invoice;
  settleInvoiceViaLedger(otherInv.id);
  expect((await appRequest(account.token, '/api/users?limit=1', otherInv.id)).status).toBe(403);

  // path inválido → 400 · sin sesión → 401
  expect((await appRequest(account.token, 'http://evil.com')).status).toBe(400);
  expect(
    (await api('/app/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '/api/users' }) })).status,
  ).toBe(401);
});

test('④ cada petición es un peaje nuevo (sin sesiones de pago)', async ({ account }) => {
  // primera → 402
  const first = await appRequest(account.token, '/api/users?limit=1');
  expect(first.status).toBe(402);
  const inv1 = ((await first.json()) as { invoice: { id: string } }).invoice;

  // una segunda petición CONCURRENTE → OTRO 402 con factura DISTINTA
  const second = await appRequest(account.token, '/api/media?limit=1');
  expect(second.status).toBe(402);
  const inv2 = ((await second.json()) as { invoice: { id: string } }).invoice;
  expect(inv2.id).not.toBe(inv1.id); // un peaje por petición, como manda el diagrama
});

test('⑤ petición a la app desde un DISPOSITIVO → factura con device_id', async ({ account }) => {
  // alta de dispositivo de la flota (NomikOS)
  const enr = await api('/devices/enroll', json({
    board: 'rpi4', name: 'Pi QA', pubkey: '9EgkxJXATAppZgRViFFBNmhSeQbXj664zKV9ErCm6cVS',
  }));
  const { claim_code, enroll_secret, device_id } = (await enr.json()) as {
    claim_code: string; enroll_secret: string; device_id: string;
  };
  await api('/devices/claim', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ code: claim_code }) });
  const dtok = LoginSchema.parse(
    await (await api('/devices/token', json({ device_id, enroll_secret }))).json(),
  ).token;

  // la Pi pide algo a la app: el peaje queda atribuido a la placa
  const first = await appRequest(dtok, '/api/users?limit=1');
  expect(first.status).toBe(402);
  const inv = ((await first.json()) as { invoice: { device_id: string | null; account_id: string } }).invoice;
  expect(inv.account_id).toBe(account.accountId);
  expect(inv.device_id).toBe(device_id);
});

test('⑥ voz: validaciones — texto vacío 400 · sin sesión 401', async ({ account }) => {
  expect(
    (await api('/voice', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ text: '   ' }) })).status,
  ).toBe(400);
  expect(
    (await api('/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hola' }) })).status,
  ).toBe(401);
});

test('⑦ un turno de voz real: Pi → /api/voice → orquestador', { timeout: 600_000, retries: 1 }, async ({ account }) => {
  // el dispositivo de la flota HABLA (en la Pi real: mic → whisper → aquí)
  const enr = await api('/devices/enroll', json({
    board: 'rpi4', name: 'Pi Voz', pubkey: '9EgkxJXATAppZgRViFFBNmhSeQbXj664zKV9ErCm6cVS',
  }));
  const { claim_code, enroll_secret, device_id } = (await enr.json()) as {
    claim_code: string; enroll_secret: string; device_id: string;
  };
  await api('/devices/claim', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ code: claim_code }) });
  const dtok = LoginSchema.parse(
    await (await api('/devices/token', json({ device_id, enroll_secret }))).json(),
  ).token;

  // la cuenta trae SU key (el turno de voz razona solo con ella)
  await setupAccountLLM(account.token);

  const turn = await api('/voice', {
    method: 'POST', headers: withH(dtok),
    body: JSON.stringify({ text: 'Hola', device_id: 'rpi4-voz' }),
  });
  expect(turn.status).toBe(200);
  const gw = (await turn.json()) as { ok: boolean; reply: string; backend: string; account: { id?: string } };
  // el worker pasó el turno al orquestador con la identidad de la cuenta
  expect(gw.backend).toBeTruthy();
  expect(gw.reply.length).toBeGreaterThan(0); // respuesta o retención del shield
  if (gw.ok) expect(gw.account.id).toBe(account.accountId);
});
