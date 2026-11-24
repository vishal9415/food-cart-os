drop policy if exists "Owners can add cart members" on public.cart_members;
drop policy if exists "Owners can update cart members" on public.cart_members;
drop policy if exists "Owners can remove cart members" on public.cart_members;
create policy "Owners can add non-owner cart members" on public.cart_members
 for insert to authenticated with check(private.has_cart_role(cart_id,array['owner']) and role in ('operator','manager') and user_id<>(select auth.uid()));
create policy "Owners can update non-owner cart members" on public.cart_members
 for update to authenticated using(private.has_cart_role(cart_id,array['owner']) and user_id<>(select auth.uid()))
 with check(private.has_cart_role(cart_id,array['owner']) and role in ('operator','manager') and user_id<>(select auth.uid()));
create policy "Owners can remove non-owner cart members" on public.cart_members
 for delete to authenticated using(private.has_cart_role(cart_id,array['owner']) and user_id<>(select auth.uid()));
