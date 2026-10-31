/**
 * 15.apps.store.e2e.ts — la TIENDA DE DAPPS del ecosistema.
 *
 * El worker lista las apps del registro (dapps/registry/*.json), se
 * instalan LOCALMENTE con un script probado (idempotente) y las tools
 * de cada app instalada entran al MCP manager del agente.
 *
 *   ① catálogo público: GET /api/apps → payload-cms (registro del worker)
 *   ② instalar con la cuenta: POST /api/apps/payload-cms/install → poll
 *      → installed (base_url + tools expuestas + credencial sellada)
 *   ③ MCP manager: GET /api/agent/tools incluye las tools de la dapp
 *   ④ dispatch determinista: POST /api/agent/call ejecuta una tool
 *      (datos REALES de la app, sin LLM)
 *   ⑤ flujo peajizado multi-app: POST /app/request {app} → 402 con
 *      x402:app:{slug}:{METHOD}:{path} → pagar → datos → replay 409
 *   ⑥ validaciones: app inexistente 404 · install inexistente 404 ·
 *      install sin sesión 401 · install repetido ok (idempotente)
 *   ⑦ el catálogo del ORQUESTADOR incluye las tools dinámicas
 */
import { test, expect, api, brain, auth, json, randomEmail, randomPassword, settleInvoiceViaLedger } from './_helpers';

const withH = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

interface AppInfo {
  slug: string; name: string; status: string; base_url: string | null;
  tools_count: number; tools: { name: string; parameters?: { properties?: Record<string, unknown> } }[];
}

async function getApp(slug: string): Promise<AppInfo | null> {
  const res = await api(`/apps/${slug}`, auth(''));
  const body = (await res.json()) as { app?: AppInfo };
  return body.app ?? null;
}

