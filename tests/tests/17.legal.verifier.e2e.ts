/**
 * 17.legal.verifier.e2e.ts — Verificador legal S2 (casos nativos dpaas-toll-dispute y call-billing-dispute).
 *
 * Determinista, sin LLM: ledger en api, motor de reglas, world/, checklist,
 * HITL (escalado/firma), ownership, one-shot y aislamiento del ground truth.
 */
import { test, expect, api, brain, json } from './_helpers';

const CASE = 'dpaas-toll-dispute';
const PASS_MEMO =
  'FINDINGS dPaaS toll dispute. ' +
  '1. Ledger shows settled invoice-ledger.md:x402-demo-0001. ' +
  '2. Daily usage is within limits-policy.md:§2. ' +
  '3. Settlement confirmed in settlement-proof.md:sig-1.';

async function newRun(token: string, caseId: string = CASE): Promise<string> {
  const res = await api('/legal/runs', {
    ...json({ case_id: caseId }),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { run: { id: string; status: string } };
  expect(body.run.status).toBe('draft');
  return body.run.id;
}

async function submit(token: string, runId: string, memorandum: string) {
  const res = await api(`/legal/runs/${runId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ memorandum }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    run: { status: string; can_sign: boolean };
    verdicts: { verdict: string; omissions: { id: string }[]; score: number }[];
  };
}

test('sin Bearer → 401; caso inexistente → 404', async () => {
  const noauth = await api('/legal/runs', json({ case_id: CASE }));
  expect(noauth.status).toBe(401);
});

test('crear run exige caso válido', async ({ account }) => {
  const bad = await api('/legal/runs', {
    ...json({ case_id: 'no-existe' }),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
  });
  expect(bad.status).toBe(404);
  const rid = await newRun(account.token);
  expect(rid.startsWith('run-')).toBe(true);
});

test('Files API visible: lista docs + lee contenido; traversal → 400', async ({ account }) => {
  const list = await api(`/legal/cases/${CASE}/docs`, {
    headers: { Authorization: `Bearer ${account.token}` },
  });
  expect(list.status).toBe(200);
  const docs = (await list.json()) as { docs: string[] };
  expect(docs.docs).toEqual(['invoice-ledger.md', 'limits-policy.md', 'settlement-proof.md']);
  const doc = await api(`/legal/cases/${CASE}/docs/invoice-ledger.md`, {
    headers: { Authorization: `Bearer ${account.token}` },
  });
  expect(doc.status).toBe(200);
  const body = (await doc.json()) as { content: string };
  expect(body.content).toContain('settled');
  const trav = await api(`/legal/cases/${CASE}/docs/..%2F..%2Fetc`, {
    headers: { Authorization: `Bearer ${account.token}` },
  });
  expect([400, 404]).toContain(trav.status);
});

test('turns: append agent ok; role=world prohibido (403)', async ({ account }) => {
  const rid = await newRun(account.token);
  const t = await api(`/legal/runs/${rid}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ role: 'agent', content: 'plan S1' }),
  });
  expect(t.status).toBe(200);
  const w = await api(`/legal/runs/${rid}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ role: 'world', content: 'hack' }),
  });
  expect(w.status).toBe(403);
});

test('reglas: pass con 3 citas → verified, score 1, firmable', async ({ account }) => {
  const rid = await newRun(account.token);
  const r = await submit(account.token, rid, PASS_MEMO);
  expect(r.run.status).toBe('verified');
  const v = r.verdicts.at(-1)!;
  expect(v.verdict).toBe('pass');
  expect(v.score).toBe(1);
  expect(r.run.can_sign).toBe(true);
});

test('reglas: omisión C2 → fail + escalated (auto), firma → 400', async ({ account }) => {
  const rid = await newRun(account.token);
  const r = await submit(account.token, rid, PASS_MEMO.replace('limits-policy.md:§2', '???'));
  expect(r.run.status).toBe('escalated');
  const ids = r.verdicts.at(-1)!.omissions.map((o) => o.id);
  expect(ids).toContain('C2');
  expect(r.run.can_sign).toBe(false);
  const sign = await api(`/legal/runs/${rid}/signoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ attorney: 'Ada <BAR-1>' }),
  });
  expect(sign.status).toBe(400);
});

