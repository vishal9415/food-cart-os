-- Prevent a menu item from referencing a category owned by another cart.
-- Preserve cart_id when a category is deleted; only category_id becomes NULL.
create unique index if not exists menu_categories_id_cart_uidx
  on public.menu_categories (id, cart_id);

alter table public.menu_items
  drop constraint if exists menu_items_category_id_fkey;

alter table public.menu_items
  add constraint menu_items_category_cart_fkey
  foreign key (category_id, cart_id)
  references public.menu_categories (id, cart_id)
  on delete set null (category_id);
