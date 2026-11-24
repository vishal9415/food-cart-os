create or replace function public.create_guest_order_idempotent(
 p_cart_id uuid,p_customer jsonb,p_items jsonb,p_notes text,p_session_id uuid,p_request_id uuid
) returns jsonb language sql security invoker set search_path=''
as $$ select private.create_guest_order_idempotent(p_cart_id,p_customer,p_items,p_notes,p_session_id,p_request_id); $$;
revoke all on function public.create_guest_order_idempotent(uuid,jsonb,jsonb,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_guest_order_idempotent(uuid,jsonb,jsonb,text,uuid,uuid) to service_role;