test('reglas: alucinación refund-ledger → HALLUCINATION; pocas citas → MIN_CITATIONS', async ({
  account,
}) => {
  const r1 = await newRun(account.token);
  const h = await submit(account.token, r1, `${PASS_MEMO} Ver refund-ledger.md:§1.`);
  expect(h.verdicts.at(-1)!.omissions.map((o) => o.id)).toContain('HALLUCINATION');
  const r2 = await newRun(account.token);
  const m = await submit(account.token, r2, 'Solo invoice-ledger.md:x402-demo-0001.');
  expect(m.verdicts.at(-1)!.omissions.map((o) => o.id)).toContain('MIN_CITATIONS');
});

test('world: new_evidence sin refusal → REFUSAL; con refusal → pass', async ({ account }) => {
  const r1 = await newRun(account.token);
  const w = await api(`/legal/runs/${r1}/world`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ kind: 'new_evidence', doc: 'adjustment-note.md', excerpt: 'peritaje' }),
  });
  expect(w.status).toBe(200);
  const f = await submit(account.token, r1, PASS_MEMO);
  expect(f.verdicts.at(-1)!.omissions.map((o) => o.id)).toContain('REFUSAL');

  const r2 = await newRun(account.token);
  await api(`/legal/runs/${r2}/world`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ kind: 'new_evidence', doc: 'adjustment-note.md', excerpt: 'peritaje' }),
  });
  const p = await submit(
    account.token,
    r2,
    `${PASS_MEMO} Nota: adjustment-note.md aún insuficiente, requiero el peritaje completo.`,
  );
  expect(p.verdicts.at(-1)!.verdict).toBe('pass');
});

test('world: validación (doc inseguro/kind/auth → 400/401)', async ({ account }) => {
  const rid = await newRun(account.token);
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` };
  const t1 = await api(`/legal/runs/${rid}/world`, {
    method: 'POST', headers: H, body: JSON.stringify({ kind: 'new_evidence', doc: '../x.md' }),
  });
  expect(t1.status).toBe(400);
  const t2 = await api(`/legal/runs/${rid}/world`, {
    method: 'POST', headers: H, body: JSON.stringify({ kind: 'hack' }),
  });
  expect(t2.status).toBe(400);
  const t3 = await api(
    `/legal/runs/${rid}/world`,
    json({ kind: 'new_evidence', doc: 'exhibit-E.md' }),
  );
  expect(t3.status).toBe(401);
});

test('corrección: fail → re-submit pass (2 veredictos, verified)', async ({ account }) => {
  const rid = await newRun(account.token);
  const f = await submit(account.token, rid, 'malo');
  expect(f.run.status).toBe('escalated');
  const p = await submit(account.token, rid, PASS_MEMO);
  expect(p.run.status).toBe('verified');
  expect(p.verdicts.length).toBe(2);
});

test('checklist: pending → pass/missing + world cited', async ({ account }) => {
  const rid = await newRun(account.token);
  const H = { Authorization: `Bearer ${account.token}` };
  const c0 = (await (await api(`/legal/runs/${rid}/checklist`, { headers: H })).json()) as {
    checklist: { status: string }[];
    can_sign: boolean;
  };
  expect(c0.checklist.map((i) => i.status)).toEqual(['pending', 'pending', 'pending']);
  expect(c0.can_sign).toBe(false);
  await submit(account.token, rid, 'solo invoice-ledger.md:x402-demo-0001');
  const c1 = (await (await api(`/legal/runs/${rid}/checklist`, { headers: H })).json()) as {
    checklist: { id: string; status: string }[];
    world: unknown[];
    verdict: string;
  };
  const m = Object.fromEntries(c1.checklist.map((i) => [i.id, i.status]));
  expect(m).toEqual({ C1: 'pass', C2: 'missing', C3: 'missing' });
  expect(c1.verdict).toBe('fail');
});

test('events polling + stream SSE', async ({ account }) => {
  const rid = await newRun(account.token);
  const H = { Authorization: `Bearer ${account.token}` };
  const ev = (await (await api(`/legal/runs/${rid}/events?since=0`, { headers: H })).json()) as {
    events: { kind: string }[];
  };
  expect(ev.events.length).toBeGreaterThanOrEqual(1);
  const ev2 = (await (
    await api(`/legal/runs/${rid}/events?since=9999999999999`, { headers: H })
  ).json()) as { events: unknown[] };
  expect(ev2.events).toEqual([]);
  const stream = await api(`/legal/runs/${rid}/stream`, { headers: H });
  expect(stream.status).toBe(200);
  expect(stream.headers.get('content-type')).toContain('text/event-stream');
  expect(await stream.text()).toContain('event: run');
});

test('signoff: pass → signed; replay → 409; run inmutable (409×4)', async ({ account }) => {
  const rid = await newRun(account.token);
  await submit(account.token, rid, PASS_MEMO);
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` };
  const s = await api(`/legal/runs/${rid}/signoff`, {
    method: 'POST', headers: H, body: JSON.stringify({ attorney: 'Ada <BAR-1>' }),
  });
  expect(s.status).toBe(200);
  const replay = await api(`/legal/runs/${rid}/signoff`, {
    method: 'POST', headers: H, body: JSON.stringify({ attorney: 'Bob <BAR-2>' }),
  });
  expect(replay.status).toBe(409);
  const t = await api(`/legal/runs/${rid}/turns`, {
    method: 'POST', headers: H, body: JSON.stringify({ role: 'agent', content: 'x' }),
  });
  const sb = await api(`/legal/runs/${rid}/submit`, {
    method: 'POST', headers: H, body: JSON.stringify({ memorandum: PASS_MEMO }),
  });
  const wd = await api(`/legal/runs/${rid}/world`, {
    method: 'POST', headers: H, body: JSON.stringify({ kind: 'new_evidence', doc: 'adjustment-note.md' }),
  });
  const es = await api(`/legal/runs/${rid}/escalate`, { method: 'POST', headers: H, body: '{}' });
  expect([t.status, sb.status, wd.status, es.status]).toEqual([409, 409, 409, 409]);
});

