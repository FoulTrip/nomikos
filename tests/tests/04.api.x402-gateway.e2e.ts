/**
 * 04.api.x402-gateway.e2e.ts — Handshake 402 del diagrama (pasos 1-7):
 * 402 + invoice → X-Payment one-shot → replay 409 → ownership 403.
 */
import { test, expect, api, json, auth, PaymentRequiredSchema, settleInvoiceViaLedger, generateSolanaKeypair } from './_helpers';

const PAY = (id: string) => ({ 'X-Payment': id });

test('1-2. Sin pago → 402 + invoice de system + WWW-Authenticate: X402', async () => {
  const res = await api('/device');
  expect(res.status).toBe(402);
  expect(res.headers.get('www-authenticate')).toBe('X402');
  expect(res.headers.get('x-payment-invoice-id')).toMatch(/^x402-/);
  const body = PaymentRequiredSchema.parse(await res.json());
  expect(body.invoice.account_id).toBe('system');
  expect(body.invoice.resource).toBe('x402:path:/api/device');
  expect(body.invoice.amount_lamports).toBeGreaterThan(0);
});

test('3. Ruta hermana /device/model (GLB desde R2) SIN peaje → 200', async () => {
  const res = await api('/device/model');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('model/gltf-binary');
});

test('4. X-Payment inexistente → 404', async () => {
  const res = await api('/device', { headers: PAY('x402-no-existe-999') });
  expect(res.status).toBe(404);
});

test('5. Token inválido en ruta protegida → 401 (no emite factura)', async () => {
  const res = await api('/device', { headers: { Authorization: 'Bearer token-falso' } });
  expect(res.status).toBe(401);
});

test('6-7. Handshake completo: 402 de la cuenta → settled (settler) → reintento X-Payment → recurso → replay 409', async ({ account }) => {
  // 6: la factura es de la CUENTA autenticada
  const challenge = await api('/device', { headers: { Authorization: `Bearer ${account.token}` } });
  expect(challenge.status).toBe(402);
  const invoiceId = challenge.headers.get('x-payment-invoice-id')!;
  const challengeBody = PaymentRequiredSchema.parse(await challenge.json());
  expect(challengeBody.invoice.account_id).toBe(account.accountId);

  // el settler confirma la tx on-chain (simulado por ledger local)
  settleInvoiceViaLedger(invoiceId);

  // 7: reintento firmado → el RECURSO se ejecuta (one-shot)
  const access = await api('/device', {
    headers: { Authorization: `Bearer ${account.token}`, ...PAY(invoiceId) },
  });
  expect(access.status).toBe(200);
  const device = (await access.json()) as { device: { name: string }; specs: unknown[] };
  expect(device.device.name).toBe('ESP32-S3-Touch-AMOLED-1.43');
  expect(device.specs.length).toBeGreaterThan(0);

  // replay: el MISMO X-Payment ya fue consumido → 409
  const replay = await api('/device', {
    headers: { Authorization: `Bearer ${account.token}`, ...PAY(invoiceId) },
  });
  expect(replay.status).toBe(409);
});

test('ownership: la cuenta no puede usar la factura de otra cuenta → 403', async ({ account }) => {
  // factura de system
  const challenge = await api('/device');
  const invoiceId = challenge.headers.get('x-payment-invoice-id')!;
  settleInvoiceViaLedger(invoiceId);
  const res = await api('/device', {
    headers: { Authorization: `Bearer ${account.token}`, ...PAY(invoiceId) },
  });
  expect(res.status).toBe(403);
});

test('dPaaS: límite tx rechaza pagos que exceden el límite de la cuenta', async ({ account }) => {
  const H = { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' };
  // setup dPaaS completo de la cuenta: chain con tx_limit + keypair importado
  await api('/accounts/me/chain', {
    method: 'PUT', headers: H,
    body: JSON.stringify({ network: 'devnet', daily_limit_lamports: 50_000_000, tx_limit_lamports: 500_000 }),
  });
  const { keypair } = generateSolanaKeypair();
  await api('/accounts/me/chain/keypair/import', { method: 'POST', headers: H, body: JSON.stringify({ keypair_json: keypair }) });

  // pedir por encima del tx_limit → 400 al encolar
  const res = await api('/accounts/me/x402/pay', {
    method: 'POST', headers: H,
    body: JSON.stringify({ to: 'BMHZMPdCUjCZMeVACwqqk3KXfNnuqriCXyXnxdwZ97w1', lamports: 999_999_999 }),
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: string };
  expect(body.error).toContain('tx_limit_lamports');
});

test('facturas creadas con Bearer quedan ligadas a la cuenta (multi-tenant)', async ({ account }) => {
  // crear UNA factura con Bearer (la autenticación liga la factura a la cuenta)
  const challenge = await api('/device', { headers: { Authorization: `Bearer ${account.token}` } });
  expect(challenge.status).toBe(402);

  const invoices = await api('/accounts/me/x402/invoices', auth(account.token));
  expect(invoices.status).toBe(200);
  const list = (await invoices.json()) as { invoices: { account_id: string }[] };
  expect(list.invoices.length).toBeGreaterThan(0);
  for (const inv of list.invoices) expect(inv.account_id).toBe(account.accountId);
});
