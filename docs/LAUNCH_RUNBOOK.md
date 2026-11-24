# Food Cart OS — launch runbook

This runbook covers the current production web launch. Mobile store submission is a separate release track.

## Production endpoints

- Customer and owner web app: https://food-cart-os.vercel.app
- Owner workspace: https://food-cart-os.vercel.app/owner
- Customer ordering URL pattern: https://food-cart-os.vercel.app/c/{cart-slug}
- Supabase project: food-cart-os (`cnzhurhlcjiulyzfutfd`)
- Git branch: `main`

## Current product behaviour

- Owners manage one cart each.
- A user account can belong to only one cart; this is enforced by a database unique index.
- Owners manage staff. Managers and operators manage menu, prices, availability, orders and store settings.
- Customers order through a cart-specific QR page without creating an account.
- Customer name and phone are optional. Phone is not an order lookup key and no OTP/SMS flow is used.
- Customer order history is available only on the same browser/device, using a 30-day session. The list shows up to the 10 most recent orders, including completed orders. Each new order is linked to the session in the database.
- Customer session creation and order creation now happen in one database transaction. Rejected checkout attempts do not leave orphan session rows. Checkout retries with the same request ID return the original order.
- Basket state and the latest local receipt persist in the same browser for up to 30 days. Unavailable/deleted items remain visible and removable.
- Checkout supports up to 30 distinct menu items and up to 999 units per item; both UI and server validate the limits.
- If browser storage is blocked, checkout can continue with an in-memory session/request ID for the current page; basket and retry persistence across reloads are unavailable in that browser.
- The owner queue loads the latest 100 orders and can load older history with cursor-based pagination. Search covers loaded orders only. Queue polling and realtime subscription run only while the Orders tab is open.
- Customer order status polling runs only when the customer has recent orders; first-time visitors do not poll an empty order history.
- Payment is cash at pickup. Online payment is not implemented.

## Owner actions before a public launch

### 1. Finish Supabase Auth configuration

In the Supabase dashboard for this project:

- [x] Site URL is set to `https://food-cart-os.vercel.app`.
- [x] `https://food-cart-os.vercel.app/**` is in the allowed redirect URLs.
- [x] `foodcartos://auth/callback` is in the allowed redirect URLs for native Android/iOS owner-app email confirmation and password recovery.
- [ ] Enable leaked-password protection. The current Supabase plan does not expose this control; it remains a known security limitation.

The redirect settings have been confirmed as configured. Email confirmation and password recovery still need an end-to-end test on web and native clients.

### 2. Complete one controlled end-to-end acceptance test

Use a dedicated test owner account and test cart, not a live food cart with real customer traffic. Confirm:

1. Owner sign-up, email confirmation, sign-in and password recovery.
2. Cart creation and initial store settings.
3. Add/edit menu items and categories; change availability and pause/resume orders.
4. Open the customer QR URL on a separate browser/device.
5. Place a cash-at-pickup order with no name or phone, then another with optional details.
6. Confirm the owner sees the order and the customer sees the pickup token and status.
7. Move each item through pending → preparing → ready → served; verify the parent order status and customer refresh.
8. Verify completed orders remain visible on the original customer browser session.
9. Verify staff permissions: owner can manage staff; manager/operator cannot; a staff account cannot be added to a second cart.
10. Verify changed prices and unavailable items are rejected at checkout with a refreshed menu.

Do not run destructive or high-volume tests against production data. Use a paid staging environment only after the owner explicitly approves its cost.

### 3. Publish the legal/support pages

Before public distribution, replace placeholders in `PRIVACY_POLICY_DRAFT.md` and `TERMS_OF_SERVICE_DRAFT.md` with:

- Legal publisher/entity name.
- Business address where required.
- Privacy/support email address.
- Effective date.
- Confirmed data retention and deletion procedure.
- Confirmed support, cancellation, refund and dispute policies.

Publish both documents at stable public URLs and link them from the product/store listings.

### 4. Operations readiness

- [ ] Confirm automated database backups and complete a restore procedure with the current Supabase plan. The connected project tools do not expose backup/restore verification.
- Set an owner for monitoring order creation, Edge Function failures and authentication issues.
- Define a support process for missing orders, incorrect menu prices, pickup disputes and staff access.
- Keep a rollback reference to the last known-good Vercel production deployment.
- The latest successful production deployment is commit `e67d21a2` (deployment `dpl_79GqJaqE8WJYWSXjaPPcs9tuhHKq`, READY). The latest tested application-code commit is `6e8170f8`, which is ahead of production. A deployment attempt returned Vercel HTTP 402 for the `api-deployments-young-hobby-team-24h` limit with a 24-hour retry window ending no earlier than `2026-11-25T10:13:33Z` (15:43 IST). No local Vercel CLI or linked project directory is available for the CLI fallback.

## Mobile app store track

The web application is deployed. The owner app launches directly into the owner workspace on native devices and uses the `foodcartos://auth/callback` scheme for authentication callbacks. Google Play and Apple App Store submission is not complete. Before store submission, complete the icon/splash assets, screenshots, listing text, legal URLs, publisher details, developer accounts, signing credentials, privacy/data-safety declarations and internal testing. A debug APK is not a store release artifact.

## Data retention notes

- Customer browser sessions expire 30 days after the most recent successful checkout.
- A Supabase Cron job runs daily at 03:17 UTC to delete expired customer-session rows and their checkout-idempotency records. Order rows remain available to the cart owner; the session link is cleared when the session is deleted.
- Order records do not currently have an automatic deletion schedule. The privacy-policy draft must not claim that orders are automatically deleted after 30 days.

## Known repository constraint

Five historical SQL migration files are absent from the repository. See `MIGRATION_HISTORY_RECONCILIATION.md`. Do not run `supabase db push` or bootstrap a fresh database from this repository until those files are recovered or a reviewed schema baseline is created.
