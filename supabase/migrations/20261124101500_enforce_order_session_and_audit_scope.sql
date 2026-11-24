-- Keep customer session links tenant-scoped and ensure each successful checkout
-- attaches its order to the browser session used to place it.
create unique index if not exists customer_sessions_id_cart_uidx
  on public.customer_sessions (id, cart_id);

alter table public.orders
  drop constraint if exists orders_customer_session_id_fkey;

alter table public.orders
  add constraint orders_customer_session_cart_fkey
  foreign key (customer_session_id, cart_id)
  references public.customer_sessions (id, cart_id);

-- Audit events must belong to the same order, cart and order item.
create unique index if not exists orders_id_cart_uidx
  on public.orders (id, cart_id);

create unique index if not exists order_items_id_order_uidx
  on public.order_items (id, order_id);

alter table public.order_item_status_events
  drop constraint if exists order_item_status_events_order_id_fkey;

alter table public.order_item_status_events
  add constraint order_item_status_events_order_cart_fkey
  foreign key (order_id, cart_id)
  references public.orders (id, cart_id);

alter table public.order_item_status_events
  drop constraint if exists order_item_status_events_order_item_id_fkey;

alter table public.order_item_status_events
  add constraint order_item_status_events_item_order_fkey
  foreign key (order_item_id, order_id)
  references public.order_items (id, order_id);

-- The checkout wrapper owns the session-to-order association. Repair a missing
-- association on an idempotent replay and set it for every newly created order.
create or replace function private.create_guest_order_idempotent(
  p_cart_id uuid,
  p_customer jsonb,
  p_items jsonb,
  p_notes text,
  p_session_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_existing uuid;
  v_order jsonb;
  v_result jsonb;
  v_session_count bigint;
  v_cart_count bigint;
begin
  if not exists (
    select 1 from public.customer_sessions s
    where s.id = p_session_id
      and s.cart_id = p_cart_id
      and s.expires_at > now()
  ) then
    raise exception 'CUSTOMER_SESSION_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('session:' || p_session_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('cart:' || p_cart_id::text, 0));

  select r.order_id into v_existing
  from public.guest_order_requests r
  where r.customer_session_id = p_session_id
    and r.request_id = p_request_id;

  if v_existing is not null then
    update public.orders
      set customer_session_id = p_session_id
      where id = v_existing
        and cart_id = p_cart_id
        and customer_session_id is null;

    select jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'pickup_token', o.pickup_token,
      'subtotal', o.subtotal,
      'tax_amount', o.tax_amount,
      'total_amount', o.total_amount,
      'status', o.status
    ) into v_order
    from public.orders o
    where o.id = v_existing
      and o.cart_id = p_cart_id;

    if v_order is not null then
      return jsonb_build_object('order', v_order, 'replayed', true);
    end if;
  end if;

  select count(*) into v_session_count
  from public.guest_order_requests r
  where r.customer_session_id = p_session_id
    and r.created_at >= now() - interval '1 minute';

  if v_session_count >= 5 then
    raise exception 'RATE_LIMIT_SESSION';
  end if;

  select count(*) into v_cart_count
  from public.guest_order_requests r
  join public.customer_sessions s on s.id = r.customer_session_id
  where s.cart_id = p_cart_id
    and r.created_at >= now() - interval '1 minute';

  if v_cart_count >= 100 then
    raise exception 'RATE_LIMIT_CART';
  end if;

  v_result := public.create_guest_order(p_cart_id, p_customer, p_items, p_notes);

  update public.orders
    set customer_session_id = p_session_id
    where id = (v_result->>'id')::uuid
      and cart_id = p_cart_id;

  if not found then
    raise exception 'ORDER_SESSION_LINK_FAILED';
  end if;

  insert into public.guest_order_requests(customer_session_id, request_id, order_id)
  values (p_session_id, p_request_id, (v_result->>'id')::uuid)
  on conflict (customer_session_id, request_id)
  do update set order_id = excluded.order_id;

  return jsonb_build_object('order', v_result, 'replayed', false);
end;
$function$;
