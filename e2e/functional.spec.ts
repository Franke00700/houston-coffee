import { expect, test } from "@playwright/test";
import { futureWallTime, loginViaUi, openCustomizerAndAdd } from "./helpers";

test.beforeEach(({}, testInfo) => {
  test.skip(!/(chromium|webkit)-390$/.test(testInfo.project.name), "Functional flow is exercised once per engine; visual matrix covers every viewport.");
});

test("full visitor order flow, focus and operator status", async ({ page }) => {
  await page.goto("/menu");
  const trigger = page.getByRole("button", { name: /Настроить/ }).first();
  await trigger.focus();
  const dialog = await openCustomizerAndAdd(page);
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { name: /Добавить/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Закрыть настройку" }).click();
  await page.locator(".floating-cart").click();
  await page.getByLabel("Время получения").fill(futureWallTime());
  await page.getByLabel("Имя").fill("Тестовый посетитель");
  await page.getByLabel("Телефон").fill("+70000000000");

  const submit = page.getByRole("button", { name: /Создать заказ/ });
  await submit.click();
  await expect(page.getByText(/проверьте сумму и подтвердите/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Подтвердить сумму/ })).toBeVisible();
  await page.getByRole("button", { name: /Подтвердить сумму/ }).click();
  const confirmation = page.getByRole("heading", { name: /Номер HC-/ });
  await expect(confirmation).toBeVisible();
  const orderNumber = (await confirmation.textContent())?.match(/HC-[A-Z0-9-]+/)?.[0];
  expect(orderNumber).toBeTruthy();

  await loginViaUi(page, "operator");
  await page.goto("/admin/orders");
  const card = page.locator(".admin-order-card", { hasText: orderNumber });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Ко времени:");
  await card.getByRole("button", { name: "Подтверждён" }).click();
  await expect(card.getByText("Подтверждён", { exact: true })).toBeVisible();
});

test("coffee interactions, cancel/replay, reduced motion and image fallback", async ({ page, context }) => {
  await page.goto("/");
  const stage = page.locator(".cup-stage");
  await expect(stage).toBeVisible();
  const experience = page.locator(".coffee-experience");
  const initialPresentation = Number(await experience.evaluate((element) => getComputedStyle(element).getPropertyValue("--presentation")));
  await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 0.7, behavior: "instant" }));
  await expect.poll(async () => Number(await experience.evaluate((element) => getComputedStyle(element).getPropertyValue("--presentation")))).toBeGreaterThan(initialPresentation);

  await page.getByRole("button", { name: "Следующий напиток" }).click();
  await expect(page.getByText("Латте", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Заварить кофе|Наполнить чашку/ }).click();
  const progress = page.getByRole("progressbar", { name: "Приготовление напитка" });
  await expect(progress).toBeVisible();
  await expect.poll(async () => Number(await progress.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  await expect.poll(async () => parseFloat(await page.locator(".coffee-fill").evaluate((element) => getComputedStyle(element).height))).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(progress).toBeHidden();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: /Заварить кофе|Наполнить чашку/ }).click();
  await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();

  await context.route("**/brand/wordmark.png", (route) => route.abort());
  await page.reload();
  await expect(page.locator(".paper-cup")).toBeVisible();
  await expect(page.getByRole("link", { name: "Настроить и заказать" })).toBeVisible();
});
