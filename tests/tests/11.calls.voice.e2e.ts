/**
 * 11.calls.voice.e2e.ts — NomikOS Fase 5: llamadas con peaje x402/min.
 *
 * La llamada es un recurso x402 reactivo (tabla `calls` + facturas por
 * minuto que la CUENTA paga por dPaaS — el dispositivo nunca firma):
 *
 *   ① POST /calls {destination}   → 402 + peaje del minuto 0 (ringing)
 *   ② pagar (settler) + X-Payment → active · 1 min · peaje del min 1
 *   ③ replay del X-Payment        → 409 (one-shot)
 *   ④ minuto 2: pagar + reintentar→ 2 min · peaje del min 2
 *   ⑤ ownership: X-Payment de otra cuenta → 403 · sin sesión → 401
 *   ⑥ end → ended · GET refleja la sesión
 *   ⑦ llamada originada por un DISPOSITIVO de la flota → peaje con device_id
 *   ⑧ firma dPaaS real del peaje: la secuencia exacta que place_call ejecuta
 *      (402 → pay-invoice con keypair de la cuenta → tx base58 → settler
 *      → reintento X-Payment → active). El comando por voz corre sobre
 *      modelos capaces (patrón suite 06); la maquinaria queda congelada aquí.
 */
import {
  test, expect, api, json, auth, brain, LoginSchema, randomEmail, randomPassword,
  generateSolanaKeypair, settleInvoiceViaLedger,
} from './_helpers';

const DEST = '+573001234567';
const withH = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

/** POST /calls con (o sin) X-Payment. */
async function dial(token: string, xPayment?: string) {
  const headers: Record<string, string> = withH(token);
  if (xPayment) headers['X-Payment'] = xPayment;
  return api('/calls', {
    method: 'POST',
    headers,
    body: JSON.stringify({ destination: DEST }),
  });
}

interface CallBody {
  ok: boolean;
  call: { id: string; status: string; minutes_paid: number; destination: string };
  invoice?: { id: string; resource: string; account_id: string; device_id: string | null };
  invoice_next?: { id: string; resource: string };
}

test('①→⑥ ciclo de llamada: 402 → minuto pagado → 409 replay → 2º minuto → colgar', async ({ account }) => {
  // ① crear → 402 con el peaje del minuto 0
  const start = await dial(account.token);
  expect(start.status).toBe(402);
  const body1 = (await start.json()) as CallBody;
  expect(body1.ok).toBe(false);
  expect(body1.call.status).toBe('ringing');
  expect(body1.call.destination).toBe(DEST);
  expect(body1.call.minutes_paid).toBe(0);
  expect(body1.invoice!.resource).toBe(`x402:call:${body1.call.id}:minute:0`);
  expect(body1.invoice!.account_id).toBe(account.accountId);

  // ② la cuenta paga (settler) → reintento con X-Payment → minuto 0
  settleInvoiceViaLedger(body1.invoice!.id);
  const min0 = await dial(account.token, body1.invoice!.id);
  expect(min0.status).toBe(200);
  const body2 = (await min0.json()) as CallBody;
  expect(body2.ok).toBe(true);
  expect(body2.call.status).toBe('active');
  expect(body2.call.minutes_paid).toBe(1);
  expect(body2.invoice_next!.resource).toBe(`x402:call:${body2.call.id}:minute:1`);

  // ③ replay del MISMO X-Payment → 409 (one-shot, igual que el gate 402)
  expect((await dial(account.token, body1.invoice!.id)).status).toBe(409);

  // ④ minuto 1 → 2 minutos pagados, siguiente peaje en la respuesta
  settleInvoiceViaLedger(body2.invoice_next!.id);
  const min1 = await dial(account.token, body2.invoice_next!.id);
  const body3 = (await min1.json()) as CallBody;
  expect(body3.call.minutes_paid).toBe(2);
  expect(body3.invoice_next!.resource).toBe(`x402:call:${body3.call.id}:minute:2`);

  // ⑥ colgar + estado final (GET sin peaje)
  const end = await api(`/calls/${body3.call.id}/end`, { method: 'POST', headers: withH(account.token) });
  expect(end.status).toBe(200);
  const ended = ((await end.json()) as CallBody).call;
  expect(ended.status).toBe('ended');

  const got = await api(`/calls/${body3.call.id}`, auth(account.token));
  expect(((await got.json()) as CallBody).call.minutes_paid).toBe(2);
});

