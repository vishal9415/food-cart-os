create index if not exists order_item_status_events_cart_id_idx on public.order_item_status_events(cart_id);
create index if not exists order_item_status_events_changed_by_idx on public.order_item_status_events(changed_by);
create index if not exists order_item_status_events_item_id_idx on public.order_item_status_events(order_item_id);
