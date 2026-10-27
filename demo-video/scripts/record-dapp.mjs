#!/usr/bin/env node
/**
 * Graba la dapp real con Playwright (recordVideo) para el fondo YouTube.
 * Requiere api :8080 + dapp :3000 arriba. Sin descargas: usa el Chromium
 * en caché de Playwright (agent-browser lo deja en ~/.cache/ms-playwright).
 *
 *   node scripts/record-dapp.mjs            # sesión completa ~165s
 *   BROWSER_HEADLESS=0 node scripts/record-dapp.mjs   # ver lo que hace
 *
 * Salida: public/browser/session.webm + chapters.json, src/config/browser.json
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/browser');
const API = process.env.API_URL ?? 'http://localhost:8080/api';
const DAPP = process.env.DAPP_URL ?? 'http://localhost:3000';
const CHROME =
  process.env.CHROME_PATH ??
  join(homedir(), '.cache/ms-playwright/chromium-1217/chrome-linux64/chrome');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const elapsed = () => +((Date.now() - t0) / 1000).toFixed(1);
const chapters = [];
async function chapter(name, seconds, fn) {
  const start = elapsed();
  console.log(`[--${start}s] ${name} (${seconds}s)`);
  try {
    await fn();
  } catch (e) {
    console.log(`  aviso en ${name}: ${String(e).slice(0, 140)}`);
  }
  const spent = elapsed() - start;
  if (spent < seconds) await sleep((seconds - spent) * 1000);
  chapters.push({ name, start, end: elapsed() });
}

if (!existsSync(CHROME)) {
  console.error(`ERROR: sin Chromium en ${CHROME} (exporta CHROME_PATH)`);
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

// Cuenta fresca en el IdP real.
const email = `rec-${Date.now()}@video.local`;
const password = 'video-local-12345';
const reg = await fetch(`${API}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (![201, 409].includes(reg.status)) {
  console.error(`ERROR: register → ${reg.status}. ¿api :8080 arriba?`);
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: process.env.BROWSER_HEADLESS !== '0',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
const closeModal = () => page.getByRole('button', { name: 'Cerrar' }).click({ timeout: 4000 });

await chapter('login', 22, async () => {
  await page.goto(`${DAPP}/`, { waitUntil: 'domcontentloaded' });
  const tabs = page.getByRole('tab');
  if (await tabs.count()) await tabs.first().click().catch(() => {});
  await sleep(800);
  await page.locator('input[name="email"]').first().fill(email);
  await page.locator('input[name="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/panel**', { timeout: 30000 });
});

await chapter('panel', 13, async () => {
  // Paseo por el visor 3D: arrastre suave sobre el canvas.
  const canvas = page.locator('canvas').first();
  if (await canvas.count()) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2 - 40, { steps: 24 });
      await page.mouse.up();
    }
  }
});

await chapter('modelos', 30, async () => {
  await page.getByTitle('Proveedor, API key y modelo del agente').click({ timeout: 8000 });
  await sleep(4000);
  await closeModal();
});

await chapter('wallet', 30, async () => {
  await page.getByTitle('Wallet operativa y red blockchain del agente').click({ timeout: 8000 });
  await sleep(4000);
  await closeModal();
});

await chapter('json402', 12, async () => {
  await page.goto('http://localhost:8080/api/x402/protected', { waitUntil: 'domcontentloaded' });
});

await chapter('json200', 8, async () => {
  await page.goto('http://localhost:8080/api/health', { waitUntil: 'domcontentloaded' });
});

await chapter('servicios', 20, async () => {
  await page.goto(`${DAPP}/panel`, { waitUntil: 'domcontentloaded' });
  await page.getByTitle('Dapps que el agente usará con x402').click({ timeout: 8000 });
  await sleep(4000);
  await closeModal();
});

await chapter('flota', 20, async () => {
  await page.getByTitle('Flota de dispositivos: emparejar, instalar y monitorear').click({ timeout: 8000 });
  await sleep(2500);
  const tab = page.getByText('Emparejar', { exact: false });
  if (await tab.count()) await tab.first().click({ timeout: 4000 }).catch(() => {});
});

await chapter('outro', 10, async () => {
  await closeModal().catch(() => {});
});

await ctx.close();
await browser.close();

// session.webm + capítulos + segmentos por escena del video.
const files = (await import('node:fs')).readdirSync(OUT).filter((f) => f.endsWith('.webm'));
if (!files.length) {
  console.error('ERROR: sin webm grabado');
  process.exit(3);
}
renameSync(join(OUT, files[0]), join(OUT, 'session.webm'));
writeFileSync(join(OUT, 'chapters.json'), JSON.stringify(chapters, null, 2));
const at = (n) => chapters.find((c) => c.name === n);
const seg = (names, url, chip, maxLen) => {
  const first = at(names[0]);
  const last = at(names[names.length - 1]);
  const start = Math.max(0, first.start + 1);
  return { startFrom: +start.toFixed(1), endAt: +(start + maxLen).toFixed(1), url, chip, _raw: [first.start, last.end] };
};
const browserJson = {
  session: 'browser/session.webm',
  recordedAt: new Date().toISOString(),
  segments: {
    tesis: seg(['login', 'panel'], 'localhost:3000 → /panel', 'live · acceso panel', 25),
    shields: seg(['modelos'], 'localhost:3000/panel · Modelos', 'live · modelos LLM', 30),
    peaje: seg(['wallet'], 'localhost:3000/panel · Wallet', 'live · wallet dPaaS', 30),
    confirm: seg(['servicios'], 'localhost:3000/panel · Servicios', 'live · servicios x402', 20),
    stack: seg(['json402', 'json200'], 'localhost:8080/api/*', 'live · api rust', 20),
    limites: seg(['flota'], 'localhost:3000/panel · Flota', 'live · flota dPaaS', 20),
  },
};
writeFileSync(join(ROOT, 'src/config/browser.json'), JSON.stringify(browserJson, null, 2));
console.log(`OK: public/browser/session.webm (${elapsed()}s) + src/config/browser.json`);
