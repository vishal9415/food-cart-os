-- Owner-side order controls: flexible item statuses, item/order cancellation and cash payment confirmation.
alter table public.order_items drop constraint if exists order_items_status_check;
alter table public.order_items add constraint order_items_status_check
  check (status = any (array['pending','preparing','ready','served','cancelled']::text[]));

create or replace function private.recalculate_order_state(p_order_id uuid, p_reprice boolean default false)
returns text language plpgsql security definer set search_path=''
as $$
declare
 v_cart_id uuid; v_total integer; v_served integer; v_ready integer; v_preparing integer;
 v_subtotal numeric(10,2); v_tax_rate numeric(5,2); v_tax_amount numeric(10,2); v_total_amount numeric(10,2); v_overall text;
begin
 select cart_id into v_cart_id from public.orders where id=p_order_id for update;
 if v_cart_id is null then raise exception 'ORDER_NOT_FOUND'; end if;
 select count(*) filter(where status<>'cancelled'),
        count(*) filter(where status='served'),
        count(*) filter(where status in ('ready','served')),
        count(*) filter(where status='preparing')
 into v_total,v_served,v_ready,v_preparing
 from public.order_items where order_id=p_order_id;
 if v_total=0 then v_overall:='cancelled';
 elsif v_served=v_total then v_overall:='completed';
 elsif v_served>0 then v_overall:='partially_served';
 elsif v_ready=v_total then v_overall:='ready';
 elsif v_ready>0 then v_overall:='partially_ready';
 elsif v_preparing>0 then v_overall:='preparing';
 else v_overall:='placed'; end if;
 if p_reprice then
  select coalesce(sum(line_total) filter(where status<>'cancelled'),0)::numeric(10,2)
  into v_subtotal from public.order_items where order_id=p_order_id;
  select coalesce(tax_rate,0) into v_tax_rate from public.store_settings where cart_id=v_cart_id limit 1;
  v_tax_amount:=round(v_subtotal*coalesce(v_tax_rate,0)/100,2);
  v_total_amount:=v_subtotal+v_tax_amount;
  update public.orders set status=v_overall,subtotal=v_subtotal,tax_amount=v_tax_amount,total_amount=v_total_amount,updated_at=now() where id=p_order_id;
 else
  update public.orders set status=v_overall,updated_at=now() where id=p_order_id;
 end if;
 return v_overall;
end; $$;
revoke all on function private.recalculate_order_state(uuid,boolean) from public,anon,authenticated,service_role;

