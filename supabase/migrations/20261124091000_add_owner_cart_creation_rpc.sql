create or replace function public.create_cart_for_owner(p_user_id uuid,p_name text,p_slug text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_cart public.carts;
begin
 if p_user_id is null or nullif(trim(p_name),'') is null or nullif(trim(p_slug),'') is null then raise exception 'Cart name and URL are required'; end if;
 if exists(select 1 from public.cart_members where user_id=p_user_id and role='owner') then raise exception 'This account already has a cart'; end if;
 insert into public.carts(name,slug) values(trim(p_name),lower(trim(p_slug))) returning * into v_cart;
 insert into public.cart_members(cart_id,user_id,role) values(v_cart.id,p_user_id,'owner');
 insert into public.store_settings(cart_id,store_name,is_accepting_orders,estimated_prep_minutes) values(v_cart.id,trim(p_name),true,20);
 return jsonb_build_object('id',v_cart.id,'name',v_cart.name,'slug',v_cart.slug);
end; $$;
revoke all on function public.create_cart_for_owner(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_cart_for_owner(uuid,text,text) to service_role;