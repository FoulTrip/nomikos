import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { test, expect, api, auth, json, randomEmail, randomPassword, runLedger, settleInvoiceViaLedger } from './_helpers';

const fixture = 'http://localhost:4177';
const endpoint = 'http://marketplace-fixture:4177/mcp';
const termsHash = createHash('sha256').update('NomikOS E2E Terms v1\n').digest('hex');
const privacyHash = createHash('sha256').update('NomikOS E2E Privacy v1\n').digest('hex');
const chars58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const headers = (token: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra,
});
function encode58(bytes: Uint8Array) {
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let out = '';
  while (n) { out = chars58[Number(n % 58n)] + out; n /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; out = `1${out}`; }
  return out || '1';
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
async function createAccount() {
  const email = randomEmail();
  const password = randomPassword();
  expect((await api('/auth/register', json({ email, password }))).status).toBe(201);
  const response = await api('/auth/login', json({ email, password }));
  return (await response.json()) as { token: string };
}

test('reportes anclados a ejecuciones pagadas activan circuito de cuarentena y revalidación', { timeout: 120_000 }, async ({ account }) => {
  await fetch(`${fixture}/__fixture/reset`, { method: 'POST' });
  const keyPair = generateKeyPairSync('ed25519');
  const spki = keyPair.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const publisherKey = encode58(spki.subarray(spki.length - 32));
  const namespace = `qa-reputation-${randomBytes(5).toString('hex')}`;
  const unsigned = {
    namespace, name: 'MCP reputation fixture', version: '1.0.0',
    description: 'Prueba de circuito de reputación.', endpoint,
    publisher_pubkey: publisherKey,
    legal: {
      terms_url: 'http://marketplace-fixture:4177/legal/terms', terms_sha256: termsHash,
      privacy_url: 'http://marketplace-fixture:4177/legal/privacy', privacy_sha256: privacyHash,
    },
    tools: [{
      name: 'echo_paid', description: 'Echo de prueba',
      input_schema: { type: 'object', properties: { message: { type: 'string', minLength: 1, maxLength: 120 } }, required: ['message'], additionalProperties: false },
      output_schema: { type: 'object', properties: { message: { type: 'string' }, payment_invoice: { type: 'string' } }, required: ['message', 'payment_invoice'], additionalProperties: false },
      price: { scheme: 'exact', network: 'devnet', asset: 'SOL', amount_atomic: 100, pay_to: publisherKey },
      risk_class: 'read', permissions: ['network:external'],
    }],
  };
  const manifest = { ...unsigned, signature: sign(null, Buffer.from(`nomikos-app-manifest-v1\n${canonical(unsigned)}`), keyPair.privateKey).toString('base64') };
  const published = await api('/marketplace/apps', { method: 'POST', headers: headers(account.token), body: JSON.stringify(manifest) });
  expect(published.status, await published.clone().text()).toBe(201);
  const publication = (await published.json()) as { manifest_hash: string };

  const reporters = [await createAccount(), await createAccount(), await createAccount()];
  const paidInvoices: string[] = [];
  for (const [index, reporter] of reporters.entries()) {
    const install = await api(`/marketplace/apps/${namespace}/install`, {
      method: 'POST', headers: headers(reporter.token),
      body: JSON.stringify({ mode: 'all',
        legal_consent: { accepted: true, manifest_hash: publication.manifest_hash,
          terms_sha256: termsHash, privacy_sha256: privacyHash },
        tools: [{ name: 'echo_paid', enabled: true, require_confirmation: false }] }),
    });
    expect(install.status).toBe(200);
    const body = { arguments: { message: `reporter-${index}` } };
    const challenge = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
      method: 'POST', headers: headers(reporter.token), body: JSON.stringify(body),
    });
    expect(challenge.status).toBe(402);
    const invoiceId = (((await challenge.json()) as { invoice: { id: string } }).invoice.id);
    paidInvoices.push(invoiceId);
    settleInvoiceViaLedger(invoiceId);
    const paid = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
      method: 'POST', headers: headers(reporter.token, { 'X-Payment': invoiceId }), body: JSON.stringify(body),
    });
    expect(paid.status).toBe(200);
  }

  const badEvidence = await api(`/marketplace/apps/${namespace}/reports`, {
    method: 'POST', headers: headers(reporters[0].token),
    body: JSON.stringify({ invoice_id: paidInvoices[0], category: 'fraud', details: 'malicious', evidence_sha256: 'no-hash' }),
  });
  expect(badEvidence.status).toBe(400);
  const foreignInvoice = await api(`/marketplace/apps/${namespace}/reports`, {
    method: 'POST', headers: headers(reporters[1].token),
    body: JSON.stringify({ invoice_id: paidInvoices[0], category: 'fraud', details: 'not my call', evidence_sha256: 'a'.repeat(64) }),
  });
  expect(foreignInvoice.status).toBe(403);

  for (let index = 0; index < reporters.length; index++) {
    const report = await api(`/marketplace/apps/${namespace}/reports`, {
      method: 'POST', headers: headers(reporters[index].token),
      body: JSON.stringify({
        invoice_id: paidInvoices[index], category: 'endpoint_misbehavior',
        details: `Evidencia aislada del reporte ${index}.`, evidence_sha256: (index + 1).toString(16).padStart(64, '0'),
        evidence_uri: `ipfs://bafybeie2e-${index}`,
      }),
    });
    expect(report.status).toBe(201);
    if (index === 2) expect(((await report.json()) as { status: string }).status).toBe('quarantined');
  }

  const app = await api(`/marketplace/apps/${namespace}`);
  const appBody = (await app.json()) as { status: string; health_status: string; reputation: { distinct_reporters_last_24h: number } };
  expect(appBody.status).toBe('quarantined');
  expect(appBody.health_status).toBe('quarantined');
  expect(appBody.reputation.distinct_reporters_last_24h).toBe(3);
  const publicCatalog = ((await (await api('/marketplace/apps')).json()) as { apps: { namespace: string }[] }).apps;
  expect(publicCatalog.some((item) => item.namespace === namespace)).toBe(false);
  const publisherReports = await api(`/marketplace/apps/${namespace}/reports`, auth(account.token));
  const storedReports = ((await publisherReports.json()) as { reports: { evidence_sha256: string; details: string }[] }).reports;
  expect(storedReports).toHaveLength(3);
  expect(storedReports[0].evidence_sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(storedReports[0].details).toContain('Evidencia aislada');
  expect((await api(`/marketplace/apps/${namespace}/revalidate`, { method: 'POST', headers: headers(account.token) })).status).toBe(409);
  expect((await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: headers(reporters[0].token), body: JSON.stringify({ arguments: { message: 'blocked while quarantined' } }),
  })).status).toBe(503);

  runLedger('UPDATE marketplace_reports SET created_at = ? WHERE namespace = ?', [Date.now() - 25 * 60 * 60 * 1000, namespace]);
  const revalidated = await api(`/marketplace/apps/${namespace}/revalidate`, { method: 'POST', headers: headers(account.token) });
  expect(revalidated.status).toBe(200);
  expect(((await revalidated.json()) as { status: string }).status).toBe('active');
});