test('ownership: otra cuenta → 403 en get/checklist', async ({ account }) => {
  const rid = await newRun(account.token);
  const email = `qa+${Date.now()}@tripkode.dev`;
  await api('/auth/register', json({ email, password: 'qa-segura-12345' }));
  const login = (await (
    await api('/auth/login', json({ email, password: 'qa-segura-12345' }))
  ).json()) as { token: string };
  const H = { Authorization: `Bearer ${login.token}` };
  expect((await api(`/legal/runs/${rid}`, { headers: H })).status).toBe(403);
  expect((await api(`/legal/runs/${rid}/checklist`, { headers: H })).status).toBe(403);
});

test('segundo caso nativo: call-billing-dispute pass → verified', async ({ account }) => {
  const rid = await newRun(account.token, 'call-billing-dispute');
  const list = await api('/legal/cases/call-billing-dispute/docs', {
    headers: { Authorization: `Bearer ${account.token}` },
  });
  expect(list.status).toBe(200);
  const r = await submit(account.token, rid,
    'FINDINGS call billing. 1. Record call-record.md:call-2026-0007 shows 4 paid minutes. ' +
    '2. Cadence toll-cadence.md:§1 bills one invoice per minute. ' +
    '3. Price toll-cadence.md:§2 is 1000 lamports per minute.');
  expect(r.run.status).toBe('verified');
  expect(r.verdicts.at(-1)!.verdict).toBe('pass');
  expect(r.verdicts.at(-1)!.score).toBe(1);
});

test('aislamiento GT: brain no expone checklist/ground/verdict como tools', async () => {
  const res = await brain('/v1/tools');
  expect(res.status).toBe(200);
  const body = (await res.json()) as { tools: { name: string }[] };
  const names = body.tools.map((t) => t.name);
  expect(names).toContain('list_case_docs');
  expect(names).toContain('submit_memorandum');
  expect(names.filter((n) => /checklist|ground|verdict/i.test(n))).toEqual([]);
});
