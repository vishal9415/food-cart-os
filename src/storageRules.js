export function getOrCreateStoredValue(key, createValue, fallback, getStorage) {
  if (fallback.has(key)) return fallback.get(key);
  let candidate;
  try {
    const storage = getStorage();
    const existing = storage.getItem(key);
    if (existing) return existing;
    candidate = createValue();
    storage.setItem(key, candidate);
    return candidate;
  } catch {
    if (!fallback.has(key)) fallback.set(key, candidate ?? createValue());
    return fallback.get(key);
  }
}
