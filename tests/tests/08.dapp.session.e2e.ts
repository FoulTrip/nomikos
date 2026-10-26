/**
 * 08.dapp.session.e2e.ts — Gestión de sesión del dapp (Auth.js v5 + proxy.ts).
 *
 * Contrato del ciclo completo contra el Next.js dev server (DAPP_URL,
 * default http://localhost:3000 — `cd dapp && npm run dev`):
 *
 *   ① "/" renderiza el login        ⑤ cookie → /panel renderiza la cuenta
 *   ② /panel sin sesión → /         ⑥ "/" con sesión → /panel
 *   ③ providers expone credentials  ⑦ gateway agéntico: 401 sin sesión,
 *   ④ login vía callback/credentials    200 + tools con Bearer de la cuenta
 *   ⑧ logout destruye la cookie → /panel vuelve a redirigir a /
 *
 * El IdP real es `api` (suite 02); Auth.js solo envuelve su Bearer.
 */
import { test, expect, api, json, randomEmail, randomPassword, dapp, dappCsrf, locationPath, DAPP_URL, LoginSchema, setupAccountLLM } from './_helpers';

test('① "/" renderiza la página de login sin sesión', async () => {
  const res = await dapp('/');
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('Iniciar sesión');
  expect(html).not.toContain('Ficha técnica'); // el shell vive en /panel
});

test('② /panel sin sesión redirige a "/" (proxy.ts)', async () => {
  const res = await dapp('/panel');
  expect(res.status).toBe(307);
  expect(locationPath(res)).toBe('/');
});

test('③ Auth.js expone el provider credentials (IdP de api)', async () => {
  const res = await dapp('/api/auth/providers');
  expect(res.status).toBe(200);
  const providers = (await res.json()) as Record<string, { id: string; type: string }>;
  expect(providers.credentials?.type).toBe('credentials');
});

test('④⑤⑥ login vía Auth.js → cookie → /panel autenticado y "/" redirige a /panel', { timeout: 300_000, retries: 2 }, async () => {
  // cuenta fresca en el IdP real (api)
  const email = randomEmail();
  const password = randomPassword();
  expect((await api('/auth/register', json({ email, password }))).status).toBe(201);

  // login: csrf → callback/credentials → cookie de sesión cifrada
  const jar = new Map<string, string>();
  const csrf = await dappCsrf(jar);
  const login = await dapp('/api/auth/callback/credentials', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf, email, password, callbackUrl: `${DAPP_URL}/panel` }),
  });
  expect(login.status).toBe(302);
  expect(login.headers.get('location')).toContain('/panel');
  expect(jar.size).toBeGreaterThan(0); // cookie de sesión emitida

  // ⑤ /panel con sesión renderiza el email de la cuenta
  const panel = await dapp('/panel', { jar });
  expect(panel.status).toBe(200);
  expect(await panel.text()).toContain(email);

  // ⑥ "/" con sesión redirige a /panel (proxy.ts)
  const root = await dapp('/', { jar });
  expect(root.status).toBe(307);
  expect(locationPath(root)).toBe('/panel');

  // ⑦ el gateway agéntico funciona con el Bearer de la sesión:
  //    brain autentica el token de api y ejecuta tools reales (retries:
  //    usa LLM real, como las suites 05/06). La cuenta trae SU key —
  //    sin LLM configurado el gateway responde 400, no razona.
  const { token: apiToken } = LoginSchema.parse(
    await (await api('/auth/login', json({ email, password }))).json(),
  );
  await setupAccountLLM(apiToken);
  const gw = await dapp('/api/agent/gateway', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Dame el estado de salud de la API' }),
  });
  expect(gw.status).toBe(200);
  const body = (await gw.json()) as { ok: boolean; reply: string; tools_used: string[]; backend: string };
  expect(body.ok).toBe(true);
  expect(body.tools_used).toContain('get_health');
  expect(body.reply.length).toBeGreaterThan(10);

  // ⑧ logout destruye la cookie → /panel vuelve a redirigir a /
  const csrfOut = await dappCsrf(jar);
  const out = await dapp('/api/auth/signout', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrfOut, callbackUrl: `${DAPP_URL}/` }),
  });
  expect(out.status).toBe(302);
  const afterLogout = await dapp('/panel', { jar });
  expect(afterLogout.status).toBe(307);
  expect(locationPath(afterLogout)).toBe('/');
});
// NOTA: el paso ⑦ usa LLM real — retries ante flakiness agéntico (como 05/06).

test('⑦bis el gateway agéntico rechaza sin sesión (401)', async () => {
  const res = await dapp('/api/agent/gateway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'hola' }),
  });
  expect(res.status).toBe(401);
  const body = (await res.json()) as { ok: boolean; error: string };
  expect(body.ok).toBe(false);
});
