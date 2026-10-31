/**
 * 19.environment.partition.e2e.ts — entorno, red, wallet y atribución de
 * ejecuciones reales de tools de apps, pasando por el gateway x402.
 */
import { createServer } from 'node:http';
import {
  test, expect, api, json, LoginSchema, InvoiceSchema,
  randomEmail, randomPassword, settleInvoiceViaLedger, runLedger,
} from './_helpers';

test('sandbox/devnet y producción/mainnet aíslan facturas, tools y wallets', { timeout: 45_000 }, async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, docs: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('mock app no obtuvo puerto');

  const suffix = Date.now().toString();
  const slug = `e2e-env-${suffix}`;
  const baseUrl = `http://host.docker.internal:${address.port}`;
  const email = `env-${suffix}${randomEmail()}`;
  const password = randomPassword();
  let accountId = '';

  try {
    const reg = await api('/auth/register', json({ email, password }));
    expect(reg.status).toBe(201);
    const login = LoginSchema.parse(await (await api('/auth/login', json({ email, password }))).json());
    accountId = login.account_id;
    const headers = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' };

    // La app de prueba solo vive durante este test; el servicio mock no hace
    // escrituras y permite completar el tramo real POST /app/request → X-Payment.
    const now = Date.now();
    runLedger(
      'INSERT INTO apps (slug,name,status,base_url,tools,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      [slug, 'E2E environment', 'installed', baseUrl, '[]', now, now],
    );

    const requestTool = async (authHeaders: Record<string, string>, toolName: string) => {
      const body = JSON.stringify({
        app: slug, path: '/api/items?limit=3', method: 'GET', tool_name: toolName,
      });
      const challenge = await api('/app/request', { method: 'POST', headers: authHeaders, body });
      expect(challenge.status).toBe(402);
      const invoice = InvoiceSchema.parse((await challenge.json()).invoice);
      settleInvoiceViaLedger(invoice.id);
      const call = await api('/app/request', {
        method: 'POST',
        headers: { ...authHeaders, 'X-Payment': invoice.id },
        body,
      });
      expect(call.status).toBe(200);
      expect((await call.json()).result).toEqual({ ok: true, docs: [] });
      return invoice;
    };

    const boot = await api('/accounts/me/simulation/step', {
      method: 'POST', headers,
      body: JSON.stringify({ action: 'boot' }),
    });
    expect(boot.status).toBe(200);
    const bootState = (await boot.json()).simulation;
    expect(bootState.device_id).toBeTruthy();
    const claim = await api('/accounts/me/simulation/step', {
      method: 'POST', headers,
      body: JSON.stringify({ action: 'claim' }),
    });
    expect(claim.status).toBe(200);
    const simState = (await claim.json()).simulation;
    expect(simState.stage).toBe('online');
    expect(simState.token).toBeTruthy();
    const simHeaders = {
      Authorization: `Bearer ${simState.token}`,
      'Content-Type': 'application/json',
    };

    // Aunque la cuenta cambie a mainnet, un tool llamado desde el dispositivo
    // simulado debe conservar sandbox/devnet y su device_id.
    const mainnet = await api('/accounts/me/chain', {
      method: 'PUT', headers,
      body: JSON.stringify({ network: 'mainnet' }),
    });
    expect(mainnet.status).toBe(200);

    const sandboxInvoice = await requestTool(simHeaders, 'list_e2e_items');
    expect(sandboxInvoice.execution_environment).toBe('sandbox');
    expect(sandboxInvoice.network).toBe('devnet');
    expect(sandboxInvoice.device_id).toBe(bootState.device_id);

    const sandboxSummary = await (await api('/accounts/me/x402/summary?environment=sandbox', { headers })).json();
    expect(sandboxSummary.invoices_total).toBe(1);
    expect(sandboxSummary.dpaas.network).toBe('devnet');
    expect(sandboxSummary.dpaas.wallets.every((w: { network: string }) => w.network !== 'mainnet')).toBe(true);
    const sandboxUsage = await (await api('/accounts/me/tool-usage?environment=sandbox', { headers })).json();
    expect(sandboxUsage.total).toBe(1);
    expect(sandboxUsage.usage[0]).toMatchObject({
      app: slug, tool: 'list_e2e_items', uses: 1, device_id: bootState.device_id,
      execution_environment: 'sandbox', network: 'devnet',
    });
    const sandboxInvoices = await (await api('/accounts/me/x402/invoices?environment=sandbox', { headers })).json();
    expect(sandboxInvoices.invoices).toHaveLength(1);
    expect(sandboxInvoices.invoices[0]).toMatchObject({
      execution_environment: 'sandbox', network: 'devnet', device_id: bootState.device_id,
    });

    const productionInvoice = await requestTool(headers, 'list_e2e_items');
    expect(productionInvoice.execution_environment).toBe('production');
    expect(productionInvoice.network).toBe('mainnet');

    const productionSummary = await (await api('/accounts/me/x402/summary?environment=production', { headers })).json();
    expect(productionSummary.invoices_total).toBe(1);
    expect(productionSummary.dpaas.network).toBe('mainnet');
    expect(productionSummary.dpaas.wallets.length).toBeGreaterThan(0);
    expect(productionSummary.dpaas.wallets.every((w: { network: string }) => w.network === 'mainnet')).toBe(true);
    const productionUsage = await (await api('/accounts/me/tool-usage?environment=production', { headers })).json();
    expect(productionUsage.total).toBe(1);
    expect(productionUsage.usage[0]).toMatchObject({
      app: slug, tool: 'list_e2e_items', uses: 1,
      execution_environment: 'production', network: 'mainnet', device_id: null,
    });
    const productionInvoices = await (await api('/accounts/me/x402/invoices?environment=production', { headers })).json();
    expect(productionInvoices.invoices).toHaveLength(1);
    expect(productionInvoices.invoices[0]).toMatchObject({
      execution_environment: 'production', network: 'mainnet', device_id: null,
    });

    const sandboxAfterProduction = await (await api('/accounts/me/x402/summary?environment=sandbox', { headers })).json();
    expect(sandboxAfterProduction.invoices_total).toBe(1);
    const noCrossNetworkWallet = await api('/accounts/me/x402/summary?environment=unknown', { headers });
    expect(noCrossNetworkWallet.status).toBe(400);
  } finally {
    if (accountId) {
      for (const table of [
        'app_tool_calls', 'x402_invoices', 'x402_payouts', 'sessions',
        'simulation_states', 'devices', 'account_services', 'account_wallets',
        'account_connected_wallets', 'account_chain_wallets', 'account_chain',
        'account_llm_providers',
      ]) {
        runLedger(`DELETE FROM ${table} WHERE account_id = ?`, [accountId]);
      }
      runLedger('DELETE FROM accounts WHERE id = ?', [accountId]);
      runLedger('DELETE FROM apps WHERE slug = ?', [slug]);
    } else {
      runLedger('DELETE FROM apps WHERE slug = ?', [slug]);
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
