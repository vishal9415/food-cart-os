const RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function serializeReceipt(order, now = Date.now()) {
  return JSON.stringify({ saved_at: now, order });
}

export function restoreReceipt(value, now = Date.now()) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || !parsed.order || typeof parsed.saved_at !== "number") return null;
    const age = now - parsed.saved_at;
    if (!Number.isFinite(age) || age < 0 || age > RECEIPT_TTL_MS) return null;
    return parsed.order;
  } catch {
    return null;
  }
}
