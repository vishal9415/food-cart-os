drop policy if exists "Operators manage order items" on public.order_items;
create policy "Cart staff manage order items" on public.order_items
for all to authenticated
using (exists(select 1 from public.orders o where o.id=order_id and public.has_cart_role(o.cart_id,array['owner','manager','operator'])))
with check (exists(select 1 from public.orders o where o.id=order_id and public.has_cart_role(o.cart_id,array['owner','manager','operator'])));