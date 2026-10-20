import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDirectory = mkdtempSync(join(tmpdir(), "secyposbot-test-"));
process.env.BOT_TOKEN = "123456:testing-token";
process.env.CHANNEL_ID = "-1001234567890";
process.env.ADMIN_IDS = "123456789";
process.env.DB_PATH = join(testDirectory, "test.sqlite");

const { db, migrate } = await import("../src/db.js");
migrate();
const store = await import("../src/store.js");

beforeEach(() => {
  db.exec("DELETE FROM payments; DELETE FROM subscribers; UPDATE counters SET value = 0 WHERE name = 'alias';");
});

after(() => {
  db.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

test("crear un registro asigna un alias y es idempotente", () => {
  const first = store.ensureSubscriber(42, "usuario", 1000);
  const again = store.ensureSubscriber(42, "usuario", 2000);

  assert.equal(first.alias, "Socio 001");
  assert.equal(again.alias, first.alias);
  assert.equal(again.requested_at, 1000);
});

test("el pago solo activa una vez y la renovación extiende el vencimiento", () => {
  const now = 1_000_000;
  const plan = { code: "base", days: 30 };
  const subscriber = store.ensureSubscriber(42, "usuario", now);
  store.setPendingPlan(42, plan.code);

  const paymentResult = store.createPayment({
    telegramId: 42,
    proofText: "transferencia realizada",
    proofFileId: null,
    now,
  });
  assert.equal(paymentResult.created, true);
  assert.equal(store.createPayment({ telegramId: 42, proofText: "duplicado" }).reason, "already-pending");

  const active = store.approvePayment(paymentResult.payment.id, 7, now, plan);
  assert.equal(active.status, "active");
  assert.equal(active.expires_at, now + 30 * 24 * 60 * 60 * 1000);
  assert.equal(store.approvePayment(paymentResult.payment.id, 7, now, plan), null);

  store.setPendingPlan(42, plan.code);
  const renewal = store.createPayment({ telegramId: 42, proofText: "renovación", now: now + 100 });
  const renewed = store.approvePayment(renewal.payment.id, 7, now + 100, plan);
  assert.equal(renewed.expires_at, active.expires_at + 30 * 24 * 60 * 60 * 1000);
  assert.equal(store.hasActiveAccess(42, now + 100), true);
  assert.equal(subscriber.alias, renewed.alias);
});

test("rechazar pago libera al usuario para enviar otro comprobante", () => {
  store.ensureSubscriber(42, "usuario", 1000);
  store.setPendingPlan(42, "base");
  const payment = store.createPayment({ telegramId: 42, proofText: "comprobante", now: 1000 });

  const rejected = store.rejectPayment(payment.payment.id, 7, 2000);
  assert.equal(rejected.pending_plan_code, null);
  assert.equal(store.getPayment(payment.payment.id).status, "rejected");
  assert.equal(store.rejectPayment(payment.payment.id, 7, 3000), null);
});