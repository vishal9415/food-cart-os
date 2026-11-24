create unique index if not exists orders_cart_pickup_token_uidx on public.orders(cart_id,pickup_token) where pickup_token is not null;
create or replace function public.create_guest_order(p_cart_id uuid,p_customer jsonb,p_items jsonb,p_notes text default null)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare
 v_order_id uuid; v_order_number bigint; v_subtotal numeric(10,2):=0; v_tax_rate numeric(5,2):=0; v_tax_amount numeric(10,2):=0; v_total numeric(10,2):=0; v_pickup_token text; v_item record;
begin
 if not exists(select 1 from public.carts where id=p_cart_id and is_active=true) then raise exception 'This food cart is unavailable'; end if;
 if not exists(select 1 from public.store_settings where cart_id=p_cart_id and is_accepting_orders=true) then raise exception 'This food cart is not accepting orders right now'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then raise exception 'Order must contain between 1 and 30 items'; end if;
 select coalesce((select s.tax_rate from public.store_settings s where s.cart_id=p_cart_id limit 1),0) into v_tax_rate;
 for v_item in
  select mi.id,mi.name,mi.price,sum((x.value->>'quantity')::integer)::integer as quantity
  from jsonb_array_elements(p_items) x(value) join public.menu_items mi on mi.id=(x.value->>'menu_item_id')::uuid
  where mi.cart_id=p_cart_id and mi.is_available=true and (x.value->>'quantity')~'^[1-9][0-9]{0,2}$'
  group by mi.id,mi.name,mi.price
 loop v_subtotal:=v_subtotal+(v_item.price*v_item.quantity); end loop;
 if v_subtotal<=0 then raise exception 'No valid available menu items found'; end if;
 if (select count(*) from jsonb_array_elements(p_items) x(value))<>(select count(distinct (x.value->>'menu_item_id')::uuid) from jsonb_array_elements(p_items) x(value)) then raise exception 'Duplicate menu items are not allowed'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x(value) left join public.menu_items mi on mi.id=(x.value->>'menu_item_id')::uuid and mi.cart_id=p_cart_id and mi.is_available=true where mi.id is null or coalesce(x.value->>'quantity','') !~ '^[1-9][0-9]{0,2}$') then raise exception 'One or more items are invalid or unavailable'; end if;
 v_tax_amount:=round(v_subtotal*v_tax_rate/100,2); v_total:=v_subtotal+v_tax_amount;
 loop
  v_pickup_token:=upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,8));
  exit when not exists(select 1 from public.orders o where o.cart_id=p_cart_id and o.pickup_token=v_pickup_token);
 end loop;
 insert into public.orders(cart_id,customer_name,customer_phone,customer_email,order_type,status,payment_status,payment_method,subtotal,tax_amount,total_amount,notes,pickup_token)
 values(p_cart_id,nullif(trim(p_customer->>'name'),''),nullif(trim(p_customer->>'phone'),''),nullif(trim(p_customer->>'email'),''),'pickup','placed','pending','cash',v_subtotal,v_tax_amount,v_total,nullif(trim(p_notes),''),v_pickup_token)
 returning id,order_number into v_order_id,v_order_number;
 insert into public.order_items(order_id,menu_item_id,item_name,unit_price,quantity,line_total)
 select v_order_id,mi.id,mi.name,mi.price,(x.value->>'quantity')::integer,mi.price*(x.value->>'quantity')::integer
 from jsonb_array_elements(p_items) x(value) join public.menu_items mi on mi.id=(x.value->>'menu_item_id')::uuid
 where mi.cart_id=p_cart_id and mi.is_available=true;
 return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'pickup_token',v_pickup_token,'subtotal',v_subtotal,'tax_amount',v_tax_amount,'total_amount',v_total,'status','placed');
end; $function$;
revoke all on function public.create_guest_order(uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_guest_order(uuid,jsonb,jsonb,text) to service_role;