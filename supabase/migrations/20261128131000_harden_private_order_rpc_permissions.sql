revoke all on function private.update_order_item_status(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.cancel_order_item(uuid) from public,anon,authenticated,service_role;
revoke all on function private.cancel_order(uuid) from public,anon,authenticated,service_role;
revoke all on function private.mark_order_paid(uuid) from public,anon,authenticated,service_role;
revoke all on function private.recalculate_order_state(uuid,boolean) from public,anon,authenticated,service_role;
