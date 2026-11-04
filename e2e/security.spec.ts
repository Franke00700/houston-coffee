import { expect, test } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { Client } from "pg";
import { futureIso, loginApi, orderContext } from "./helpers";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-1440", "HTTP security suite runs once against the shared production server.");
});

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const databaseURL = process.env.DATABASE_URL;

test("guest isolation, operator RBAC, CSRF/origin, logout and expiry", async ({ playwright }) => {
  const guest = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  expect((await guest.get("/api/admin/orders")).status()).toBe(401);
  expect((await guest.get(`/api/public/orders/HC-NOT-A-SECRET`)).status()).toBe(404);

  const operator = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const { csrfToken, user } = await loginApi(operator, baseURL, "operator");
  expect((await operator.get("/api/admin/orders")).status()).toBe(200);
  expect((await operator.get("/api/admin/staff")).status()).toBe(403);
  expect((await operator.patch("/api/admin/settings", { headers: { origin: baseURL, "x-csrf-token": csrfToken }, data: { notice: "forbidden" } })).status()).toBe(403);
  expect((await operator.patch("/api/admin/variants/test-variant-medium", { headers: { origin: baseURL, "x-csrf-token": csrfToken }, data: { priceMinor: 1 } })).status()).toBe(403);
  expect((await operator.patch("/api/admin/orders/unknown/status", { headers: { origin: baseURL }, data: { status: "CONFIRMED" } })).status()).toBe(403);
  expect((await operator.patch("/api/admin/orders/unknown/status", { headers: { origin: "https://attacker.invalid", "x-csrf-token": csrfToken }, data: { status: "CONFIRMED" } })).status()).toBe(403);

  const logout = await operator.post("/api/admin/auth/logout", { headers: { origin: baseURL, "x-csrf-token": csrfToken } });
  expect(logout.status()).toBe(204);
  expect((await operator.get("/api/admin/orders")).status()).toBe(401);

  test.skip(!databaseURL, "DATABASE_URL is required for server-side expiry verification.");
  const expiring = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  await loginApi(expiring, baseURL, "operator");
  const expiringState = await expiring.storageState();
  const expiringToken = expiringState.cookies.find((cookie) => cookie.name === "houston_staff")?.value;
  expect(expiringToken).toBeTruthy();
  const expiringTokenHash = createHash("sha256").update(expiringToken!).digest("hex");
  const client = new Client({ connectionString: databaseURL });
  await client.connect();
  const expired = await client.query(
    'UPDATE "StaffSession" SET "expiresAt" = timezone(\'UTC\', now()) - interval \'1 minute\' WHERE "tokenHash" = $1 AND "userId" = $2 RETURNING id',
    [expiringTokenHash, user.id],
  );
  expect(expired.rowCount).toBeGreaterThan(0);
  await client.end();
  expect((await expiring.get("/api/admin/orders")).status()).toBe(401);
});

test("HTTP price protection and idempotency including connection loss", async ({ request }) => {
  const { quoteInput, quote } = await orderContext(request);
  const key = `http_${randomUUID().replaceAll("-", "")}`;
  const payload = { ...quoteInput, expectedTotalMinor: quote.totalMinor, customer: { name: "Тест HTTP", phone: "+70000000001" } };
  const first = await request.post("/api/public/orders", { headers: { "Idempotency-Key": key }, data: payload });
  expect(first.status()).toBe(201);
  const result = await first.json() as { orderNumber: string };
  const second = await request.post("/api/public/orders", { headers: { "Idempotency-Key": key }, data: payload });
  expect(second.status()).toBe(200);
  expect((await second.json()).orderNumber).toBe(result.orderNumber);
  const conflict = await request.post("/api/public/orders", { headers: { "Idempotency-Key": key }, data: { ...payload, comment: "другое тело" } });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");

  const concurrentKey = `concurrent_${randomUUID().replaceAll("-", "")}`;
  const concurrentPayload = { ...payload, requestedFor: futureIso(110) };
  const concurrentResponses = await Promise.all(Array.from({ length: 6 }, () => request.post("/api/public/orders", {
    headers: { "Idempotency-Key": concurrentKey },
    data: concurrentPayload,
  })));
  expect(concurrentResponses.every((response) => [200, 201].includes(response.status()))).toBeTruthy();
  const concurrentNumbers = await Promise.all(concurrentResponses.map(async (response) => (await response.json()).orderNumber as string));
  expect(new Set(concurrentNumbers).size).toBe(1);

  const forged = await request.post("/api/public/orders", {
    headers: { "Idempotency-Key": `forged_${randomUUID().replaceAll("-", "")}` },
    data: { ...payload, clientPriceMinor: 1 },
  });
  expect(forged.status()).toBe(400);

  test.skip(!databaseURL, "DATABASE_URL is required for price-change and retry evidence.");
  const db = new Client({ connectionString: databaseURL });
  await db.connect();
  await db.query('UPDATE "ProductVariant" SET "priceMinor" = "priceMinor" + 100 WHERE id = $1', ["test-variant-medium"]);
  const changed = await request.post("/api/public/orders", { headers: { "Idempotency-Key": `price_${randomUUID().replaceAll("-", "")}` }, data: payload });
  expect(changed.status()).toBe(409);
  expect((await changed.json()).error.code).toBe("PRICE_CHANGED");
  await db.query('UPDATE "ProductVariant" SET "priceMinor" = "priceMinor" - 100 WHERE id = $1', ["test-variant-medium"]);

  const retryKey = `loss_${randomUUID().replaceAll("-", "")}`;
  const retryPayload = { ...payload, requestedFor: futureIso(120), customer: { name: "Тест потери связи", phone: "+70000000002" } };
  await new Promise<void>((resolve) => {
    const body = JSON.stringify(retryPayload);
    const url = new URL("/api/public/orders", baseURL);
    const options = { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), "idempotency-key": retryKey } };
    const req = url.protocol === "https:"
      ? https.request(url, { ...options, rejectUnauthorized: false })
      : http.request(url, options);
    req.on("error", () => resolve());
    req.on("socket", () => setTimeout(() => { req.destroy(); resolve(); }, 10));
    req.end(body);
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const retry = await request.post("/api/public/orders", { headers: { "Idempotency-Key": retryKey }, data: retryPayload });
  expect([200, 201]).toContain(retry.status());
  const keyHash = createHash("sha256").update(JSON.stringify(retryKey)).digest("hex");
  const counts = await db.query('SELECT count(*)::int AS count FROM "OrderIdempotency" WHERE "keyHash" = $1', [keyHash]);
  expect(counts.rows[0].count).toBe(1);
  await db.end();
});
