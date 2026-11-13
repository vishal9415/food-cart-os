create table if not exists public.customer_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);
alter table public.customer_sessions enable row level security;
revoke all on public.customer_sessions from anon, authenticated;
alter table public.orders add column if not exists customer_session_id uuid references public.customer_sessions(id) on delete set null;
create index if not exists orders_customer_session_id_created_at_idx on public.orders(customer_session_id, created_at desc);