test('⑤ seguridad: sin sesión 401 · X-Payment ajeno 403 · llamada ajena 404', async ({ account }) => {
  // sin Bearer → 401 antes de crear nada
  expect((await api('/calls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destination: DEST }) })).status).toBe(401);

  // una llamada de OTRA cuenta con su peaje pagado…
  const otherEmail = randomEmail();
  const otherPassword = randomPassword();
  await api('/auth/register', json({ email: otherEmail, password: otherPassword }));
  const otherTok = LoginSchema.parse(
    await (await api('/auth/login', json({ email: otherEmail, password: otherPassword }))).json(),
  ).token;
  const otherStart = await dial(otherTok);
  const otherBody = (await otherStart.json()) as CallBody;
  const otherInv = otherBody.invoice!;
  settleInvoiceViaLedger(otherInv.id);

  // …mi cuenta no puede consumir su peaje → 403 (ownership)
  expect((await dial(account.token, otherInv.id)).status).toBe(403);

  // y no veo su llamada → 404
  expect((await api(`/calls/${otherBody.call.id}`, auth(account.token))).status).toBe(404);
});

test('⑦ llamada originada por un DISPOSITIVO de la flota → peaje con device_id', async ({ account }) => {
  // alta de dispositivo (ciclo NomikOS Fase 1)
  const enr = await api('/devices/enroll', json({
    board: 'esp32-s3-amoled-143', name: 'Telón QA', pubkey: '9EgkxJXATAppZgRViFFBNmhSeQbXj664zKV9ErCm6cVS',
  }));
  const { claim_code, enroll_secret, device_id } = (await enr.json()) as {
    claim_code: string; enroll_secret: string; device_id: string;
  };
  await api('/devices/claim', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ code: claim_code }) });
  const dtok = LoginSchema.parse(
    await (await api('/devices/token', json({ device_id, enroll_secret }))).json(),
  ).token;

  // el dispositivo llama: el peaje lleva SU device_id (atribuible a la placa)
  const start = await dial(dtok);
  expect(start.status).toBe(402);
  const body = (await start.json()) as CallBody;
  expect(body.invoice!.account_id).toBe(account.accountId);
  expect(body.invoice!.device_id).toBe(device_id);
  expect(body.call.status).toBe('ringing');
});

test('⑧ firma dPaaS real del peaje de llamada (la secuencia exacta de place_call)', async ({ account }) => {
  // El dPaaS necesita su keypair para firmar el peaje del minuto 0.
  const { keypair } = generateSolanaKeypair();
  await api('/accounts/me/chain', {
    method: 'PUT', headers: withH(account.token),
    body: JSON.stringify({ network: 'devnet', daily_limit_lamports: 50_000_000, tx_limit_lamports: 1_000_000 }),
  });
  await api('/accounts/me/chain/keypair/import', {
    method: 'POST', headers: withH(account.token),
    body: JSON.stringify({ keypair_json: keypair }),
  });

  // 1) crear la llamada → 402 + peaje del minuto 0 (lo que recibe place_call)
  const start = await dial(account.token);
  expect(start.status).toBe(402);
  const { invoice } = (await start.json()) as CallBody;
  expect(invoice!.resource).toContain(':minute:0');

  // 2) la CUENTA firma con dPaaS (pay-invoice): la wallet de la cuenta
  //    construye y envía la tx REAL a Devnet — el dispositivo nunca firma.
  //    (El endpoint responde con la factura actualizada, sin wrapper.)
  const pay = await api('/accounts/me/x402/pay-invoice', {
    method: 'POST', headers: withH(account.token),
    body: JSON.stringify({ invoice_id: invoice!.id }),
  });
  expect(pay.status).toBe(200);
  const paid = (await pay.json()) as { tx_signature: string | null; status: string };
  expect(paid.tx_signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/); // firma dPaaS real
  expect(['verifying', 'settled']).toContain(paid.status);

  // 3) la factura pública refleja la tx firmada (verifying on-chain —
  //    wallet nueva sin fondos; el settler la confirmará).
  const inv = (await (await api(`/x402/invoices/${invoice!.id}`, auth(account.token))).json()) as {
    tx_signature: string | null; status: string;
  };
  expect(inv.tx_signature).toBe(paid.tx_signature);

  // 4) confirmación on-chain (settler) → reintento con X-Payment (lo que
  //    guarded_call hace solo) → la llamada activa con el minuto pagado.
  settleInvoiceViaLedger(invoice!.id);
  const active = await dial(account.token, invoice!.id);
  expect(active.status).toBe(200);
  const done = (await active.json()) as CallBody;
  expect(done.ok).toBe(true);
  expect(done.call.status).toBe('active');
  expect(done.call.minutes_paid).toBe(1);
  expect(done.invoice_next!.resource).toContain(':minute:1');
});
