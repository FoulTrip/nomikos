import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { test, expect, api, brain, auth, json, randomEmail, randomPassword, runLedger, settleInvoiceViaLedger } from './_helpers';

const fixture = 'http://localhost:4177';
const mcpEndpoint = 'http://marketplace-fixture:4177/mcp';
const legalTermsV1 = 'NomikOS E2E Terms v1\n';
const legalPrivacyV1 = 'NomikOS E2E Privacy v1\n';
const hashText = (content: string) => createHash('sha256').update(content).digest('hex');
const legalFor = (terms: string, privacy: string) => ({
  terms_url: 'http://marketplace-fixture:4177/legal/terms',
  terms_sha256: hashText(terms),
  privacy_url: 'http://marketplace-fixture:4177/legal/privacy',
  privacy_sha256: hashText(privacy),
});
const withH = (token: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  ...extra,
});

const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes: Uint8Array): string {
  let value = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let encoded = '';
  while (value > 0n) {
    const digit = Number(value % 58n);
    encoded = alphabet[digit] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded || '1';
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const inputSchema = {
  type: 'object',
  properties: { message: { type: 'string', minLength: 1, maxLength: 120 } },
  required: ['message'],
  additionalProperties: false,
};
const outputSchema = {
  type: 'object',
  properties: { message: { type: 'string' }, payment_invoice: { type: 'string' } },
  required: ['message', 'payment_invoice'],
  additionalProperties: false,
};
const legal = legalFor(legalTermsV1, legalPrivacyV1);

function publisher() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const pubkey = base58(spki.subarray(spki.length - 32));
  return {
    pubkey,
    signManifest<T extends Record<string, unknown>>(body: T) {
      const bytes = Buffer.from(`nomikos-app-manifest-v1\n${canonical(body)}`);
      return { ...body, signature: sign(null, bytes, pair.privateKey).toString('base64') };
    },
  };
}

async function makeAccount() {
  const email = randomEmail();
  const password = randomPassword();
  const registered = await api('/auth/register', json({ email, password }));
  expect(registered.status).toBe(201);
  const login = await api('/auth/login', json({ email, password }));
  expect(login.status).toBe(200);
  return (await login.json()) as { token: string; account_id: string };
}

function makeManifest(signing: ReturnType<typeof publisher>, namespace: string, endpoint = mcpEndpoint, manifestLegal = legal) {
  return signing.signManifest({
    namespace,
    name: 'Paid MCP test fixture',
    version: '1.0.0',
    description: 'Servidor aislado de pruebas de integraciÃ³n NomikOS.',
    endpoint,
    publisher_pubkey: signing.pubkey,
    legal: manifestLegal,
    tools: [{
      name: 'echo_paid',
      description: 'Devuelve el mensaje con recibo de pago.',
      input_schema: inputSchema,
      output_schema: outputSchema,
      price: { scheme: 'exact', network: 'devnet', asset: 'SOL', amount_atomic: 100, pay_to: signing.pubkey },
      risk_class: 'read',
      permissions: ['network:external'],
    }],
  });
}

test('publicaciÃ³n MCP firmada, aislamiento, instalaciÃ³n por dispositivo, aprobaciÃ³n y pago x402 one-shot', { timeout: 120_000 }, async ({ account }) => {
  await fetch(`${fixture}/__fixture/reset`, { method: 'POST' });
  const signing = publisher();
  const namespace = `qa-mcp-${randomBytes(5).toString('hex')}`;
  const signedManifest = makeManifest(signing, namespace);

  expect((await api('/marketplace/apps', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signedManifest),
  })).status).toBe(401);
  const published = await api('/marketplace/apps', {
    method: 'POST', headers: withH(account.token), body: JSON.stringify(signedManifest),
  });
  expect(published.status).toBe(201);
  const publication = (await published.json()) as { manifest_hash: string; validation: { tools_count: number } };
  expect(publication.manifest_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(publication.validation.tools_count).toBe(1);

  const catalog = await api('/marketplace/apps');
  expect(catalog.status).toBe(200);
  expect(((await catalog.json()) as { apps: { namespace: string }[] }).apps.some((app) => app.namespace === namespace)).toBe(true);
  const verifiedTerms = await api(`/marketplace/apps/${namespace}/legal/terms`);
  expect(verifiedTerms.status).toBe(200);
  expect(await verifiedTerms.text()).toBe(legalTermsV1);
  expect(verifiedTerms.headers.get('x-content-type-options')).toBe('nosniff');
  const mine = await api('/marketplace/apps/mine', auth(account.token));
  expect(((await mine.json()) as { apps: { namespace: string }[] }).apps.some((app) => app.namespace === namespace)).toBe(true);

  const tampered = { ...signedManifest, description: 'contenido no firmado' };
  const badSignature = await api('/marketplace/apps', {
    method: 'POST', headers: withH(account.token), body: JSON.stringify(tampered),
  });
  expect(badSignature.status).toBe(401);

  const badLegal = makeManifest(signing, `${namespace}-bad-legal`, mcpEndpoint, {
    ...legal, terms_sha256: 'f'.repeat(64),
  });
  const rejectedLegal = await api('/marketplace/apps', {
    method: 'POST', headers: withH(account.token), body: JSON.stringify(badLegal),
  });
  expect(rejectedLegal.status).toBe(409);
  expect(await rejectedLegal.text()).toContain('hash_mismatch:terms');

  const mismatched = makeManifest(signing, `${namespace}-mismatch`, 'http://marketplace-fixture:4177/mcp-mismatch');
  expect((await api('/marketplace/apps', {
    method: 'POST', headers: withH(account.token), body: JSON.stringify(mismatched),
  })).status).toBe(400);

  const ssrf = makeManifest(signing, `${namespace}-ssrf`, 'http://127.0.0.1:4177/mcp');
  expect((await api('/marketplace/apps', {
    method: 'POST', headers: withH(account.token), body: JSON.stringify(ssrf),
  })).status).toBe(400);

  const secondary = await makeAccount();
  const takeover = await api('/marketplace/apps', {
    method: 'POST', headers: withH(secondary.token), body: JSON.stringify(signedManifest),
  });
  expect(takeover.status).toBe(403);
  const secondaryConsentChallenge = await api(`/marketplace/apps/${namespace}/install`, {
    method: 'POST', headers: withH(secondary.token), body: JSON.stringify({ mode: 'all' }),
  });
  expect(secondaryConsentChallenge.status).toBe(409);
  const secondaryConsent = (await secondaryConsentChallenge.json()) as { code: string; manifest_hash: string; legal: typeof legal };
  expect(secondaryConsent.code).toBe('LEGAL_CONSENT_REQUIRED');
  expect(secondaryConsent.legal.terms_sha256).toBe(legal.terms_sha256);
  expect((await api(`/marketplace/apps/${namespace}/install`, {
    method: 'POST', headers: withH(secondary.token),
    body: JSON.stringify({ mode: 'all', legal_consent: {
      accepted: true, manifest_hash: secondaryConsent.manifest_hash,
      terms_sha256: legal.terms_sha256, privacy_sha256: legal.privacy_sha256,
    } }),
  })).status).toBe(200);
  const secondaryTools = await api('/accounts/me/marketplace/tools', auth(secondary.token));
  expect(((await secondaryTools.json()) as { tools: unknown[] }).tools).toHaveLength(0);
  expect((await api(`/accounts/me/marketplace/apps/${namespace}/tools/echo_paid`, {
    method: 'PUT', headers: withH(secondary.token),
    body: JSON.stringify({ enabled: true, max_amount_lamports: 100, require_confirmation: true }),
  })).status).toBe(200);
  const brainToolsResponse = await brain('/v1/tools', auth(secondary.token));
  expect(brainToolsResponse.status, await brainToolsResponse.clone().text()).toBe(200);
  const brainTools = ((await brainToolsResponse.json()) as { tools: { name: string }[] }).tools;
  expect(brainTools.some((tool) => tool.name.startsWith('mcp_') && tool.name.includes(namespace))).toBe(true);

  const deviceEnroll = await api('/devices/enroll', json({ board: 'esp32-s3-amoled-143', name: 'Marketplace E2E', pubkey: signing.pubkey }));
  expect(deviceEnroll.status).toBe(201);
  const enrollment = (await deviceEnroll.json()) as { device_id: string; claim_code: string; enroll_secret: string };
  expect((await api('/devices/claim', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ code: enrollment.claim_code }) })).status).toBe(200);
  const deviceTokenResponse = await api('/devices/token', json({ device_id: enrollment.device_id, enroll_secret: enrollment.enroll_secret }));
  expect(deviceTokenResponse.status).toBe(200);
  const deviceToken = ((await deviceTokenResponse.json()) as { token: string }).token;

  const consentChallenge = await api(`/marketplace/apps/${namespace}/install`, {
    method: 'POST', headers: withH(account.token), body: JSON.stringify({ mode: 'all' }),
  });
  expect(consentChallenge.status).toBe(409);
  const legalChallenge = (await consentChallenge.json()) as { code: string; manifest_hash: string; legal: typeof legal };
  expect(legalChallenge.code).toBe('LEGAL_CONSENT_REQUIRED');
  expect(legalChallenge.manifest_hash).toBe(publication.manifest_hash);
  const mismatchedLegalConsent = await api(`/marketplace/apps/${namespace}/install`, {
    method: 'POST', headers: withH(account.token),
    body: JSON.stringify({ mode: 'all', legal_consent: {
      accepted: true, manifest_hash: publication.manifest_hash,
      terms_sha256: '0'.repeat(64), privacy_sha256: legal.privacy_sha256,
    } }),
  });
  expect(mismatchedLegalConsent.status).toBe(409);

  const installed = await api(`/marketplace/apps/${namespace}/install`, {
    method: 'POST', headers: withH(account.token),
    body: JSON.stringify({ mode: 'selected', device_ids: [enrollment.device_id],
      legal_consent: { accepted: true, manifest_hash: publication.manifest_hash,
        terms_sha256: legal.terms_sha256, privacy_sha256: legal.privacy_sha256 },
      tools: [{ name: 'echo_paid', enabled: true, max_amount_lamports: 200 }] }),
  });
  expect(installed.status).toBe(200);
  const accountTools = await api('/accounts/me/marketplace/tools', auth(account.token));
  expect(((await accountTools.json()) as { tools: unknown[] }).tools).toHaveLength(0);
  const selectedDenied = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(account.token), body: JSON.stringify({ arguments: { message: 'wrong identity' } }),
  });
  expect(selectedDenied.status).toBe(403);

  const invalidArguments = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(deviceToken), body: JSON.stringify({ arguments: { message: 42 } }),
  });
  expect(invalidArguments.status).toBe(400);

  const approvalRequired = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(deviceToken), body: JSON.stringify({ arguments: { message: 'hola Nomik' } }),
  });
  expect(approvalRequired.status, await approvalRequired.clone().text()).toBe(409);
  const pendingApproval = (await approvalRequired.json()) as { code: string; approval_id: string };
  expect(pendingApproval.code).toBe('TOOL_APPROVAL_REQUIRED');
  const approvalList = await api('/accounts/me/marketplace/approvals', auth(account.token));
  const listedApproval = ((await approvalList.json()) as { approvals: { id: string; arguments: { message: string } }[] }).approvals.find((item) => item.id === pendingApproval.approval_id);
  expect(listedApproval?.arguments.message).toBe('hola Nomik');
  expect((await api(`/accounts/me/marketplace/approvals/${pendingApproval.approval_id}`, {
    method: 'POST', headers: withH(secondary.token), body: JSON.stringify({ approved: true }),
  })).status).toBe(404);
  expect((await api(`/accounts/me/marketplace/approvals/${pendingApproval.approval_id}`, {
    method: 'POST', headers: withH(account.token), body: JSON.stringify({ approved: true }),
  })).status).toBe(200);

  const callBody = { arguments: { message: 'hola Nomik' } };
  const challenge = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(deviceToken), body: JSON.stringify(callBody),
  });
  expect(challenge.status).toBe(402);
  const payment = (await challenge.json()) as { resource: string; invoice: { id: string; payee: string; amount_lamports: number; network: string; device_id: string } };
  expect(payment.invoice.amount_lamports).toBe(100);
  expect(payment.invoice.payee).toBe(signing.pubkey);
  expect(payment.invoice.network).toBe('devnet');
  expect(payment.invoice.device_id).toBe(enrollment.device_id);
  expect(payment.resource).toContain('echo_paid');

  const pendingPayment = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(deviceToken, { 'X-Payment': payment.invoice.id }), body: JSON.stringify(callBody),
  });
  expect(pendingPayment.status).toBe(402);

  expect((await api(`/accounts/me/marketplace/apps/${namespace}/tools/echo_paid`, {
    method: 'PUT', headers: withH(secondary.token),
    body: JSON.stringify({ enabled: true, max_amount_lamports: 200, require_confirmation: false }),
  })).status).toBe(200);
  const otherAccountUse = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(secondary.token, { 'X-Payment': payment.invoice.id }),
    body: JSON.stringify({ arguments: { message: 'hola Nomik' } }),
  });
  expect(otherAccountUse.status).toBe(403);

  const changedArguments = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(deviceToken, { 'X-Payment': payment.invoice.id }),
    body: JSON.stringify({ ...callBody, arguments: { message: 'mensaje cambiado' } }),
  });
  expect(changedArguments.status, await changedArguments.clone().text()).toBe(409);

  settleInvoiceViaLedger(payment.invoice.id);
  const paidCall = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(deviceToken, { 'X-Payment': payment.invoice.id }), body: JSON.stringify(callBody),
  });
  expect(paidCall.status).toBe(200);
  const result = (await paidCall.json()) as { ok: boolean; result: { structuredContent: { message: string; payment_invoice: string } } };
  expect(result.ok).toBe(true);
  expect(result.result.structuredContent.message).toBe('hola Nomik');
  expect(result.result.structuredContent.payment_invoice).toBe(payment.invoice.id);
  const replay = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(deviceToken, { 'X-Payment': payment.invoice.id }), body: JSON.stringify(callBody),
  });
  expect(replay.status, await replay.clone().text()).toBe(409);
  const fixtureCalls = ((await (await fetch(`${fixture}/__fixture/state`)).json()) as { calls: { receipt: { invoice_id: string } }[] }).calls;
  expect(fixtureCalls).toHaveLength(1);
  expect(fixtureCalls[0].receipt.invoice_id).toBe(payment.invoice.id);

  const disabledPolicy = await api(`/accounts/me/marketplace/apps/${namespace}/tools/echo_paid`, {
    method: 'PUT', headers: withH(account.token), body: JSON.stringify({ enabled: false, max_amount_lamports: 200 }),
  });
  expect(disabledPolicy.status).toBe(200);
  expect((await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(deviceToken), body: JSON.stringify({ arguments: { message: 'blocked' } }),
  })).status).toBe(403);

  const installedApps = await api('/accounts/me/marketplace/apps', auth(account.token));
  const accountApp = ((await installedApps.json()) as { apps: { namespace: string; legal_consent: boolean }[] }).apps
    .find((item) => item.namespace === namespace);
  expect(accountApp?.legal_consent).toBe(true);

  const { signature: _signature, ...unsignedV2 } = signedManifest;
  const legalTermsV2 = 'NomikOS E2E Terms v2\n';
  const legalPrivacyV2 = 'NomikOS E2E Privacy v2\n';
  await fetch(`${fixture}/__fixture/legal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terms: legalTermsV2, privacy: legalPrivacyV2 }),
  });
  const legalV2 = legalFor(legalTermsV2, legalPrivacyV2);
  const signedV2 = signing.signManifest({ ...unsignedV2, version: '2.0.0', legal: legalV2 });
  expect((await api('/marketplace/apps', {
    method: 'POST', headers: withH(account.token), body: JSON.stringify(signedV2),
  })).status).toBe(201);
  const toolsAfterUpdate = await api('/accounts/me/marketplace/tools', auth(account.token));
  expect(((await toolsAfterUpdate.json()) as { tools: unknown[] }).tools).toHaveLength(0);
  const staleCall = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(deviceToken), body: JSON.stringify({ arguments: { message: 'stale consent' } }),
  });
  expect(staleCall.status).toBe(409);
  expect((await staleCall.text()).toLowerCase()).toContain('legal_consent_required');
  const reconsentChallenge = await api(`/marketplace/apps/${namespace}/install`, {
    method: 'POST', headers: withH(account.token), body: JSON.stringify({ mode: 'selected', device_ids: [enrollment.device_id] }),
  });
  expect(reconsentChallenge.status).toBe(409);
  const newChallenge = (await reconsentChallenge.json()) as { manifest_hash: string };
  const reinstalled = await api(`/marketplace/apps/${namespace}/install`, {
    method: 'POST', headers: withH(account.token),
    body: JSON.stringify({ mode: 'selected', device_ids: [enrollment.device_id],
      legal_consent: { accepted: true, manifest_hash: newChallenge.manifest_hash,
        terms_sha256: legalV2.terms_sha256, privacy_sha256: legalV2.privacy_sha256 },
      tools: [{ name: 'echo_paid', enabled: true, max_amount_lamports: 200 }] }),
  });
  expect(reinstalled.status).toBe(200);
  const reconsentedApps = await api('/accounts/me/marketplace/apps', auth(account.token));
  const reconsentedApp = ((await reconsentedApps.json()) as { apps: { namespace: string; version: string; legal_consent: boolean }[] }).apps
    .find((item) => item.namespace === namespace);
  expect(reconsentedApp).toMatchObject({ version: '2.0.0', legal_consent: true });

  await fetch(`${fixture}/__fixture/legal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terms: 'NomikOS E2E Terms altered\n' }),
  });
  runLedger('UPDATE marketplace_manifests SET legal_checked_at = 0 WHERE namespace = ?', [namespace]);
  const auditDeadline = Date.now() + 70_000;
  let audited: { status?: string; quarantine_reason?: string; current?: { legal_status?: string } } | undefined;
  while (Date.now() < auditDeadline) {
    const current = await api(`/marketplace/apps/${namespace}`);
    if (current.ok) {
      audited = await current.json() as typeof audited;
      if (audited?.status === 'quarantined') break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  expect(audited).toMatchObject({
    status: 'quarantined',
    quarantine_reason: 'legal:hash_mismatch:terms',
    current: { legal_status: 'hash_mismatch' },
  });
  const drift = await api(`/marketplace/apps/${namespace}/revalidate`, {
    method: 'POST', headers: withH(account.token),
  });
  expect(drift.status).toBe(409);
  const quarantined = (await (await api(`/marketplace/apps/${namespace}`)).json()) as {
    status: string; quarantine_reason: string; current: { legal_status: string };
  };
  expect(quarantined).toMatchObject({
    status: 'quarantined',
    quarantine_reason: 'legal:hash_mismatch:terms',
    current: { legal_status: 'hash_mismatch' },
  });
  const removedFromCatalog = await api('/marketplace/apps');
  expect(((await removedFromCatalog.json()) as { apps: { namespace: string }[] }).apps.some((app) => app.namespace === namespace)).toBe(false);
  const cachedTerms = await api(`/marketplace/apps/${namespace}/legal/terms`);
  expect(cachedTerms.status).toBe(200);
  expect(await cachedTerms.text()).toBe(legalTermsV2);
  const blockedAfterDrift = await api(`/marketplace/apps/${namespace}/tools/echo_paid/call`, {
    method: 'POST', headers: withH(account.token), body: JSON.stringify({ arguments: { message: 'blocked after legal drift' } }),
  });
  expect(blockedAfterDrift.status).toBe(503);

  await fetch(`${fixture}/__fixture/legal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terms: legalTermsV2, privacy: legalPrivacyV2 }),
  });
  const recovered = await api(`/marketplace/apps/${namespace}/revalidate`, {
    method: 'POST', headers: withH(account.token),
  });
  expect(recovered.status).toBe(200);
  expect(((await recovered.json()) as { status: string }).status).toBe('active');
  await fetch(`${fixture}/__fixture/reset`, { method: 'POST' });
});
