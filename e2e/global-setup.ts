import { request, type FullConfig } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { TEST_PASSWORD } from "./helpers";

export default async function globalSetup(config: FullConfig) {
  const baseURL = process.env.E2E_BASE_URL ?? config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  const context = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const response = await context.post("/api/admin/auth/login", {
    headers: { origin: String(baseURL) },
    data: { email: "operator@example.test", password: TEST_PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`Playwright global operator login failed: ${response.status()} ${await response.text()}`);
  }
  const statePath = path.resolve("test-artifacts", "operator-state.json");
  await mkdir(path.dirname(statePath), { recursive: true });
  await context.storageState({ path: statePath });
  await context.dispose();
}
