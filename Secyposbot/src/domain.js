const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateExpiry(currentExpiry, planDays, now = Date.now()) {
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  return base + planDays * DAY_MS;
}

export function isSubscriptionActive(subscriber, now = Date.now()) {
  return subscriber?.status === "active"
    && Number.isFinite(subscriber.expires_at)
    && subscriber.expires_at > now;
}

export function formatAlias(sequence) {
  return `Socio ${String(sequence).padStart(3, "0")}`;
}