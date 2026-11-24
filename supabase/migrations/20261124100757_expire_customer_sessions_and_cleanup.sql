create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

alter table public.orders
  drop constraint if exists orders_customer_session_cart_fkey;

alter table public.orders
  add constraint orders_customer_session_cart_fkey
  foreign key (customer_session_id, cart_id)
  references public.customer_sessions (id, cart_id)
  on delete set null (customer_session_id);

alter table public.guest_order_requests
  drop constraint if exists guest_order_requests_customer_session_id_fkey;

alter table public.guest_order_requests
  add constraint guest_order_requests_customer_session_id_fkey
  foreign key (customer_session_id)
  references public.customer_sessions (id)
  on delete cascade;

create index if not exists customer_sessions_expires_at_idx
  on public.customer_sessions (expires_at);

create or replace function private.create_guest_order_with_session(
  p_cart_id uuid,
  p_token_hash text,
  p_customer jsonb,
  p_items jsonb,
  p_notes text,
  p_request_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_session_id uuid;
  v_existing uuid;
  v_order jsonb;
  v_result jsonb;
  v_session_count bigint;
  v_cart_count bigint;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'CUSTOMER_SESSION_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cart:' || p_cart_id::text, 0));

  select s.id into v_session_id
  from public.customer_sessions s
  where s.token_hash = p_token_hash
    and s.cart_id = p_cart_id
    and s.expires_at > now()
  for update;

  if v_session_id is not null then
    update public.customer_sessions
      set expires_at = now() + interval '30 days'
      where id = v_session_id;

    select r.order_id into v_existing
    from public.guest_order_requests r
    where r.customer_session_id = v_session_id
      and r.request_id = p_request_id;

    if v_existing is not null then
      update public.orders
        set customer_session_id = v_session_id
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
        return jsonb_build_object(
          'order', v_order,
          'replayed', true,
          'customer_session_id', v_session_id
        );
      end if;
    end if;
  else
    delete from public.customer_sessions
    where token_hash = p_token_hash
      and cart_id = p_cart_id
      and expires_at <= now();
  end if;

  select count(*) into v_cart_count
  from public.guest_order_requests r
  join public.customer_sessions s on s.id = r.customer_session_id
  where s.cart_id = p_cart_id
    and r.created_at >= now() - interval '1 minute';

  if v_cart_count >= 100 then
    raise exception 'RATE_LIMIT_CART';
  end if;

  if v_session_id is null then
    insert into public.customer_sessions(token_hash, cart_id, expires_at)
    values (p_token_hash, p_cart_id, now() + interval '30 days')
    on conflict (token_hash, cart_id)
    do update set expires_at = excluded.expires_at
    returning id into v_session_id;
  end if;

  select count(*) into v_session_count
  from public.guest_order_requests r
  where r.customer_session_id = v_session_id
    and r.created_at >= now() - interval '1 minute';

  if v_session_count >= 5 then
    raise exception 'RATE_LIMIT_SESSION';
  end if;

  v_result := public.create_guest_order(p_cart_id, p_customer, p_items, p_notes);

  update public.orders
    set customer_session_id = v_session_id
    where id = (v_result->>'id')::uuid
      and cart_id = p_cart_id;

  if not found then
    raise exception 'ORDER_SESSION_LINK_FAILED';
  end if;

  insert into public.guest_order_requests(customer_session_id, request_id, order_id)
  values (v_session_id, p_request_id, (v_result->>'id')::uuid)
  on conflict (customer_session_id, request_id)
  do update set order_id = excluded.order_id;

  return jsonb_build_object(
    'order', v_result,
    'replayed', false,
    'customer_session_id', v_session_id
  );
end;
$function$;

create or replace function private.cleanup_expired_customer_sessions()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted bigint;
begin
  delete from public.customer_sessions
  where expires_at <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function private.cleanup_expired_customer_sessions()
  from public, anon, authenticated, service_role;

do $schedule$
begin
  if not exists (
    select 1 from cron.job
    where jobname = 'cleanup-expired-customer-sessions'
  ) then
    perform cron.schedule(
      'cleanup-expired-customer-sessions',
      '17 3 * * *',
      'select private.cleanup_expired_customer_sessions();'
    );
  end if;
end;
$schedule$;
