/**
 * 07.escalability.e2e.ts — ESCALABILIDAD: multi-cuenta concurrente, sesiones
 * paralelas, carga de lectura y carrera de registro (integridad bajo concurrencia).
 */
import { test, expect, api, json, auth, randomEmail, randomPassword, LoginSchema } from './_helpers';

test('20 cuentas en paralelo: register + login + contexto (presupuesto 25 s)', { timeout: 60_000 }, async () => {
  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: 20 }, async () => {
      const email = randomEmail();
      const password = randomPassword();
      const reg = await api('/auth/register', json({ email, password }));
      const login = await api('/auth/login', json({ email, password }));
      const token = LoginSchema.parse(await login.json()).token;
      const ctx = await api('/accounts/me/context', auth(token));
      return { reg: reg.status, login: login.status, ctx: ctx.status };
    }),
  );
  const elapsed = Date.now() - started;
  for (const r of results) {
    expect(r.reg).toBe(201);
    expect(r.login).toBe(200);
    expect(r.ctx).toBe(200);
  }
  expect(elapsed).toBeLessThan(25_000); // concurrencia real, no serializada
  console.log(`20 cuentas completas en ${elapsed} ms`);
});

test('una cuenta abre 10 sesiones simultáneas — todas válidas e independientes', async () => {
  const email = randomEmail();
  const password = randomPassword();
  await api('/auth/register', json({ email, password }));

  const sessions = await Promise.all(
    Array.from({ length: 10 }, async () => {
      const login = await api('/auth/login', json({ email, password }));
      return LoginSchema.parse(await login.json()).token;
    }),
  );
  expect(new Set(sessions).size).toBe(10); // tokens únicos
  // todas las sesiones sirven a la vez
  const mes = await Promise.all(sessions.map((t) => api('/auth/me', auth(t))));
  for (const me of mes) expect(me.status).toBe(200);
});

test('lectura bajo carga: 30 /navbar + 30 /health concurrentes → 200 en todas', { timeout: 30_000 }, async () => {
  const started = Date.now();
  const calls = await Promise.all([
    ...Array.from({ length: 30 }, () => api('/navbar')),
    ...Array.from({ length: 30 }, () => api('/health')),
  ]);
  for (const res of calls) expect(res.status).toBe(200);
  console.log(`60 lecturas concurrentes en ${Date.now() - started} ms`);
});

test('integridad bajo carrera: 8 registros paralelos del MISMO email → exactamente 1 × 201 y 7 × 409', async () => {
  const email = randomEmail();
  const password = randomPassword();
  const attempts = await Promise.all(
    Array.from({ length: 8 }, () => api('/auth/register', json({ email, password }))),
  );
  const statuses = attempts.map((r) => r.status).sort();
  expect(statuses.filter((s) => s === 201)).toHaveLength(1);
  expect(statuses.filter((s) => s === 409)).toHaveLength(7);
});

test('aislamiento multi-tenant: facturas de una cuenta nunca aparecen en otra', async () => {
  // dos cuentas paralelas, cada una genera su factura
  const setup = await Promise.all(
    Array.from({ length: 2 }, async () => {
      const email = randomEmail();
      const password = randomPassword();
      await api('/auth/register', json({ email, password }));
      const login = await api('/auth/login', json({ email, password }));
      return LoginSchema.parse(await login.json()).token;
    }),
  );
  const invoices = await Promise.all(setup.map((t) => api('/device', { headers: { Authorization: `Bearer ${t}` } })));
  const ids = await Promise.all(
    invoices.map(async (res) => {
      const body = PaymentRequiredBody.parse(await res.json());
      return body.invoice.id;
    }),
  );
  expect(new Set(ids).size).toBe(2); // facturas distintas por cuenta
  // y cada cuenta solo ve la suya
  const [listA, listB] = await Promise.all(setup.map((t) => api('/accounts/me/x402/invoices', auth(t))));
  const invsA = ((await listA.json()) as { invoices: { id: string }[] }).invoices.map((i) => i.id);
  const invsB = ((await listB.json()) as { invoices: { id: string }[] }).invoices.map((i) => i.id);
  expect(invsA).toContain(ids[0]);
  expect(invsA).not.toContain(ids[1]);
  expect(invsB).toContain(ids[1]);
  expect(invsB).not.toContain(ids[0]);
});

import { z } from 'zod';
const PaymentRequiredBody = z.object({
  invoice: z.object({ id: z.string(), account_id: z.string() }),
});
