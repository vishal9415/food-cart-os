const MAX_ITEM_QUANTITY = 999;
const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeCart(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean = {};
  for (const [id, rawQuantity] of Object.entries(value)) {
    const quantity = Number(rawQuantity);
    if (UUID.test(id) && Number.isInteger(quantity) && quantity > 0) clean[id] = Math.min(MAX_ITEM_QUANTITY, quantity);
  }
  return clean;
}
export function restoreCart(serialized, now = Date.now()) {
  try {
    const saved = JSON.parse(serialized);
    if (!saved || typeof saved !== "object" || !Number.isFinite(saved.savedAt)) return {};
    const age = now - saved.savedAt;
    if (age < -5 * 60 * 1000 || age > CART_TTL_MS) return {};
    return sanitizeCart(saved.items);
  } catch { return {}; }
}
export function serializeCart(cart, now = Date.now()) {
  return JSON.stringify({ savedAt: now, items: sanitizeCart(cart) });
}
export function setCartItemQuantity(cart, itemId, quantity) {
  if (!UUID.test(itemId)) return { ...cart };
  const next = { ...cart };
  const safeQuantity = Number.isFinite(Number(quantity)) ? Math.trunc(Number(quantity)) : 0;
  if (safeQuantity <= 0) delete next[itemId];
  else next[itemId] = Math.min(MAX_ITEM_QUANTITY, safeQuantity);
  return next;
}
export function getUnavailableCartItems(cart, menu) {
  return Object.entries(cart).filter(([id, quantity]) => quantity > 0 && !menu.some(item => item.id === id && item.is_available));
}
export function calculateCartTotal(cart, menu) {
  return menu.reduce((sum, item) => {
    if (!item.is_available) return sum;
    const quantity = Number(cart[item.id] || 0), price = Number(item.price);
    return Number.isInteger(quantity) && quantity > 0 && Number.isFinite(price) && price >= 0 ? sum + price * quantity : sum;
  }, 0);
}
