import test from "node:test";
import assert from "node:assert/strict";
import { restoreReceipt, serializeReceipt } from "../src/receiptRules.js";

const DAY = 24 * 60 * 60 * 1000;

test("receipt is restored within the 30-day window", () => {
  const order = { id: "order-1", order_number: 101 };
  const saved = serializeReceipt(order, 1_000_000);
  assert.deepEqual(restoreReceipt(saved, 1_000_000 + 29 * DAY), order);
});

test("receipt expires after 30 days", () => {
  const saved = serializeReceipt({ id: "order-2" }, 1_000_000);
  assert.equal(restoreReceipt(saved, 1_000_000 + 31 * DAY), null);
});

test("malformed, legacy and future-dated receipts are rejected", () => {
  assert.equal(restoreReceipt("not-json", 1_000_000), null);
  assert.equal(restoreReceipt(JSON.stringify({ id: "legacy" }), 1_000_000), null);
  assert.deepEqual(restoreReceipt(JSON.stringify({ id: "legacy-valid", created_at: new Date(1_000_000).toISOString() }), 1_000_000 + DAY), { id: "legacy-valid", created_at: new Date(1_000_000).toISOString() });
  assert.equal(restoreReceipt(serializeReceipt({ id: "future" }, 2_000_000), 1_000_000), null);
});
