create or replace function public.prevent_direct_order_mutations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception using
      errcode = '42501',
      message = 'Direct order edits are disabled. Use the approved order workflow.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_direct_order_mutations() from public, anon, authenticated;

drop trigger if exists protect_orders_from_direct_mutation on public.orders;
create trigger protect_orders_from_direct_mutation
before update or delete on public.orders
for each row execute function public.prevent_direct_order_mutations();

drop trigger if exists protect_order_items_from_direct_mutation on public.order_items;
create trigger protect_order_items_from_direct_mutation
before update or delete on public.order_items
for each row execute function public.prevent_direct_order_mutations();
