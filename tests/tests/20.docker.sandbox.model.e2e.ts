/**
 * Sandbox Docker flow: runtime detection, API/object-store GLB delivery, dapp proxy,
 * authenticated setup route, and OS panel session.
 */
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import {
  test, expect, api, dapp, dappCsrf, DAPP_URL,
} from './_helpers';

const MODEL_PATH = path.resolve(
  process.cwd(),
  '../dapp/public/models/ESP32-S3-Touch-AMOLED-1.43.glb',
);

test('sandbox Docker prepara el simulador y sirve el GLB siempre por API', async ({ account }) => {
  // El runtime de Next detecta Docker y comprueba los servicios reales.
  const runtimeRes = await dapp('/api/sandbox/runtime');
  expect(runtimeRes.status).toBe(200);
  const runtime = (await runtimeRes.json()) as {
    docker: boolean;
    apiReady: boolean;
    brainReady: boolean;
    modelReady: boolean;
  };
  expect(runtime).toMatchObject({
    docker: true,
    apiReady: true,
    brainReady: true,
    modelReady: true,
  });

  // El API confirma el objeto disponible y devuelve un GLB real desde storage.
  const modelHead = await api('/device/model/head');
  expect(modelHead.status).toBe(200);

  const apiModel = await api('/device/model');
  expect(apiModel.status).toBe(200);
  expect(apiModel.headers.get('content-type')).toContain('model/gltf-binary');
  expect(
    ['local-s3', 'r2'].includes(apiModel.headers.get('x-object-store-backend') ?? ''),
  ).toBe(true);
  const apiBytes = Buffer.from(await apiModel.arrayBuffer());
  const sourceBytes = await readFile(MODEL_PATH);
  expect(apiBytes.subarray(0, 4).toString('ascii')).toBe('glTF');
  expect(apiBytes.length).toBe(sourceBytes.length);
  expect(Buffer.compare(apiBytes, sourceBytes)).toBe(0);

  // El panel consume el mismo contenido a través del proxy Next.js.
  const dappModel = await dapp('/api/device/model');
  expect(dappModel.status).toBe(200);
  expect(dappModel.headers.get('content-type')).toContain('model/gltf-binary');
  expect(Buffer.compare(Buffer.from(await dappModel.arrayBuffer()), sourceBytes)).toBe(0);

  // Solo una sesión puede pedir la inicialización; si ya está listo es idempotente.
  const noSession = await dapp('/api/sandbox/runtime', { method: 'POST' });
  expect(noSession.status).toBe(401);

  const jar = new Map<string, string>();
  const csrfToken = await dappCsrf(jar);
  const login = await dapp('/api/auth/callback/credentials', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      csrfToken,
      email: account.email,
      password: account.password,
      callbackUrl: `${DAPP_URL}/panel`,
    }),
  });
  expect(login.status).toBe(302);

  const panel = await dapp('/panel', { jar });
  expect(panel.status).toBe(200);

  // El OS virtual completa el ciclo de arranque, emparejado y navegación.
  const initialSimRes = await dapp('/api/account/simulation', { jar });
  expect(initialSimRes.status).toBe(200);
  const initialSim = (await initialSimRes.json()).simulation;
  expect(initialSim.stage).toBe('boot');

  const bootRes = await dapp('/api/account/simulation', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'boot' }),
  });
  expect(bootRes.status).toBe(200);
  const booted = (await bootRes.json()).simulation;
  expect(booted.stage).toBe('claim');
  expect(booted.device_id).toMatch(/^dev-/);
  expect(booted.claim_code).toMatch(/^[0-9A-F]{8}$/);

  const wrongCode = booted.claim_code === 'AAAAAAAA' ? 'BBBBBBBB' : 'AAAAAAAA';
  const rejectedCode = await dapp('/api/account/simulation', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'claim', claim_code: wrongCode }),
  });
  expect(rejectedCode.status).toBe(400);
  const stillWaiting = (await (await dapp('/api/account/simulation', { jar })).json()).simulation;
  expect(stillWaiting).toMatchObject({ stage: 'claim', claim_code: booted.claim_code });

  // Flota en Sandbox valida y empareja el código visible del simulador.
  const claimRes = await dapp('/api/account/simulation', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'claim', claim_code: booted.claim_code }),
  });
  expect(claimRes.status).toBe(200);
  const online = (await claimRes.json()).simulation;
  expect(online).toMatchObject({ stage: 'online', claimed: true, locked: true });

  const lockedPress = await dapp('/api/account/simulation', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'press', target: 'settings' }),
  });
  expect(lockedPress.status).toBe(403);

  const unlockRes = await dapp('/api/account/simulation', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'press', target: 'unlock' }),
  });
  expect((await unlockRes.json()).simulation.locked).toBe(false);
  const settingsRes = await dapp('/api/account/simulation', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'press', target: 'settings' }),
  });
  expect((await settingsRes.json()).simulation.screen).toBe('settings');

  const fleetRes = await dapp('/api/account/devices', { jar });
  expect(fleetRes.status).toBe(200);
  const fleet = (await fleetRes.json()).devices as { id: string }[];
  expect(fleet.some((device) => device.id === booted.device_id)).toBe(true);

  const setup = await dapp('/api/sandbox/runtime', { method: 'POST', jar });
  expect(setup.status).toBe(200);
  expect(await setup.json()).toMatchObject({ ok: true, alreadyReady: true });

  // Producción conserva el proxy que canjea códigos de placas físicas.
  const enrollment = await api('/devices/enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      board: 'esp32-s3-amoled-143',
      name: 'ESP32 físico QA',
      pubkey: `qa-${randomBytes(32).toString('hex')}`,
    }),
  });
  expect(enrollment.status).toBe(201);
  const physical = (await enrollment.json()) as { claim_code: string };
  const productionClaim = await dapp('/api/account/devices/claim', {
    method: 'POST',
    jar,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: physical.claim_code }),
  });
  expect(productionClaim.status).toBe(200);
  expect((await productionClaim.json()).device.execution_environment).toBe('production');
});
