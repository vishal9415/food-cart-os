-- Multi-tenant foundation: one independently managed cart per owner account.
create extension if not exists pgcrypto;
create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.cart_members (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'operator' check (role in ('owner','manager','operator')),
  created_at timestamptz not null default now(),
  unique(cart_id,user_id)
);
alter table public.store_settings add column if not exists cart_id uuid references public.carts(id);
alter table public.menu_categories add column if not exists cart_id uuid references public.carts(id);
alter table public.menu_items add column if not exists cart_id uuid references public.carts(id);
alter table public.orders add column if not exists cart_id uuid references public.carts(id);
insert into public.carts(name,slug) values ('The Food Cart','the-food-cart') on conflict (slug) do nothing;
update public.store_settings set cart_id=(select id from public.carts where slug='the-food-cart') where cart_id is null;
update public.menu_categories set cart_id=(select id from public.carts where slug='the-food-cart') where cart_id is null;
update public.menu_items set cart_id=(select id from public.carts where slug='the-food-cart') where cart_id is null;
update public.orders set cart_id=(select id from public.carts where slug='the-food-cart') where cart_id is null;
insert into public.cart_members(cart_id,user_id,role)
select id,'01e80e7c-80d6-4411-b5c0-658e816ea079'::uuid,'owner' from public.carts where slug='the-food-cart'
on conflict (cart_id,user_id) do update set role='owner';
alter table public.store_settings alter column cart_id set not null;
alter table public.menu_categories alter column cart_id set not null;
alter table public.menu_items alter column cart_id set not null;
alter table public.orders alter column cart_id set not null;
create unique index if not exists store_settings_cart_id_uidx on public.store_settings(cart_id);
create index if not exists menu_categories_cart_id_idx on public.menu_categories(cart_id);
create index if not exists menu_items_cart_id_idx on public.menu_items(cart_id);
create index if not exists orders_cart_created_idx on public.orders(cart_id,created_at desc);
create index if not exists cart_members_user_idx on public.cart_members(user_id,cart_id);
create or replace function public.has_cart_role(p_cart_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.cart_members m where m.cart_id=p_cart_id and m.user_id=(select auth.uid()) and m.role=any(p_roles)); $$;
revoke all on function public.has_cart_role(uuid,text[]) from public;
grant execute on function public.has_cart_role(uuid,text[]) to authenticated;
alter table public.carts enable row level security;
alter table public.cart_members enable row level security;
drop policy if exists "Anyone can read active menu categories" on public.menu_categories;
drop policy if exists "Operators manage menu categories" on public.menu_categories;
drop policy if exists "Anyone can read available menu items" on public.menu_items;
drop policy if exists "Operators manage menu items" on public.menu_items;
drop policy if exists "Anyone can read store settings" on public.store_settings;
drop policy if exists "Operators manage store settings" on public.store_settings;
drop policy if exists "Operators manage orders" on public.orders;
create policy "Public can view active carts" on public.carts for select to anon,authenticated using (is_active=true);
create policy "Members can view their carts" on public.carts for select to authenticated using (public.has_cart_role(id,array['owner','manager','operator']));
create policy "Owners can update their carts" on public.carts for update to authenticated using (public.has_cart_role(id,array['owner'])) with check (public.has_cart_role(id,array['owner']));
create policy "Members can view cart membership" on public.cart_members for select to authenticated using (public.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Owners can manage cart membership" on public.cart_members for all to authenticated using (public.has_cart_role(cart_id,array['owner'])) with check (public.has_cart_role(cart_id,array['owner']));
create policy "Public can view categories for active carts" on public.menu_categories for select to anon,authenticated using (is_active=true and exists(select 1 from public.carts c where c.id=cart_id and c.is_active=true));
create policy "Cart staff manage categories" on public.menu_categories for all to authenticated using (public.has_cart_role(cart_id,array['owner','manager','operator'])) with check (public.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Public can view available items for active carts" on public.menu_items for select to anon,authenticated using (is_available=true and exists(select 1 from public.carts c where c.id=cart_id and c.is_active=true));
create policy "Cart staff manage items" on public.menu_items for all to authenticated using (public.has_cart_role(cart_id,array['owner','manager','operator'])) with check (public.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Public can view settings for active carts" on public.store_settings for select to anon,authenticated using (exists(select 1 from public.carts c where c.id=cart_id and c.is_active=true));
create policy "Cart staff manage settings" on public.store_settings for all to authenticated using (public.has_cart_role(cart_id,array['owner','manager','operator'])) with check (public.has_cart_role(cart_id,array['owner','manager','operator']));
create policy "Cart staff manage orders" on public.orders for all to authenticated using (public.has_cart_role(cart_id,array['owner','manager','operator'])) with check (public.has_cart_role(cart_id,array['owner','manager','operator']));
create or replace function public.create_guest_order(p_cart_id uuid,p_customer jsonb,p_items jsonb,p_notes text default null)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_order_id uuid; v_order_number bigint; v_subtotal numeric(10,2):=0; v_tax_rate numeric(5,2):=0; v_tax_amount numeric(10,2):=0; v_total numeric(10,2):=0; v_pickup_token text; v_item record;
begin
 if not exists(select 1 from public.carts where id=p_cart_id and is_active=true) then raise exception 'This food cart is unavailable'; end if;
 if not exists(select 1 from public.store_settings where cart_id=p_cart_id and is_accepting_orders=true) then raise exception 'This food cart is not accepting orders right now'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then raise exception 'Order must contain between 1 and 30 items'; end if;
 select coalesce((select s.tax_rate from public.store_settings s where s.cart_id=p_cart_id limit 1),0) into v_tax_rate;
 for v_item in select mi.id,mi.name,mi.price,sum((x.value->>'quantity')::integer)::integer as quantity from jsonb_array_elements(p_items) x(value) join public.menu_items mi on mi.id=(x.value->>'menu_item_id')::uuid where mi.cart_id=p_cart_id and mi.is_available=true and (x.value->>'quantity')~'^[1-9][0-9]{0,2}$' group by mi.id,mi.name,mi.price loop v_subtotal:=v_subtotal+(v_item.price*v_item.quantity); end loop;
 if v_subtotal<=0 then raise exception 'No valid available menu items found'; end if;
 if (select count(*) from jsonb_array_elements(p_items) x(value))<>(select count(distinct (x.value->>'menu_item_id')::uuid) from jsonb_array_elements(p_items) x(value)) then raise exception 'Duplicate menu items are not allowed'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x(value) left join public.menu_items mi on mi.id=(x.value->>'menu_item_id')::uuid and mi.cart_id=p_cart_id and mi.is_available=true where mi.id is null or coalesce(x.value->>'quantity','') !~ '^[1-9][0-9]{0,2}$') then raise exception 'One or more items are invalid or unavailable'; end if;
 v_tax_amount:=round(v_subtotal*v_tax_rate/100,2); v_total:=v_subtotal+v_tax_amount; v_pickup_token:=upper(substr(encode(extensions.gen_random_bytes(4),'hex'),1,6));
 insert into public.orders(cart_id,customer_name,customer_phone,customer_email,order_type,status,payment_status,payment_method,subtotal,tax_amount,total_amount,notes,pickup_token) values(p_cart_id,nullif(trim(p_customer->>'name'),''),nullif(trim(p_customer->>'phone'),''),nullif(trim(p_customer->>'email'),''),'pickup','placed','pending','cash',v_subtotal,v_tax_amount,v_total,nullif(trim(p_notes),''),v_pickup_token) returning id,order_number into v_order_id,v_order_number;
 insert into public.order_items(order_id,menu_item_id,item_name,unit_price,quantity,line_total) select v_order_id,mi.id,mi.name,mi.price,(x.value->>'quantity')::integer,mi.price*(x.value->>'quantity')::integer from jsonb_array_elements(p_items) x(value) join public.menu_items mi on mi.id=(x.value->>'menu_item_id')::uuid where mi.cart_id=p_cart_id and mi.is_available=true;
 return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'pickup_token',v_pickup_token,'subtotal',v_subtotal,'tax_amount',v_tax_amount,'total_amount',v_total,'status','placed');
end; $function$;
revoke all on function public.create_guest_order(uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_guest_order(uuid,jsonb,jsonb,text) to service_role;
