import { expect, test } from "@playwright/test";
import { futureWallTime, openCustomizerAndAdd, screenshot } from "./helpers";

test.use({ storageState: "test-artifacts/operator-state.json" });

test("visual evidence: public flow and staff queue", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Хьюстон, у нас кофе." })).toBeVisible();
  await screenshot(page, testInfo, "01-home");

  await page.goto("/menu");
  await expect(page.getByRole("heading", { name: "Тестовый латте" })).toBeVisible();
  await screenshot(page, testInfo, "02-menu");

  const dialog = await openCustomizerAndAdd(page);
  await screenshot(page, testInfo, "03-customizer", false);
  await dialog.getByRole("button", { name: "Закрыть настройку" }).click();
  await page.locator(".floating-cart").click();
  await expect(page.getByRole("heading", { name: "Состав заказа" })).toBeVisible();
  await screenshot(page, testInfo, "04-cart-checkout");

  await page.getByLabel("Время получения").fill(futureWallTime());
  await page.getByLabel("Имя").fill("Тестовый посетитель");
  await page.getByLabel("Телефон").fill("+70000000000");
  await page.getByRole("button", { name: "Пересчитать на сервере" }).click();
  await expect(page.getByText(/Актуальная сумма и время/)).toBeVisible();
  await screenshot(page, testInfo, "05-checkout-quoted");

  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { name: /Заказы/ })).toBeVisible();
  await screenshot(page, testInfo, "06-admin-orders");
});
