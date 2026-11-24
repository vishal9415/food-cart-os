drop policy if exists "Members can view their carts" on public.carts;
create policy "Authenticated users can view active carts and memberships" on public.carts
for select to authenticated using(is_active=true or private.has_cart_role(id,array['owner','manager','operator']));

drop policy if exists "Cart staff can view categories" on public.menu_categories;
create policy "Authenticated users can view active categories and cart categories" on public.menu_categories
for select to authenticated using(
 (is_active=true and exists(select 1 from public.carts c where c.id=cart_id and c.is_active=true))
 or private.has_cart_role(cart_id,array['owner','manager','operator'])
);

drop policy if exists "Cart staff can view all items" on public.menu_items;
create policy "Authenticated users can view available items and cart items" on public.menu_items
for select to authenticated using(
 (is_available=true and exists(select 1 from public.carts c where c.id=cart_id and c.is_active=true))
 or private.has_cart_role(cart_id,array['owner','manager','operator'])
);

drop policy if exists "Cart staff can view settings" on public.store_settings;
create policy "Authenticated users can view active settings and cart settings" on public.store_settings
for select to authenticated using(
 exists(select 1 from public.carts c where c.id=cart_id and c.is_active=true)
 or private.has_cart_role(cart_id,array['owner','manager','operator'])
);