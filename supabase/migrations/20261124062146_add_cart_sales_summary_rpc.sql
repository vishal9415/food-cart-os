create or replace function public.get_cart_sales_summary(p_cart_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare v_count bigint; v_value numeric(12,2); v_items jsonb;
begin
 if p_from is null or p_to is null or p_to<=p_from then raise exception 'Invalid report date range'; end if;
 if not public.has_cart_role(p_cart_id,array['owner','manager','operator']) then raise exception 'Not authorised for this cart'; end if;
 select count(*),coalesce(sum(o.total_amount),0)
 into v_count,v_value
 from public.orders o
 where o.cart_id=p_cart_id and o.created_at>=p_from and o.created_at<p_to and o.status<>'cancelled';
 select coalesce(jsonb_agg(jsonb_build_object('name',x.item_name,'quantity',x.quantity) order by x.quantity desc),'[]'::jsonb)
 into v_items
 from (
  select oi.item_name,sum(oi.quantity)::integer as quantity
  from public.order_items oi join public.orders o on o.id=oi.order_id
  where o.cart_id=p_cart_id and o.created_at>=p_from and o.created_at<p_to and o.status<>'cancelled'
  group by oi.item_name order by sum(oi.quantity) desc limit 5
 ) x;
 return jsonb_build_object('order_count',v_count,'order_value',v_value,'popular_items',v_items);
end;
$$;
revoke all on function public.get_cart_sales_summary(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_cart_sales_summary(uuid,timestamptz,timestamptz) to authenticated;