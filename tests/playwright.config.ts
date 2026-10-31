import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: process.env.DAPP_URL ?? "http://localhost:3000",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
});