create or replace function private.update_order_item_status(p_order_item_id uuid,p_next_status text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_order_id uuid; v_cart_id uuid; v_order_status text; v_current text; v_overall text;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 if p_next_status is null or p_next_status not in ('pending','preparing','ready','served') then raise exception 'INVALID_NEXT_STATUS'; end if;
 select oi.order_id,o.cart_id,o.status into v_order_id,v_cart_id,v_order_status from public.order_items oi join public.orders o on o.id=oi.order_id where oi.id=p_order_item_id;
 if v_order_id is null then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;
 if not exists(select 1 from public.cart_members where cart_id=v_cart_id and user_id=auth.uid() and role in ('owner','manager','operator')) then raise exception 'NOT_AUTHORIZED'; end if;
 select status into v_order_status from public.orders where id=v_order_id for update;
 if v_order_status in ('completed','cancelled') then raise exception 'ORDER_ALREADY_CLOSED'; end if;
 select status into v_current from public.order_items where id=p_order_item_id and order_id=v_order_id for update;
 if v_current='cancelled' then raise exception 'ORDER_ITEM_CANCELLED'; end if;
 if v_current=p_next_status then return jsonb_build_object('order_id',v_order_id,'order_status',v_order_status,'item_status',p_next_status,'unchanged',true); end if;
 update public.order_items set status=p_next_status,
  ready_at=case when p_next_status in ('ready','served') then coalesce(ready_at,now()) else null end,
  served_at=case when p_next_status='served' then coalesce(served_at,now()) else null end
 where id=p_order_item_id;
 insert into public.order_item_status_events(cart_id,order_id,order_item_id,changed_by,from_status,to_status) values(v_cart_id,v_order_id,p_order_item_id,auth.uid(),v_current,p_next_status);
 v_overall:=private.recalculate_order_state(v_order_id,false);
 return jsonb_build_object('order_id',v_order_id,'order_status',v_overall,'item_status',p_next_status);
end; $$;

create or replace function private.cancel_order_item(p_order_item_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_order_id uuid; v_cart_id uuid; v_order_status text; v_current text; v_overall text;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 select oi.order_id,o.cart_id,o.status into v_order_id,v_cart_id,v_order_status from public.order_items oi join public.orders o on o.id=oi.order_id where oi.id=p_order_item_id;
 if v_order_id is null then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;
 if not exists(select 1 from public.cart_members where cart_id=v_cart_id and user_id=auth.uid() and role in ('owner','manager','operator')) then raise exception 'NOT_AUTHORIZED'; end if;
 select status into v_order_status from public.orders where id=v_order_id for update;
 if v_order_status in ('completed','cancelled') then raise exception 'ORDER_ALREADY_CLOSED'; end if;
 select status into v_current from public.order_items where id=p_order_item_id and order_id=v_order_id for update;
 if v_current='served' then raise exception 'SERVED_ITEM_CANNOT_BE_CANCELLED'; end if;
 if v_current='cancelled' then return jsonb_build_object('order_id',v_order_id,'order_status',v_order_status,'unchanged',true); end if;
 update public.order_items set status='cancelled' where id=p_order_item_id;
 insert into public.order_item_status_events(cart_id,order_id,order_item_id,changed_by,from_status,to_status) values(v_cart_id,v_order_id,p_order_item_id,auth.uid(),v_current,'cancelled');
 v_overall:=private.recalculate_order_state(v_order_id,true);
 return jsonb_build_object('order_id',v_order_id,'order_status',v_overall);
end; $$;

create or replace function private.cancel_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_cart_id uuid; v_status text;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 select cart_id,status into v_cart_id,v_status from public.orders where id=p_order_id for update;
 if v_cart_id is null then raise exception 'ORDER_NOT_FOUND'; end if;
 if not exists(select 1 from public.cart_members where cart_id=v_cart_id and user_id=auth.uid() and role in ('owner','manager','operator')) then raise exception 'NOT_AUTHORIZED'; end if;
 if v_status='completed' then raise exception 'COMPLETED_ORDER_CANNOT_BE_CANCELLED'; end if;
 if v_status='cancelled' then return jsonb_build_object('order_id',p_order_id,'order_status','cancelled','unchanged',true); end if;
 if exists(select 1 from public.order_items where order_id=p_order_id and status='served') then raise exception 'ORDER_HAS_SERVED_ITEMS'; end if;
 insert into public.order_item_status_events(cart_id,order_id,order_item_id,changed_by,from_status,to_status)
 select v_cart_id,p_order_id,id,auth.uid(),status,'cancelled' from public.order_items where order_id=p_order_id and status<>'cancelled';
 update public.order_items set status='cancelled' where order_id=p_order_id and status<>'cancelled';
 update public.orders set status='cancelled',subtotal=0,tax_amount=0,total_amount=0,updated_at=now() where id=p_order_id;
 return jsonb_build_object('order_id',p_order_id,'order_status','cancelled');
end; $$;

create or replace function private.mark_order_paid(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_cart_id uuid; v_status text; v_payment_status text;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 select cart_id,status,payment_status into v_cart_id,v_status,v_payment_status from public.orders where id=p_order_id for update;
 if v_cart_id is null then raise exception 'ORDER_NOT_FOUND'; end if;
 if not exists(select 1 from public.cart_members where cart_id=v_cart_id and user_id=auth.uid() and role in ('owner','manager','operator')) then raise exception 'NOT_AUTHORIZED'; end if;
 if v_status='cancelled' then raise exception 'CANCELLED_ORDER_CANNOT_BE_PAID'; end if;
 if v_payment_status='paid' then return jsonb_build_object('order_id',p_order_id,'payment_status','paid','unchanged',true); end if;
 update public.orders set payment_status='paid',payment_method='cash',updated_at=now() where id=p_order_id;
 return jsonb_build_object('order_id',p_order_id,'payment_status','paid','payment_method','cash');
end; $$;

revoke all on function private.update_order_item_status(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.cancel_order_item(uuid) from public,anon,authenticated,service_role;
revoke all on function private.cancel_order(uuid) from public,anon,authenticated,service_role;
revoke all on function private.mark_order_paid(uuid) from public,anon,authenticated,service_role;

create or replace function public.update_order_item_status(p_order_item_id uuid,p_next_status text)
returns jsonb language sql security invoker set search_path='' as $$ select private.update_order_item_status(p_order_item_id,p_next_status); $$;
create or replace function public.cancel_order_item(p_order_item_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.cancel_order_item(p_order_item_id); $$;
create or replace function public.cancel_order(p_order_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.cancel_order(p_order_id); $$;
create or replace function public.mark_order_paid(p_order_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.mark_order_paid(p_order_id); $$;

revoke all on function public.update_order_item_status(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.cancel_order_item(uuid) from public,anon,authenticated,service_role;
revoke all on function public.cancel_order(uuid) from public,anon,authenticated,service_role;
revoke all on function public.mark_order_paid(uuid) from public,anon,authenticated,service_role;
grant execute on function public.update_order_item_status(uuid,text) to authenticated;
grant execute on function public.cancel_order_item(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.mark_order_paid(uuid) to authenticated;
