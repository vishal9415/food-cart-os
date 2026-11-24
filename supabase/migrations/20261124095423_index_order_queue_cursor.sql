-- Support stable cursor pagination for the owner order queue.
-- The new index covers cart scoping, timestamp ordering and the ID tie-breaker.
drop index if exists public.orders_cart_created_idx;

create index if not exists orders_cart_created_cursor_idx
  on public.orders (cart_id, created_at desc, id desc);
