create table if not exists public.order_item_status_events (
 id uuid primary key default gen_random_uuid(),
 cart_id uuid not null references public.carts(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade,
 order_item_id uuid not null references public.order_items(id) on delete cascade,
 changed_by uuid not null references auth.users(id),
 from_status text not null,
 to_status text not null,
 created_at timestamptz not null default now()
);
alter table public.order_item_status_events enable row level security;
revoke all on public.order_item_status_events from anon;
grant select on public.order_item_status_events to authenticated;
create policy "Cart staff can view order item status history" on public.order_item_status_events
 for select to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator']));
create index if not exists order_item_status_events_order_created_idx on public.order_item_status_events(order_id,created_at desc);

create or replace function private.update_order_item_status(p_order_item_id uuid,p_next_status text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_order_id uuid; v_cart_id uuid; v_order_status text; v_current text; v_overall text;
 v_served integer; v_ready integer; v_preparing integer; v_total integer;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 if p_next_status not in ('preparing','ready','served') then raise exception 'INVALID_NEXT_STATUS'; end if;
 select oi.order_id,o.cart_id,o.status into v_order_id,v_cart_id,v_order_status
 from public.order_items oi join public.orders o on o.id=oi.order_id where oi.id=p_order_item_id;
 if v_order_id is null then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;
 if not exists(select 1 from public.cart_members m where m.cart_id=v_cart_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator')) then raise exception 'NOT_AUTHORIZED'; end if;
 select status into v_order_status from public.orders where id=v_order_id for update;
 if v_order_status in ('completed','cancelled') then raise exception 'ORDER_ALREADY_CLOSED'; end if;
 select status into v_current from public.order_items where id=p_order_item_id and order_id=v_order_id for update;
 if not ((v_current='pending' and p_next_status='preparing') or (v_current='preparing' and p_next_status='ready') or (v_current='ready' and p_next_status='served')) then raise exception 'INVALID_STATUS_TRANSITION'; end if;
 update public.order_items set status=p_next_status,ready_at=case when p_next_status='ready' then now() else ready_at end,served_at=case when p_next_status='served' then now() else served_at end where id=p_order_item_id;
 insert into public.order_item_status_events(cart_id,order_id,order_item_id,changed_by,from_status,to_status) values(v_cart_id,v_order_id,p_order_item_id,auth.uid(),v_current,p_next_status);
 select count(*),count(*) filter(where status='served'),count(*) filter(where status in ('ready','served')),count(*) filter(where status='preparing')
 into v_total,v_served,v_ready,v_preparing from public.order_items where order_id=v_order_id;
 if v_total>0 and v_served=v_total then v_overall:='completed';
 elsif v_served>0 then v_overall:='partially_served';
 elsif v_total>0 and v_ready=v_total then v_overall:='ready';
 elsif v_ready>0 then v_overall:='partially_ready';
 elsif v_preparing>0 then v_overall:='preparing';
 else v_overall:='placed'; end if;
 update public.orders set status=v_overall,updated_at=now() where id=v_order_id;
 return jsonb_build_object('order_id',v_order_id,'order_status',v_overall,'item_status',p_next_status);
end; $$;
revoke all on function private.update_order_item_status(uuid,text) from public,anon;
grant execute on function private.update_order_item_status(uuid,text) to authenticated;
create or replace function public.update_order_item_status(p_order_item_id uuid,p_next_status text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.update_order_item_status(p_order_item_id,p_next_status); $$;
revoke all on function public.update_order_item_status(uuid,text) from public,anon;
grant execute on function public.update_order_item_status(uuid,text) to authenticated;
