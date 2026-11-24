create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
create or replace function private.has_cart_role(p_cart_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.cart_members m where m.cart_id=p_cart_id and m.user_id=(select auth.uid()) and m.role=any(p_roles)); $$;
revoke all on function private.has_cart_role(uuid,text[]) from public,anon;
grant execute on function private.has_cart_role(uuid,text[]) to authenticated;
drop policy if exists "Public can view active carts" on public.carts;
drop policy if exists "Members can view their carts" on public.carts;
drop policy if exists "Owners can update their carts" on public.carts;
drop policy if exists "Members can view cart membership" on public.cart_members;
drop policy if exists "Owners can manage cart membership" on public.cart_members;
drop policy if exists "Public can view categories for active carts" on public.menu_categories;
drop policy if exists "Cart staff manage categories" on public.menu_categories;
drop policy if exists "Public can view available items for active carts" on public.menu_items;
drop policy if exists "Cart staff manage items" on public.menu_items;
drop policy if exists "Public can view settings for active carts" on public.store_settings;
drop policy if exists "Cart staff manage settings" on public.store_settings;
drop policy if exists "Cart staff manage orders" on public.orders;
drop policy if exists "Cart staff manage order items" on public.order_items;
create policy "Public can view active carts" on public.carts for select to anon using(is_active=true);
create policy "Members can view their carts" on public.carts for select to authenticated using(private.has_cart_role(id,array['owner','manager','operator']));
create policy "Owners can update their carts" on public.carts for update to authenticated using(private.has_cart_role(id,array['owner'])) with check(private.has_cart_role(id,array['owner']));
create policy "Members can view cart membership" on public.cart_members for select to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Owners can add cart members" on public.cart_members for insert to authenticated with check(private.has_cart_role(cart_id,array['owner']));
create policy "Owners can update cart members" on public.cart_members for update to authenticated using(private.has_cart_role(cart_id,array['owner'])) with check(private.has_cart_role(cart_id,array['owner']));
create policy "Owners can remove cart members" on public.cart_members for delete to authenticated using(private.has_cart_role(cart_id,array['owner']));
create policy "Public can view active categories" on public.menu_categories for select to anon using(is_active=true and exists(select 1 from public.carts c where c.id=cart_id and c.is_active=true));
create policy "Cart staff can view categories" on public.menu_categories for select to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Cart staff can add categories" on public.menu_categories for insert to authenticated with check(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Cart staff can update categories" on public.menu_categories for update to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator'])) with check(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Cart staff can delete categories" on public.menu_categories for delete to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Public can view available items" on public.menu_items for select to anon using(is_available=true and exists(select 1 from public.carts c where c.id=cart_id and c.is_active=true));
create policy "Cart staff can view all items" on public.menu_items for select to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Cart staff can add items" on public.menu_items for insert to authenticated with check(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Cart staff can update items" on public.menu_items for update to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator'])) with check(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Cart staff can delete items" on public.menu_items for delete to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Public can view active cart settings" on public.store_settings for select to anon using(exists(select 1 from public.carts c where c.id=cart_id and c.is_active=true));
create policy "Cart staff can view settings" on public.store_settings for select to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Cart staff can update settings" on public.store_settings for update to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator'])) with check(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Cart staff can view orders" on public.orders for select to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Cart staff can update orders" on public.orders for update to authenticated using(private.has_cart_role(cart_id,array['owner','manager','operator'])) with check(private.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Cart staff can view order items" on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and private.has_cart_role(o.cart_id,array['owner','manager','operator'])));
create policy "Cart staff can update order items" on public.order_items for update to authenticated using(exists(select 1 from public.orders o where o.id=order_id and private.has_cart_role(o.cart_id,array['owner','manager','operator']))) with check(exists(select 1 from public.orders o where o.id=order_id and private.has_cart_role(o.cart_id,array['owner','manager','operator'])));
create or replace function public.get_cart_sales_summary(p_cart_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_count bigint; v_value numeric(12,2); v_items jsonb;
begin
 if p_from is null or p_to is null or p_to<=p_from then raise exception 'Invalid report date range'; end if;
 if not private.has_cart_role(p_cart_id,array['owner','manager','operator']) then raise exception 'Not authorised for this cart'; end if;
 select count(*),coalesce(sum(o.total_amount),0) into v_count,v_value from public.orders o where o.cart_id=p_cart_id and o.created_at>=p_from and o.created_at<p_to and o.status<>'cancelled';
 select coalesce(jsonb_agg(jsonb_build_object('name',x.item_name,'quantity',x.quantity) order by x.quantity desc),'[]'::jsonb) into v_items from (select oi.item_name,sum(oi.quantity)::integer as quantity from public.order_items oi join public.orders o on o.id=oi.order_id where o.cart_id=p_cart_id and o.created_at>=p_from and o.created_at<p_to and o.status<>'cancelled' group by oi.item_name order by sum(oi.quantity) desc limit 5) x;
 return jsonb_build_object('order_count',v_count,'order_value',v_value,'popular_items',v_items);
end; $$;
revoke all on function public.get_cart_sales_summary(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_cart_sales_summary(uuid,timestamptz,timestamptz) to authenticated;
drop function if exists public.has_cart_role(uuid,text[]);
revoke all on public.customer_sessions,public.guest_order_requests from anon,authenticated;
create index if not exists guest_order_requests_order_id_idx on public.guest_order_requests(order_id);