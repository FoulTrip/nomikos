import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://localhost:8080/api";
const DAPP_URL = process.env.DAPP_URL ?? "http://localhost:3000";

test("panel sandbox carga el GLB de API/R2 y detecta Docker desde Instalador", async ({ page }) => {
  const appDeprecationWarnings: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "warning" &&
      /THREE\.Clock:|using deprecated parameters for the initialization function/.test(message.text())
    ) {
      appDeprecationWarnings.push(message.text());
    }
  });

  const email = `qa+browser-${Date.now().toString(36)}${randomBytes(4).toString("hex")}@tripkode.dev`;
  const password = `qa-${randomBytes(12).toString("base64url")}`;
  const registration = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: "QA Browser" }),
  });
  expect(registration.status, await registration.text()).toBe(201);

  // Escuchar desde antes de hidratar para cubrir también el preload del visor.
  const modelResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/device/model",
  );

  await page.addInitScript(() => {
    window.localStorage.setItem("nomikos-sandbox", "1");
    window.sessionStorage.setItem("nomikos-selected-sandbox-device", "qa-unselected-device");
  });
  await page.goto("/signin");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.waitForURL("**/panel");

  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  const modelResponse = await modelResponsePromise;
  expect(modelResponse.status()).toBe(200);
  expect(modelResponse.headers()["content-type"]).toContain("model/gltf-binary");
  // Leer el cuerpo con un request independiente evita que Chromium pierda el
  // buffer del preload al cambiar de página durante el login.
  const modelCheck = await page.request.get(new URL("/api/device/model", DAPP_URL).toString());
  expect(modelCheck.status()).toBe(200);
  expect(modelCheck.headers()["content-type"]).toContain("model/gltf-binary");
  const model = await modelCheck.body();
  expect(model.subarray(0, 4).toString("ascii")).toBe("glTF");

  // El Canvas R3F y el overlay del loader comprueban que el GLB fue procesado
  // por el visor, además de haberse recibido por el endpoint API/R2.
  await page.locator("canvas").first().waitFor({ state: "visible" });
  await expect(page.getByText(/Cargando modelo 3D/)).toHaveCount(0, { timeout: 45_000 });
  expect(appDeprecationWarnings).toEqual([]);

  await page.getByRole("button", { name: "Ficha técnica" }).click();
  const simulatorOption = page.getByRole("group", { name: "ESP32-S3-Touch-AMOLED-1.43" });
  await expect(simulatorOption).toContainText("NomikOS");
  await expect(simulatorOption).toContainText("En línea");
  await expect(simulatorOption.getByRole("button", { name: "Usar" })).toBeVisible();
  await simulatorOption.getByRole("button", { name: "Usar" }).click();
  await expect(simulatorOption.getByRole("button", { name: "En uso" })).toBeDisabled();

  for (const label of ["Wallet", "Modelos", "DApps", "Flota"]) {
    const navButton = page.getByRole("button", { name: label, exact: true });
    await expect(navButton).toHaveText(label);
    await expect(navButton.locator("svg")).toHaveCount(0);
    const normalColor = await navButton.evaluate((element) => getComputedStyle(element).color);
    await navButton.hover();
    await expect.poll(() => navButton.evaluate((element) => getComputedStyle(element).color)).not.toBe(normalColor);
  }

  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch("/api/account/simulation", { cache: "no-store" });
    return (await response.json()).simulation?.stage;
  })).toBe("claim");
  const simulation = await page.evaluate(async () => {
    const response = await fetch("/api/account/simulation", { cache: "no-store" });
    return (await response.json()).simulation as { claim_code: string; device_id: string };
  });
  expect(simulation.claim_code).toMatch(/^[0-9A-F]{8}$/);

  await page.getByRole("button", { name: "Flota" }).click();
  await page.getByRole("tab", { name: "Emparejar" }).click();
  await page.locator("#fleet-claim").fill(simulation.claim_code);
  const sandboxClaimResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/account/simulation" &&
      response.request().method() === "POST" &&
      response.request().postDataJSON().claim_code === simulation.claim_code,
  );
  await page.getByRole("button", { name: "Emparejar dispositivo" }).click();
  const sandboxClaimResponse = await sandboxClaimResponsePromise;
  expect(sandboxClaimResponse.status()).toBe(200);
  expect((await sandboxClaimResponse.json()).simulation).toMatchObject({ stage: "online", claimed: true });
  await expect(page.getByText("Simulador NomikOS Sim (docker) emparejado.")).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch("/api/account/simulation", { cache: "no-store" });
    return (await response.json()).simulation?.stage;
  })).toBe("online");

  await page.getByRole("tab", { name: "Instalador" }).click();
  await expect(page.getByText("Simulador del dispositivo + OS")).toBeVisible();
  await expect(page.getByText("Docker: detectado")).toBeVisible();
  await expect(page.getByText("API: listo · brain: listo")).toBeVisible();
  await expect(page.getByText("Modelo 3D desde API/R2: listo")).toBeVisible();

  const detectionPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/sandbox/runtime" &&
      response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Detectar Docker" }).click();
  const detection = await detectionPromise;
  expect(detection.status()).toBe(200);
  expect(await detection.json()).toMatchObject({
    docker: true,
    apiReady: true,
    brainReady: true,
    modelReady: true,
  });
  await expect(page.getByText("Docker: detectado")).toBeVisible();
  await expect(page.getByText("Modelo 3D desde API/R2: listo")).toBeVisible();
});
