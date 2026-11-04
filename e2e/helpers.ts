import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export const TEST_PASSWORD = process.env.HOUSTON_TEST_PASSWORD ?? "Test-only-password-2026";

export function futureWallTime(minutes = 90) {
  const value = new Date(Date.now() + minutes * 60_000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function futureIso(minutes = 90) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function screenshot(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  const directory = path.resolve("test-artifacts", "screenshots", testInfo.project.name);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage, animations: "disabled" });
}

export async function openCustomizerAndAdd(page: Page) {
  await expect(page.getByRole("heading", { name: "Тестовый латте" })).toBeVisible();
  await page.getByRole("button", { name: /Настроить/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const oat = dialog.getByText("Тестовое овсяное");
  if (await oat.count()) await oat.click();
  const syrup = dialog.getByText("Тестовый сироп");
  if (await syrup.count()) await syrup.click();
  await dialog.getByRole("button", { name: /Добавить/ }).click();
  await expect(dialog.locator(".success-message")).toContainText("Добавлено");
  return dialog;
}

export async function loginViaUi(page: Page, role: "admin" | "operator" = "operator") {
  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill(`${role}@example.test`);
  await page.getByLabel("Пароль").fill(TEST_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/admin"),
    page.getByRole("button", { name: "Войти" }).click(),
  ]);
}

export async function loginApi(request: APIRequestContext, baseURL: string, role: "admin" | "operator" = "operator") {
  const response = await request.post("/api/admin/auth/login", {
    headers: { origin: baseURL },
    data: { email: `${role}@example.test`, password: TEST_PASSWORD },
  });
  expect(response.status()).toBe(200);
  const body = await response.json() as { csrfToken: string; user: { id: string; role: string } };
  return body;
}

export async function orderContext(request: APIRequestContext) {
  const menuResponse = await request.get("/api/public/menu");
  expect(menuResponse.ok()).toBeTruthy();
  const menu = await menuResponse.json() as {
    categories: Array<{ products: Array<{ id: string; options: { sizes: Array<{ id: string }>; milks: Array<{ id: string }>; addOns: Array<{ id: string }> } }> }>;
  };
  const product = menu.categories.flatMap((item) => item.products).find((item) => item.id === "test-product-latte") ?? menu.categories.flatMap((item) => item.products)[0];
  expect(product).toBeTruthy();
  const quoteInput = {
    items: [{
      lineId: `e2e-${crypto.randomUUID()}`,
      productId: product.id,
      sizeId: product.options.sizes[0]?.id,
      milkId: product.options.milks[0]?.id,
      addOnIds: product.options.addOns[0]?.id ? [product.options.addOns[0].id] : [],
      quantity: 1,
    }],
    fulfillment: "PICKUP" as const,
    requestedFor: futureIso(),
  };
  const quoteResponse = await request.post("/api/public/quote", { data: quoteInput });
  expect(quoteResponse.status()).toBe(200);
  const quote = await quoteResponse.json() as { totalMinor: number; issues: unknown[] };
  expect(quote.issues).toEqual([]);
  return { quoteInput, quote };
}
