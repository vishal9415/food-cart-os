do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_guest_order';
  v_definition := replace(
    v_definition,
    'begin' || chr(10),
    'begin' || chr(10) ||
    '  if not exists (select 1 from public.store_settings where is_accepting_orders = true) then' || chr(10) ||
    '    raise exception ''The Food Cart is not accepting orders right now'';' || chr(10) ||
    '  end if;' || chr(10) || chr(10)
  );
  execute v_definition;
end $$;
