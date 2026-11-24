export function isOlderThanOrderCursor(order, cursor) {
  if (!order || !cursor) return false;
  const orderCreatedAt = String(order.created_at ?? "");
  const cursorCreatedAt = String(cursor.created_at ?? "");
  return orderCreatedAt < cursorCreatedAt ||
    (orderCreatedAt === cursorCreatedAt && String(order.id) < String(cursor.id));
}

export function mergeOrderHistory(newest, current) {
  const fresh = Array.isArray(newest) ? newest : [];
  const loaded = Array.isArray(current) ? current : [];
  if (!fresh.length) return loaded;

  const newestIds = new Set(fresh.map(order => order.id));
  const cursor = fresh[fresh.length - 1];
  const older = loaded.filter(order =>
    !newestIds.has(order.id) && isOlderThanOrderCursor(order, cursor)
  );
  return [...fresh, ...older];
}

export function buildOrderCursorFilter(cursor) {
  if (!cursor?.created_at || !cursor?.id) return "";
  return "created_at.lt." + cursor.created_at +
    ",and(created_at.eq." + cursor.created_at + ",id.lt." + cursor.id + ")";
}
