create table if not exists public.guest_order_requests (
 id uuid primary key default gen_random_uuid(),
 customer_session_id uuid not null references public.customer_sessions(id) on delete cascade,
 request_id uuid not null,
 order_id uuid references public.orders(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(customer_session_id,request_id)
);
alter table public.guest_order_requests enable row level security;
revoke all on public.guest_order_requests from anon, authenticated;
create index if not exists guest_order_requests_created_at_idx on public.guest_order_requests(created_at);
