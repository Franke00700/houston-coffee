import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const viewports = [
  ["360", { width: 360, height: 800 }],
  ["390", { width: 390, height: 844 }],
  ["768", { width: 768, height: 1024 }],
  ["1440", { width: 1440, height: 1000 }],
] as const;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "test-artifacts/playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["line"],
    ["html", { outputFolder: "test-artifacts/playwright-report", open: "never" }],
    ["json", { outputFile: "test-artifacts/playwright-results.json" }],
  ],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    ...viewports.map(([name, viewport]) => ({
      name: `chromium-${name}`,
      use: { ...devices["Desktop Chrome"], viewport },
    })),
    ...viewports.map(([name, viewport]) => ({
      name: `webkit-${name}`,
      use: { ...devices["Desktop Safari"], viewport },
    })),
  ],
});
