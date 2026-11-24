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
- Customer order history is available only on the same browser/device, using a 30-day session. The list shows up to the 10 most recent orders, including completed orders.
- Payment is cash at pickup. Online payment is not implemented.

## Owner actions before a public launch

### 1. Finish Supabase Auth configuration

In the Supabase dashboard for this project:

- Set the Site URL to `https://food-cart-os.vercel.app`.
- Add `https://food-cart-os.vercel.app/**` to the allowed redirect URLs (retain any required local development URLs separately).
- Add `foodcartos://auth/callback` to the allowed redirect URLs for native Android/iOS owner-app email confirmation and password recovery.
- Enable leaked-password protection in Auth password security settings.

These settings are not currently editable through the connected project-management actions and require a project owner to change in the dashboard. The native callback URI must be present before testing email confirmation or password recovery inside either installed app.

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

- Confirm automated database backups and a restore procedure with the current Supabase plan.
- Set an owner for monitoring order creation, Edge Function failures and authentication issues.
- Define a support process for missing orders, incorrect menu prices, pickup disputes and staff access.
- Keep a rollback reference to the last known-good Vercel production deployment.

## Mobile app store track

The web application is deployed. The owner app launches directly into the owner workspace on native devices and uses the `foodcartos://auth/callback` scheme for authentication callbacks. Google Play and Apple App Store submission is not complete. Before store submission, complete the icon/splash assets, screenshots, listing text, legal URLs, publisher details, developer accounts, signing credentials, privacy/data-safety declarations and internal testing. A debug APK is not a store release artifact.

## Known repository constraint

Five historical SQL migration files are absent from the repository. See `MIGRATION_HISTORY_RECONCILIATION.md`. Do not run `supabase db push` or bootstrap a fresh database from this repository until those files are recovered or a reviewed schema baseline is created.
