drop policy if exists "Owners can update non-owner cart members" on public.cart_members;
drop policy if exists "Owners can remove non-owner cart members" on public.cart_members;
create policy "Owners can update non-owner cart members" on public.cart_members
 for update to authenticated using(private.has_cart_role(cart_id,array['owner']) and user_id<>(select auth.uid()) and role in ('operator','manager'))
 with check(private.has_cart_role(cart_id,array['owner']) and role in ('operator','manager') and user_id<>(select auth.uid()));
create policy "Owners can remove non-owner cart members" on public.cart_members
 for delete to authenticated using(private.has_cart_role(cart_id,array['owner']) and user_id<>(select auth.uid()) and role in ('operator','manager'));
