-- Enable authenticated operator dashboards to receive order updates.
alter publication supabase_realtime add table public.orders;
