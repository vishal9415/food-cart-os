export function getOrCreateStoredValue(
  key: string,
  createValue: () => string,
  fallback: Map<string, string>,
  getStorage: () => Pick<Storage, "getItem" | "setItem">
): string;
