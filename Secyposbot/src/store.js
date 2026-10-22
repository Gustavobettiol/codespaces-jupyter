import { db } from "./db.js";
import { calculateExpiry, formatAlias } from "./domain.js";

const findSubscriber = db.prepare("SELECT * FROM subscribers WHERE telegram_id = ?");
const findThread = db.prepare(`
  SELECT telegram_id FROM threads
  WHERE admin_chat_id = ? AND admin_message_id = ?
`);
const insertThread = db.prepare(`
  INSERT INTO threads (admin_chat_id, admin_message_id, telegram_id)
  VALUES (?, ?, ?)
  ON CONFLICT (admin_chat_id, admin_message_id)
  DO UPDATE SET telegram_id = excluded.telegram_id
`);

const ensureSubscriberTransaction = db.transaction((telegramId, username, now) => {
  const existing = findSubscriber.get(telegramId);
  if (existing) {
    if (username && username !== existing.username) {
      db.prepare("UPDATE subscribers SET username = ? WHERE telegram_id = ?")
        .run(username, telegramId);
      return findSubscriber.get(telegramId);
    }
    return existing;
  }

  const counter = db.prepare("SELECT value FROM counters WHERE name = 'alias'").get();
  const sequence = counter.value + 1;
  db.prepare("UPDATE counters SET value = ? WHERE name = 'alias'").run(sequence);
  db.prepare(`
    INSERT INTO subscribers (telegram_id, username, alias, requested_at)
    VALUES (?, ?, ?, ?)
  `).run(telegramId, username ?? null, formatAlias(sequence), now);
  return findSubscriber.get(telegramId);
});

export function ensureSubscriber(telegramId, username = null, now = Date.now()) {
  return ensureSubscriberTransaction(telegramId, username, now);
}

export function getSubscriber(telegramId) {
  return findSubscriber.get(telegramId) ?? null;
}

export function saveThread(adminChatId, adminMessageId, telegramId) {
  insertThread.run(adminChatId, adminMessageId, telegramId);
}

export function getThreadTelegramId(adminChatId, adminMessageId) {
  return findThread.get(adminChatId, adminMessageId)?.telegram_id ?? null;
}

export function getPayment(paymentId) {
  return db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId) ?? null;
}

export function setPendingPlan(telegramId, planCode) {
  return db.prepare(`
    UPDATE subscribers SET pending_plan_code = ? WHERE telegram_id = ?
  `).run(planCode, telegramId).changes > 0;
}

export function createPayment({ telegramId, proofText, proofFileId, now = Date.now() }) {
  const subscriber = getSubscriber(telegramId);
  if (!subscriber?.pending_plan_code) return { created: false, reason: "no-plan" };

  const pending = db.prepare(`
    SELECT id FROM payments WHERE telegram_id = ? AND status = 'pending'
  `).get(telegramId);
  if (pending) return { created: false, reason: "already-pending", paymentId: pending.id };

  const result = db.prepare(`
    INSERT INTO payments (telegram_id, plan_code, proof_text, proof_file_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(telegramId, subscriber.pending_plan_code, proofText, proofFileId, now);

  return {
    created: true,
    payment: db.prepare("SELECT * FROM payments WHERE id = ?").get(result.lastInsertRowid),
    subscriber,
  };
}

const approvePaymentTransaction = db.transaction((paymentId, adminId, now, plan) => {
  const payment = getPayment(paymentId);
  if (!payment || payment.status !== "pending") return null;

  const subscriber = findSubscriber.get(payment.telegram_id);
  if (!subscriber) return null;

  const expiresAt = calculateExpiry(subscriber.expires_at, plan.days, now);
  db.prepare(`
    UPDATE subscribers
    SET status = 'active', plan_code = ?, pending_plan_code = NULL,
        expires_at = ?, warned_at = NULL
    WHERE telegram_id = ?
  `).run(plan.code, expiresAt, payment.telegram_id);
  db.prepare(`
    UPDATE payments SET status = 'approved', reviewed_at = ?, reviewed_by = ?
    WHERE id = ? AND status = 'pending'
  `).run(now, adminId, paymentId);

  return findSubscriber.get(payment.telegram_id);
});

export function approvePayment(paymentId, adminId, now, plan) {
  return approvePaymentTransaction(paymentId, adminId, now, plan);
}

export function rejectPayment(paymentId, adminId, now = Date.now()) {
  const rejectTransaction = db.transaction(() => {
    const payment = getPayment(paymentId);
    if (!payment || payment.status !== "pending") return null;

    db.prepare(`
      UPDATE payments SET status = 'rejected', reviewed_at = ?, reviewed_by = ?
      WHERE id = ? AND status = 'pending'
    `).run(now, adminId, paymentId);
    db.prepare(`
      UPDATE subscribers SET pending_plan_code = NULL WHERE telegram_id = ?
    `).run(payment.telegram_id);
    return findSubscriber.get(payment.telegram_id);
  });
  return rejectTransaction();
}

export function hasActiveAccess(telegramId, now = Date.now()) {
  const subscriber = getSubscriber(telegramId);
  return subscriber?.status === "active"
    && subscriber.expires_at !== null
    && subscriber.expires_at > now;
}

export function listActiveSubscribers() {
  return db.prepare(`
    SELECT * FROM subscribers WHERE status = 'active' ORDER BY expires_at
  `).all();
}

export function listExpiredSubscribers(now = Date.now()) {
  return db.prepare(`
    SELECT * FROM subscribers
    WHERE status = 'active' AND expires_at <= ?
  `).all(now);
}

export function markExpired(telegramId, now = Date.now()) {
  return db.prepare(`
    UPDATE subscribers SET status = 'expired'
    WHERE telegram_id = ? AND status = 'active' AND expires_at <= ?
  `).run(telegramId, now).changes > 0;
}

export function listSubscribersNeedingWarning(now = Date.now(), days = 3) {
  return db.prepare(`
    SELECT * FROM subscribers
    WHERE status = 'active' AND expires_at > ? AND expires_at <= ? AND warned_at IS NULL
  `).all(now, now + days * 24 * 60 * 60 * 1000);
}

export function markWarned(telegramId, now = Date.now()) {
  return db.prepare(`
    UPDATE subscribers SET warned_at = ?
    WHERE telegram_id = ? AND status = 'active' AND warned_at IS NULL
  `).run(now, telegramId).changes > 0;
}