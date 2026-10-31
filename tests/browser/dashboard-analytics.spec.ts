import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://localhost:8080/api";

test("dashboard presenta gráficas de tokens y tarjetas proporcionadas", async ({ page }) => {
  const email = `qa+dashboard-${Date.now().toString(36)}${randomBytes(4).toString("hex")}@tripkode.dev`;
  const password = `qa-${randomBytes(12).toString("base64url")}`;
  const registration = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: "QA Dashboard" }),
  });
  expect(registration.status, await registration.text()).toBe(201);

  await page.addInitScript(() => window.localStorage.setItem("nomikos-sandbox", "0"));
  await page.goto("/signin");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.waitForURL("**/panel");

  await expect(page.getByRole("heading", { name: "Resumen de la cuenta" })).toBeVisible();
  const tokenSection = page.getByRole("region", { name: "Uso de tokens" });
  for (const label of ["Entrada", "Salida", "Total"]) {
    await expect(tokenSection.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(tokenSection.locator(".recharts-responsive-container")).toHaveCount(3);

  const chartCards = tokenSection.locator('[data-slot="card"]');
  const chartBoxes = await chartCards.evaluateAll((cards) => cards.map((card) => {
    const { x, y, width } = card.getBoundingClientRect();
    return { x, y, width };
  }));
  expect(chartBoxes).toHaveLength(3);
  expect(chartBoxes.every((box) => Math.abs(box.y - chartBoxes[0].y) < 2)).toBe(true);
  expect(Math.max(...chartBoxes.map((box) => box.width)) - Math.min(...chartBoxes.map((box) => box.width)))
    .toBeLessThan(3);

  const toolsCard = page.locator('[data-slot="card"]').filter({ hasText: "Tools por apps" });
  const invoicesCard = page.locator('[data-slot="card"]').filter({ hasText: "Facturas" });
  const budgetCard = page.locator('[data-slot="card"]').filter({ hasText: "Límite diario" });
  await expect(toolsCard).toBeVisible();
  await expect(invoicesCard).toBeVisible();
  await expect(budgetCard).toBeVisible();
  const lowerBoxes = await Promise.all([toolsCard, invoicesCard, budgetCard].map(async (card) =>
    card.evaluate((element) => {
      const { x, y, width } = element.getBoundingClientRect();
      return { x, y, width };
    }),
  ));
  expect(lowerBoxes.every((box) => Math.abs(box.y - lowerBoxes[0].y) < 2)).toBe(true);
  expect(Math.max(...lowerBoxes.map((box) => box.width)) - Math.min(...lowerBoxes.map((box) => box.width)))
    .toBeLessThan(3);

});
