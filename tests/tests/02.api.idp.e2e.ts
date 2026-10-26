/**
 * 02.api.idp.e2e.ts — IdP email+password: ciclo completo y seguridad
 * (401/409/400/429/revocación). Usa el fixture de cuenta efímera.
 */
import { test, expect, api, json, auth, randomEmail, LoginSchema, RegisterSchema } from './_helpers';

test('registro → login → me → logout → reuso del token (401)', async ({ account }) => {
  // me con el token de la fixture
  const me = await api('/auth/me', auth(account.token));
  expect(me.status).toBe(200);
  const profile = (await me.json()) as { account: { email: string; id: string } };
  expect(profile.account.email).toBe(account.email);
  expect(profile.account.id).toBe(account.accountId);

  // logout revoca
  const out = await api('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${account.token}` } });
  expect(out.status).toBe(200);
  const reuse = await api('/auth/me', auth(account.token));
  expect(reuse.status).toBe(401); // revocación inmediata
});

test('registro duplicado → 409', async ({ account }) => {
  const res = await api('/auth/register', json({ email: account.email, password: 'otra-clave-123' }));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: string };
  expect(body.error).toContain('ya registrado');
});

test('password débil → 400 y email inválido → 400', async () => {
  const weak = await api('/auth/register', json({ email: randomEmail(), password: 'corto' }));
  expect(weak.status).toBe(400);
  const badEmail = await api('/auth/register', json({ email: 'no-es-email', password: 'valida-12345' }));
  expect(badEmail.status).toBe(400);
});

test('login con password incorrecto → 401 (y con el correcto → token Bearer)', async ({ account }) => {
  const bad = await api('/auth/login', json({ email: account.email, password: 'incorrecta-123' }));
  expect(bad.status).toBe(401);
  const good = await api('/auth/login', json({ email: account.email, password: account.password }));
  expect(good.status).toBe(200);
  const login = LoginSchema.parse(await good.json());
  expect(login.token).not.toBe(account.token); // sesión nueva distinta
});

test('me sin token → 401', async () => {
  const res = await api('/auth/me');
  expect(res.status).toBe(401);
});

test('anti-bruteforce: 5 fallos → 6º intento → 429', async () => {
  const email = randomEmail();
  await api('/auth/register', json({ email, password: 'correcta-horse-1' }));
  for (let i = 0; i < 5; i++) {
    const fail = await api('/auth/login', json({ email, password: 'mala-clave-00' }));
    expect(fail.status).toBe(401);
  }
  const blocked = await api('/auth/login', json({ email, password: 'mala-clave-00' }));
  expect(blocked.status).toBe(429);
});

test('contrato del registro (201 + schema zod)', async () => {
  const res = await api('/auth/register', json({ email: randomEmail(), password: 'contrato-12345' }));
  expect(res.status).toBe(201);
  RegisterSchema.parse(await res.json());
});
