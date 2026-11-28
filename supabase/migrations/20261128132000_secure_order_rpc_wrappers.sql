create or replace function public.update_order_item_status(p_order_item_id uuid,p_next_status text)
returns jsonb language sql security definer set search_path='' as $$ select private.update_order_item_status(p_order_item_id,p_next_status); $$;
create or replace function public.cancel_order_item(p_order_item_id uuid)
returns jsonb language sql security definer set search_path='' as $$ select private.cancel_order_item(p_order_item_id); $$;
create or replace function public.cancel_order(p_order_id uuid)
returns jsonb language sql security definer set search_path='' as $$ select private.cancel_order(p_order_id); $$;
create or replace function public.mark_order_paid(p_order_id uuid)
returns jsonb language sql security definer set search_path='' as $$ select private.mark_order_paid(p_order_id); $$;
revoke all on function public.update_order_item_status(uuid,text) from public,anon;
revoke all on function public.cancel_order_item(uuid) from public,anon;
revoke all on function public.cancel_order(uuid) from public,anon;
revoke all on function public.mark_order_paid(uuid) from public,anon;
grant execute on function public.update_order_item_status(uuid,text) to authenticated;
grant execute on function public.cancel_order_item(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.mark_order_paid(uuid) to authenticated;
