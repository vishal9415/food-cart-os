import test from "node:test";
import assert from "node:assert/strict";
import { calculateCartTotal, getUnavailableCartItems, restoreCart, sanitizeCart, serializeCart, setCartItemQuantity } from "../src/cartRules.js";
const itemA = "11111111-1111-4111-8111-111111111111";
const itemB = "22222222-2222-4222-8222-222222222222";

test("basket survives reload for up to 30 days", () => {
  const saved = serializeCart({ [itemA]: 2 }, 1_000_000);
  assert.deepEqual(restoreCart(saved, 1_000_001), { [itemA]: 2 });
  assert.deepEqual(restoreCart(saved, 1_000_000 + 30 * 24 * 60 * 60 * 1000 + 1), {});
});
test("malformed, invalid and excessive quantities are sanitised", () => {
  assert.deepEqual(sanitizeCart({ [itemA]: 1005, nope: 2, [itemB]: -1 }), { [itemA]: 999 });
  assert.deepEqual(restoreCart("{broken"), {});
});
test("deleted or unavailable items stay detectable and removable", () => {
  const cart = { [itemA]: 1, [itemB]: 2 };
  assert.deepEqual(getUnavailableCartItems(cart, [{ id: itemA, price: 50, is_available: true }]), [[itemB, 2]]);
  assert.deepEqual(setCartItemQuantity(cart, itemB, 0), { [itemA]: 1 });
});
test("unavailable items do not inflate subtotal", () => {
  const cart = { [itemA]: 2, [itemB]: 3 };
  const menu = [{ id: itemA, price: 40, is_available: true }, { id: itemB, price: 90, is_available: false }];
  assert.equal(calculateCartTotal(cart, menu), 80);
});
test("quantity controls enforce checkout maximum and remove at zero", () => {
  assert.deepEqual(setCartItemQuantity({}, itemA, 1000), { [itemA]: 999 });
  assert.deepEqual(setCartItemQuantity({ [itemA]: 1 }, itemA, -1), {});
});