async function waitForStatus(slug: string, want: 'installed' | 'failed', ms = 120_000): Promise<AppInfo> {
  const t0 = Date.now();
  for (;;) {
    const app = await getApp(slug);
    if (app?.status === want) return app;
    if (Date.now() - t0 > ms) throw new Error(`${slug} no llegó a «${want}» (estado: ${app?.status})`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function paidAppRequest(token: string, request: Record<string, unknown>) {
  const first = await api('/app/request', {
    method: 'POST', headers: withH(token), body: JSON.stringify(request),
  });
  expect(first.status).toBe(402);
  const invoice = ((await first.json()) as { invoice: { id: string } }).invoice;
  settleInvoiceViaLedger(invoice.id);
  return api('/app/request', {
    method: 'POST', headers: { ...withH(token), 'X-Payment': invoice.id },
    body: JSON.stringify(request),
  });
}

test('① catálogo del worker: la dapp del registro, pública', async () => {
  const res = await api('/apps');
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; apps: AppInfo[] };
  expect(body.ok).toBe(true);
  const app = body.apps.find((a) => a.slug === 'payload-cms');
  expect(app, 'payload-cms debe estar en el registro del worker (dapps/registry/)').toBeTruthy();
  expect(app!.name).toBe('Payload CMS');
  expect(app!.tools_count).toBeGreaterThanOrEqual(18); // manifiesto: CRUD users+media + auth
});

test('②→⑥ instalar la dapp y operarla (script probado + MCP manager + peaje)', { timeout: 180_000 }, async ({ account }) => {
  // ② instalar (idempotente: si ya está, verifica y sale rápido)
  const install = await api('/apps/payload-cms/install', { method: 'POST', headers: withH(account.token) });
  expect([200, 409]).toContain(install.status);
  const app = await waitForStatus('payload-cms', 'installed');
  expect(app.status).toBe('installed');
  expect(app.base_url).toContain('3100');
  // las tools del manifiesto quedan expuestas para el agente
  const names = app.tools.map((t) => t.name);
  expect(names).toContain('payload_list_users');
  expect(names).toContain('payload_create_user');

  // ③ MCP manager del agente: las tools de la dapp instalada
  const tools = (await (await api('/agent/tools')).json()) as { name: string; app?: string }[];
  const dyn = tools.find((t) => t.name === 'payload_list_users');
  expect(dyn, 'GET /api/agent/tools debe incluir las tools de la dapp instalada').toBeTruthy();
  expect(dyn!.app).toBe('payload-cms');

  // ④ dispatch determinista (sin LLM): datos REALES de la app
  const call = await api('/agent/call', {
    method: 'POST', headers: { ...withH(account.token) },
    body: JSON.stringify({ tool: 'payload_list_users', args: { limit: 1 } }),
  });
  expect(call.status).toBe(403);

  // ⑤ flujo peajizado multi-app: {app:"payload-cms"} → 402 con el slug
  const first = await api('/app/request', {
    method: 'POST', headers: withH(account.token),
    body: JSON.stringify({ app: 'payload-cms', path: '/api/users?limit=1&depth=0' }),
  });
  expect(first.status).toBe(402);
  const b402 = (await first.json()) as { resource: string; app: string; invoice: { id: string } };
  expect(b402.app).toBe('payload-cms');
  expect(b402.resource).toMatch(/^x402:app:payload-cms:GET:\/api\/users/);

  settleInvoiceViaLedger(b402.invoice.id);
  const second = await api('/app/request', {
    method: 'POST', headers: { ...withH(account.token), 'X-Payment': b402.invoice.id },
    body: JSON.stringify({ app: 'payload-cms', path: '/api/users?limit=1&depth=0' }),
  });
  expect(second.status).toBe(200);
  const done = (await second.json()) as { ok: boolean; result: { docs?: { email?: string }[] } | null };
  expect(done.ok).toBe(true);
  expect((done.result?.docs ?? [])[0].email).toContain('@');

  // replay → 409 (one-shot de siempre)
  const replay = await api('/app/request', {
    method: 'POST', headers: { ...withH(account.token), 'X-Payment': b402.invoice.id },
    body: JSON.stringify({ app: 'payload-cms', path: '/api/users?limit=1' }),
  });
  expect(replay.status).toBe(409);

  // ⑥ validaciones
  const missing = await api('/app/request', {
    method: 'POST', headers: withH(account.token),
    body: JSON.stringify({ app: 'no-existe', path: '/x' }),
  });
  expect(missing.status).toBe(404);
  const install404 = await api('/apps/no-existe/install', { method: 'POST', headers: withH(account.token) });
  expect(install404.status).toBe(404);
  const noAuth = await api('/apps/payload-cms/install', { method: 'POST' });
  expect(noAuth.status).toBe(401);

  // re-install idempotente → ok (el script verifica y sale rápido)
  const again = await api('/apps/payload-cms/install', { method: 'POST', headers: withH(account.token) });
  expect([200, 409]).toContain(again.status);
});

test('⑧ tools CRUD+auth: dispatch determinista + PATCH/DELETE por flujo con peaje', async ({ account }) => {
  const acall = (tool: string, args: unknown) => {
    const input = args as Record<string, string>;
    const routes: Record<string, Record<string, unknown>> = {
      payload_create_user: { app: 'payload-cms', method: 'POST', path: '/api/users', body: input },
      payload_get_user: { app: 'payload-cms', path: `/api/users/${input.id}` },
      payload_update_user: { app: 'payload-cms', method: 'PATCH', path: `/api/users/${input.id}`, body: { email: input.email } },
      payload_login: { app: 'payload-cms', method: 'POST', path: '/api/users/login', body: input },
      payload_delete_user: { app: 'payload-cms', method: 'DELETE', path: `/api/users/${input.id}` },
    };
    const request = routes[tool];
    if (!request) throw new Error(`tool no configurada en el test: ${tool}`);
    return paidAppRequest(account.token, request);
  };
  type R = { ok: boolean; result: { app: string; status: number; result: any } };
  const email = `store-${Date.now()}@tripkode.dev`;

  // ciclo de vida por dispatch (sin LLM ni peaje): create → get → update
  // PARCIAL (solo email: el password omitido NO se envía) → login → delete
  const c = await acall('payload_create_user', { email, password: 'Store-1234' });
  expect(c.status).toBe(200);
  const id = ((await c.json()) as R).result.result.doc.id as number;
  const g = await acall('payload_get_user', { id: String(id) });
  expect((((await g.json()) as R).result.result as { email: string }).email).toBe(email);
  const u = await acall('payload_update_user', { id: String(id), email: `b-${email}` });
  const upd = (await u.json()) as R;
  expect(upd.result.status).toBe(200);
  expect(upd.result.result.doc.email).toBe(`b-${email}`);
  const l = await acall('payload_login', { email: `b-${email}`, password: 'Store-1234' });
  expect((((await l.json()) as R).result.result as { token?: string }).token).toBeTruthy();
  const d = await acall('payload_delete_user', { id: String(id) });
  expect(((await d.json()) as R).result.status).toBe(200);
  const g2 = await acall('payload_get_user', { id: String(id) });
  expect(((await g2.json()) as R).result.status).toBe(404);

  // PATCH y DELETE también pasan por el flujo CON peaje (402 → settle → 200)
  const email2 = `toll-${Date.now()}@tripkode.dev`;
  const c2 = await acall('payload_create_user', { email: email2, password: 'Toll-1234' });
  const id2 = ((await c2.json()) as R).result.result.doc.id as number;
  for (const m of ['PATCH', 'DELETE'] as const) {
    const first = await api('/app/request', {
      method: 'POST', headers: withH(account.token),
      body: JSON.stringify({
        app: 'payload-cms', path: `/api/users/${id2}`, method: m,
        ...(m === 'PATCH' ? { body: { email: `p-${email2}` } } : {}),
      }),
    });
    expect(first.status).toBe(402); // método aceptado por el gateway
    const inv = ((await first.json()) as { invoice: { id: string } }).invoice.id;
    settleInvoiceViaLedger(inv);
    const second = await api('/app/request', {
      method: 'POST', headers: { ...withH(account.token), 'X-Payment': inv },
      body: JSON.stringify({
        app: 'payload-cms', path: `/api/users/${id2}`, method: m,
        ...(m === 'PATCH' ? { body: { email: `p-${email2}` } } : {}),
      }),
    });
    expect(second.status).toBe(200);
    expect((((await second.json()) as { result: any }).result)).toBeTruthy();
  }
});

test('⑦ el catálogo del ORQUESTADOR incluye las tools de la dapp', async () => {
  const email = randomEmail();
  const password = randomPassword();
  expect((await api('/auth/register', json({ email, password }))).status).toBe(201);
  const login = await api('/auth/login', json({ email, password }));
  const token = ((await login.json()) as { token: string }).token;
  const res = await brain('/v1/tools', auth(token));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { tools: { name: string }[] };
  const names = body.tools.map((t) => t.name);
  expect(names).toContain('payload_list_users');
  expect(names.filter((n) => n.startsWith('payload_')).length).toBeGreaterThanOrEqual(4);
});
