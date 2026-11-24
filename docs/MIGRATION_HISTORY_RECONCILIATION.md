# Supabase migration history reconciliation

## Current state

The production Supabase project has these applied migration versions:

- 20261112111219 — initial_food_cart_schema
- 20261112111802 — secure_guest_order_creation
- 20261112113343 — enable_orders_realtime
- 20261113020056 — fix_guest_order_pickup_token_random_bytes
- 20261113020721 — add_item_level_fulfilment_status
- 20261113020736 — expand_order_status_for_partial_fulfilment
- 20261113021327 — add_customer_sessions_and_link_orders
- 20261113041040 — add_guest_checkout_idempotency
- 20261113041212 — enforce_store_open_on_guest_checkout
- 20261124060529 — add_multi_cart_tenant_foundation
- 20261124060614 — add_owner_cart_creation_rpc
- 20261124060735 — scope_customer_sessions_to_cart
- 20261124061221 — scope_order_item_permissions_to_cart
- 20261124062146 — add_cart_sales_summary_rpc
- 20261124062346 — tighten_multi_cart_rls_and_private_helpers
- 20261124063044 — index_guest_checkout_rate_limit
- 20261124063126 — allow_signed_in_customers_to_view_public_menus
- 20261124074947 — atomic_guest_checkout_idempotency_and_cart_rate_limits
- 20261124074959 — expose_service_role_checkout_rpc
- 20261124075058 — allow_service_role_to_execute_atomic_checkout
- 20261124075216 — atomic_order_item_status_and_audit_history
- 20261124075454 — strengthen_pickup_token_uniqueness
- 20261124075646 — lock_cart_menu_and_settings_during_checkout
- 20261124075723 — require_customer_price_confirmation_at_checkout
- 20261124080049 — prevent_owner_self_lockout_and_owner_role_escalation
- 20261124080107 — protect_owner_membership_from_direct_mutation
- 20261124080335 — index_order_status_audit_foreign_keys
- 20261124084042 — protect_orders_from_direct_staff_mutation
- 20261124090036 — enforce_single_cart_membership_per_user
- 20261124094717 — enforce_menu_category_cart_scope
- 20261124094849 — enforce_order_session_and_audit_scope
- 20261124095423 — index_order_queue_cursor

## Missing source files

The following historical migration files are not present in the repository and were not recoverable from its commit history during the launch-readiness review:

- 20261112111219_initial_food_cart_schema.sql
- 20261112111802_secure_guest_order_creation.sql
- 20261113020056_fix_guest_order_pickup_token_random_bytes.sql
- 20261113020721_add_item_level_fulfilment_status.sql
- 20261113020736_expand_order_status_for_partial_fulfilment.sql

The production database confirms these versions are applied. Their original SQL has not been reconstructed, because inventing historical migration contents would create a misleading and potentially unsafe migration history.

## Operating rule

**Do not run `supabase db push` or attempt a fresh database bootstrap from this repository until the five missing migrations are recovered or a reviewed schema baseline is created.**

The later migration files, including `20261124090036_enforce_single_cart_membership_per_user.sql`, `20261124094717_enforce_menu_category_cart_scope.sql`, and `20261124094849_enforce_order_session_and_audit_scope.sql`, are aligned with the currently applied production migration versions. The source migration filenames now match the versions recorded in the production migration ledger, so the two new migrations will not be mistaken for unapplied changes by the Supabase CLI.
