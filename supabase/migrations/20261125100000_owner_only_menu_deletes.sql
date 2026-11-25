-- Only cart owners may permanently delete menu content.
drop policy if exists "Cart staff can delete categories" on public.menu_categories;
create policy "Cart owners can delete categories"
on public.menu_categories for delete to authenticated
using (private.has_cart_role(cart_id, array['owner']));

drop policy if exists "Cart staff can delete items" on public.menu_items;
create policy "Cart owners can delete items"
on public.menu_items for delete to authenticated
using (private.has_cart_role(cart_id, array['owner']));
