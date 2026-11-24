export type OrderCursor = { id: string; created_at: string };
export function isOlderThanOrderCursor<T extends OrderCursor>(order: T, cursor: OrderCursor): boolean;
export function mergeOrderHistory<T extends OrderCursor>(newest: T[], current: T[]): T[];
export function buildOrderCursorFilter(cursor: OrderCursor): string;
