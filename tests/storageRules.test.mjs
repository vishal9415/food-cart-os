import test from "node:test";
import assert from "node:assert/strict";
import { getOrCreateStoredValue } from "../src/storageRules.js";

test("stored value is reused when browser storage works", () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  const fallback = new Map();
  let generated = 0;
  const create = () => "value-" + (++generated);
  assert.equal(getOrCreateStoredValue("session", create, fallback, () => storage), "value-1");
  assert.equal(getOrCreateStoredValue("session", create, fallback, () => storage), "value-1");
  assert.equal(generated, 1);
});

test("blocked local storage falls back to a stable in-memory value", () => {
  const fallback = new Map();
  let generated = 0;
  const create = () => "volatile-" + (++generated);
  const blocked = () => { throw new Error("SecurityError"); };
  assert.equal(getOrCreateStoredValue("session", create, fallback, blocked), "volatile-1");
  assert.equal(getOrCreateStoredValue("session", create, fallback, blocked), "volatile-1");
  assert.equal(generated, 1);
});

test("storage quota failures keep the generated value for retry idempotency", () => {
  const fallback = new Map();
  let generated = 0;
  const create = () => "request-" + (++generated);
  const full = {
    getItem: () => null,
    setItem: () => { throw new Error("QuotaExceededError"); },
  };
  assert.equal(getOrCreateStoredValue("request", create, fallback, () => full), "request-1");
  assert.equal(getOrCreateStoredValue("request", create, fallback, () => full), "request-1");
  assert.equal(generated, 1);
});
