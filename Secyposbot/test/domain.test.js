import test from "node:test";
import assert from "node:assert/strict";
import { calculateExpiry, formatAlias, isSubscriptionActive } from "../src/domain.js";

const day = 24 * 60 * 60 * 1000;

test("un plan nuevo vence desde ahora", () => {
  assert.equal(calculateExpiry(null, 30, 1000), 1000 + 30 * day);
});

test("una renovación suma días al vencimiento vigente", () => {
  assert.equal(calculateExpiry(1000 + 5 * day, 30, 1000), 1000 + 35 * day);
});

test("una renovación vencida empieza desde ahora", () => {
  assert.equal(calculateExpiry(500, 30, 1000), 1000 + 30 * day);
});

test("el acceso requiere estado activo y vencimiento futuro", () => {
  assert.equal(isSubscriptionActive({ status: "active", expires_at: 2000 }, 1000), true);
  assert.equal(isSubscriptionActive({ status: "expired", expires_at: 2000 }, 1000), false);
  assert.equal(isSubscriptionActive({ status: "active", expires_at: 1000 }, 1000), false);
});

test("los alias tienen secuencia legible y estable", () => {
  assert.equal(formatAlias(1), "Socio 001");
  assert.equal(formatAlias(1200), "Socio 1200");
});