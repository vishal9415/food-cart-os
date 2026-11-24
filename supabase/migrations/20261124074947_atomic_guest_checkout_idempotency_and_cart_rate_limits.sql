create or replace function private.create_guest_order_idempotent(
 p_cart_id uuid,p_customer jsonb,p_items jsonb,p_notes text,p_session_id uuid,p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_existing uuid; v_order jsonb; v_result jsonb; v_session_count bigint; v_cart_count bigint;
begin
 if not exists(select 1 from public.customer_sessions s where s.id=p_session_id and s.cart_id=p_cart_id and s.expires_at>now()) then raise exception 'CUSTOMER_SESSION_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('session:'||p_session_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('cart:'||p_cart_id::text,0));
 select r.order_id into v_existing from public.guest_order_requests r where r.customer_session_id=p_session_id and r.request_id=p_request_id;
 if v_existing is not null then
  select jsonb_build_object('id',o.id,'order_number',o.order_number,'pickup_token',o.pickup_token,'subtotal',o.subtotal,'tax_amount',o.tax_amount,'total_amount',o.total_amount,'status',o.status) into v_order from public.orders o where o.id=v_existing;
  if v_order is not null then return jsonb_build_object('order',v_order,'replayed',true); end if;
 end if;
 select count(*) into v_session_count from public.guest_order_requests r where r.customer_session_id=p_session_id and r.created_at>=now()-interval '1 minute';
 if v_session_count>=5 then raise exception 'RATE_LIMIT_SESSION'; end if;
 select count(*) into v_cart_count from public.guest_order_requests r join public.customer_sessions s on s.id=r.customer_session_id where s.cart_id=p_cart_id and r.created_at>=now()-interval '1 minute';
 if v_cart_count>=100 then raise exception 'RATE_LIMIT_CART'; end if;
 v_result:=public.create_guest_order(p_cart_id,p_customer,p_items,p_notes);
 insert into public.guest_order_requests(customer_session_id,request_id,order_id) values(p_session_id,p_request_id,(v_result->>'id')::uuid)
 on conflict(customer_session_id,request_id) do update set order_id=excluded.order_id;
 return jsonb_build_object('order',v_result,'replayed',false);
end; $$;
revoke all on function private.create_guest_order_idempotent(uuid,jsonb,jsonb,text,uuid,uuid) from public,anon,authenticated;
grant execute on function private.create_guest_order_idempotent(uuid,jsonb,jsonb,text,uuid,uuid) to service_role;

create index if not exists guest_order_requests_cart_rate_idx on public.guest_order_requests(created_at,customer_session_id);

