create index if not exists menu_items_category_cart_idx
  on public.menu_items (category_id, cart_id);

create index if not exists order_item_status_events_item_order_idx
  on public.order_item_status_events (order_item_id, order_id);

create index if not exists order_item_status_events_order_cart_idx
  on public.order_item_status_events (order_id, cart_id);

create index if not exists orders_customer_session_cart_idx
  on public.orders (customer_session_id, cart_id, created_at desc);
