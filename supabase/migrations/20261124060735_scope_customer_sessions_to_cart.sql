alter table public.customer_sessions add column if not exists cart_id uuid references public.carts(id);
update public.customer_sessions set cart_id=(select id from public.carts where slug='the-food-cart') where cart_id is null;
alter table public.customer_sessions alter column cart_id set not null;
alter table public.customer_sessions drop constraint if exists customer_sessions_token_hash_key;
create unique index if not exists customer_sessions_token_cart_uidx on public.customer_sessions(token_hash,cart_id);
create index if not exists customer_sessions_cart_id_idx on public.customer_sessions(cart_id,expires_at);