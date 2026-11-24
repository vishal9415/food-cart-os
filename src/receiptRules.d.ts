export function serializeReceipt<T>(order: T, now?: number): string;
export function restoreReceipt<T = unknown>(value: string | null, now?: number): T | null;
