import test from "node:test";
import assert from "node:assert/strict";
import { buildOrderCursorFilter, isOlderThanOrderCursor, mergeOrderHistory } from "../src/orderRules.js";

const order = (id, created_at) => ({ id, created_at });

test("cursor filter uses timestamp plus ID tie-breaker", () => {
  const cursor = order("00000000-0000-4000-8000-000000000002", "2026-11-24T10:00:00.000Z");
  assert.equal(
    buildOrderCursorFilter(cursor),
    "created_at.lt.2026-11-24T10:00:00.000Z,and(created_at.eq.2026-11-24T10:00:00.000Z,id.lt.00000000-0000-4000-8000-000000000002)"
  );
  assert.equal(buildOrderCursorFilter(null), "");
});

test("same-timestamp records use ID ordering to avoid skipped or repeated orders", () => {
  const cursor = order("00000000-0000-4000-8000-000000000005", "2026-11-24T10:00:00.000Z");
  assert.equal(isOlderThanOrderCursor(order("00000000-0000-4000-8000-000000000004", cursor.created_at), cursor), true);
  assert.equal(isOlderThanOrderCursor(order("00000000-0000-4000-8000-000000000006", cursor.created_at), cursor), false);
});

test("newest refresh preserves loaded older pages without duplicates", () => {
  const newest = [order("a", "2026-11-24T12:00:00Z"), order("b", "2026-11-24T11:00:00Z")];
  const loaded = [order("b", "2026-11-24T11:00:00Z"), order("c", "2026-11-24T10:00:00Z"), order("d", "2026-11-24T09:00:00Z")];
  assert.deepEqual(mergeOrderHistory(newest, loaded), [...newest, loaded[1], loaded[2]]);
});

test("empty refresh does not discard previously loaded history", () => {
  const loaded = [order("a", "2026-11-24T12:00:00Z")];
  assert.deepEqual(mergeOrderHistory([], loaded), loaded);
});
