const RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function serializeReceipt(order, now = Date.now()) {
  return JSON.stringify({ saved_at: now, order });
}

export function restoreReceipt(value, now = Date.now()) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const order = parsed.order && typeof parsed.saved_at === "number" ? parsed.order : parsed;
    const savedAt = typeof parsed.saved_at === "number"
      ? parsed.saved_at
      : typeof parsed.created_at === "string" ? Date.parse(parsed.created_at) : NaN;
    const age = now - savedAt;
    if (!order || !Number.isFinite(age) || age < 0 || age > RECEIPT_TTL_MS) return null;
    return order;
  } catch {
    return null;
  }
}
