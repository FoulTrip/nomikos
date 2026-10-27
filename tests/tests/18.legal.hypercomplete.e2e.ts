/**
 * 18.legal.hypercomplete.e2e.ts — E2E hipercompleto del workshop S1+S2.
 *
 * Cubre las 8 fases contra el stack real (api :8080 + brain :8322 + ui :8765):
 * fixtures/ground_truth aislado, S1 (runner python + Files API + tools),
 * motor de reglas, world/ (API+CLI), gate S2 del gateway (LLM real),
 * UI estática, checklist, HITL completo y regresión de contratos.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, api, brain, json, API_URL, BRAIN_URL, setupAccountLLM } from './_helpers';

const CASE = 'northbridge-v-caldera';
const UI_URL = process.env.UI_URL ?? 'http://localhost:8765';
const PASS_MEMO =
  'MEMORÁNDUM Northbridge v. Caldera. ' +
  '1. Incumplimiento material 12 días > §3.2: exhibit-A.md:§3. ' +
  '2. Fecha admitida: exhibit-B.md:2026-03-14. ' +
  '3. Fuerza mayor 5 días: contract.md:cláusula 9.';

const H = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

async function newRun(token: string): Promise<string> {
  const res = await api('/legal/runs', {
    method: 'POST',
    headers: H(token),
    body: JSON.stringify({ case_id: CASE }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { run: { id: string } }).run.id;
}

test('F0 fixtures: cases visibles + ground_truth 0600 + UI sirve', async () => {
  const perm = execSync('stat -c %a ../ground_truth/northbridge-v-caldera/checklist.json')
    .toString()
    .trim();
  expect(perm).toBe('600');
  const gtDir = execSync('stat -c %a ../ground_truth').toString().trim();
  expect(gtDir).toBe('700');
  for (const p of ['/', '/app.js', '/style.css']) {
    const r = await fetch(`${UI_URL}${p}`);
    expect(r.status).toBe(200);
  }
  const html = await (await fetch(`${UI_URL}/?run=run-x`)).text();
  expect(html).toContain('Verifier UI');
});

test('F1+F2 ledger+reglas: ciclo completo pass→signed→inmutable', async ({ account }) => {
  const rid = await newRun(account.token);
  // turnos de traza
  for (const c of ['plan S1', 'hallazgo §3']) {
    const t = await api(`/legal/runs/${rid}/turns`, {
      method: 'POST',
      headers: H(account.token),
      body: JSON.stringify({ role: 'agent', content: c }),
    });
    expect(t.status).toBe(200);
  }
  // world antes del submit + refusal explícita → pass
  const w = await api(`/legal/runs/${rid}/world`, {
    method: 'POST',
    headers: H(account.token),
    body: JSON.stringify({ kind: 'new_evidence', doc: 'exhibit-D.md', excerpt: 'peritaje' }),
  });
  expect(w.status).toBe(200);
  const sub = await api(`/legal/runs/${rid}/submit`, {
    method: 'POST',
    headers: H(account.token),
    body: JSON.stringify({ memorandum: `${PASS_MEMO} exhibit-D.md insuficiente, requiero peritaje.` }),
  });
  expect(sub.status).toBe(200);
  const detail = (await sub.json()) as {
    run: { status: string; can_sign: boolean };
    verdicts: { verdict: string; score: number }[];
    turns: unknown[];
    events: { kind: string }[];
  };
  expect(detail.run.status).toBe('verified');
  expect(detail.verdicts.at(-1)!.verdict).toBe('pass');
  expect(detail.turns.length).toBeGreaterThanOrEqual(3); // plan + hallazgo + submit (+world)
  expect(detail.events.map((e) => e.kind)).toEqual(
    expect.arrayContaining(['created', 'new_evidence', 'submitted', 'verdict']),
  );
  // checklist coherente con veredicto
  const cl = (await (
    await api(`/legal/runs/${rid}/checklist`, { headers: { Authorization: `Bearer ${account.token}` } })
  ).json()) as { checklist: { status: string }[]; verdict: string; world: { cited: boolean }[] };
  expect(cl.verdict).toBe('pass');
  expect(new Set(cl.checklist.map((i) => i.status))).toEqual(new Set(['pass']));
  // firma + replay + inmutabilidad
  const s = await api(`/legal/runs/${rid}/signoff`, {
    method: 'POST',
    headers: H(account.token),
    body: JSON.stringify({ attorney: 'Hyper <BAR-18>' }),
  });
  expect(s.status).toBe(200);
  expect(((await s.json()) as { run: { status: string } }).run.status).toBe('signed');
  const replay = await api(`/legal/runs/${rid}/signoff`, {
    method: 'POST',
    headers: H(account.token),
    body: JSON.stringify({ attorney: 'Otro <BAR-0>' }),
  });
  expect(replay.status).toBe(409);
});

test('F4 S1 runner python: --memo-file pass y fail', async ({ account }) => {
  const dir = mkdtempSync(join(tmpdir(), 's1-'));
  const okMemo = join(dir, 'ok.md');
  const badMemo = join(dir, 'bad.md');
  writeFileSync(okMemo, PASS_MEMO);
  writeFileSync(badMemo, 'memo sin citas');
  const run = (f: string) =>
    JSON.parse(
      execSync(`BEARER=${account.token} python3 run.py --case ${CASE} --memo-file ${f} --api ${API_URL}`, {
        cwd: join(process.cwd(), '../agent'),
        timeout: 60_000,
      }).toString(),
    ) as { status: string; verdict: string; omissions: unknown[]; score: number };
  const ok = run(okMemo);
  expect(ok.status).toBe('verified');
  expect(ok.verdict).toBe('pass');
  expect(ok.score).toBe(1);
  const bad = run(badMemo);
  expect(bad.status).toBe('escalated');
  expect(bad.verdict).toBe('fail');
  expect(bad.omissions.length).toBeGreaterThan(0);
});

test('F3 world CLI python: inyecta + hace tail', async ({ account }) => {
  const rid = await newRun(account.token);
  const out = JSON.parse(
    execSync(
      `BEARER=${account.token} python3 inject.py --run ${rid} --doc exhibit-D.md --excerpt "cli-hyper" --api ${API_URL}`,
      { cwd: join(process.cwd(), '../world'), timeout: 30_000 },
    ).toString(),
  ) as { ok: boolean; last: { payload: { doc: string } } };
  expect(out.ok).toBe(true);
  expect(out.last.payload.doc).toBe('exhibit-D.md');
  const tail = JSON.parse(
    execSync(`BEARER=${account.token} python3 inject.py --run ${rid} --tail --api ${API_URL}`, {
      cwd: join(process.cwd(), '../world'),
      timeout: 30_000,
    }).toString(),
  ) as { events: { kind: string }[] };
  expect(tail.events.map((e) => e.kind)).toContain('new_evidence');
});

test(
  'F5 gate S2 en gateway real (LLM cuenta): tools legales + campo verification',
  { timeout: 300_000, retries: 2 },
  async ({ account }) => {
    await setupAccountLLM(account.token);
    const res = await brain('/v1/agentic-gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
      body: JSON.stringify({
        device_id: 'hypercomplete',
        text: 'Lista los documentos visibles del caso northbridge-v-caldera con la tool list_case_docs y dime sus nombres.',
      }),
    });
    expect(res.status).toBe(200);
    const gw = (await res.json()) as {
      ok: boolean;
      reply: string;
      tools_used: string[];
      shield_in: { verdict: string };
      shield_out: { verdict: string };
      backend: string;
      verification: Record<string, unknown>;
    };
    expect(gw.ok).toBe(true);
    expect(gw.tools_used).toContain('list_case_docs');
    expect(gw.backend).toBe('account:nvidia-nim');
    expect(gw.shield_in.verdict).toBe('safe');
    expect(gw.verification).toBeDefined();
    expect(gw.reply.length).toBeGreaterThan(20);
  },
);

test('F7 device crea pero no firma; humano sí', async ({ account }) => {
  const enroll = (await (
    await api('/devices/enroll', json({ board: 'esp32-s3-amoled-143', pubkey: 'HyperDevicePubkey11111111111111111111', name: 'hyper' }))
  ).json()) as { device_id: string; claim_code: string; enroll_secret: string };
  const claim = await api('/devices/claim', {
    method: 'POST',
    headers: H(account.token),
    body: JSON.stringify({ code: enroll.claim_code }),
  });
  expect(claim.status).toBe(200);
  const dtok = (await (
    await api('/devices/token', json({ device_id: enroll.device_id, enroll_secret: enroll.enroll_secret }))
  ).json()) as { token: string };
  const rid = await newRun(dtok.token);
  const sub = await api(`/legal/runs/${rid}/submit`, {
    method: 'POST',
    headers: H(dtok.token),
    body: JSON.stringify({ memorandum: PASS_MEMO }),
  });
  expect(sub.status).toBe(200);
  const devSign = await api(`/legal/runs/${rid}/signoff`, {
    method: 'POST',
    headers: H(dtok.token),
    body: JSON.stringify({ attorney: 'Device <BAR-0>' }),
  });
  expect(devSign.status).toBe(403);
  const humSign = await api(`/legal/runs/${rid}/signoff`, {
    method: 'POST',
    headers: H(account.token),
    body: JSON.stringify({ attorney: 'Humana <BAR-18>' }),
  });
  expect(humSign.status).toBe(200);
});

test('contratos intactos: 401 sin Bearer + LLM_NOT_CONFIGURED sin proveedor', async ({
  account,
}) => {
  const noauth = await brain('/v1/agentic-gateway', json({ device_id: 'x', text: 'hola' }));
  expect(noauth.status).toBe(401);
  const nollm = await brain('/v1/agentic-gateway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ device_id: 'x', text: 'hola' }),
  });
  expect(nollm.status).toBe(400);
  expect(((await nollm.json()) as { code: string }).code).toBe('LLM_NOT_CONFIGURED');
  // api health + brain health vivos
  expect((await api('/health')).status).toBe(200);
  expect((await brain('/v1/health')).status).toBe(200);
  expect(BRAIN_URL).toContain('8322');
});
