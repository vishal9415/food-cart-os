# Food Cart OS

Mobile-friendly customer ordering and single-cart operations app built with React, TypeScript, Vite and Supabase.

## Local setup

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Set `VITE_SUPABASE_URL` to the Food Cart Supabase project URL.
5. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to the project's publishable key.
6. Run `npm run dev` and open the local URL printed by Vite.

Never place a Supabase secret/service-role key or payment credentials in a `VITE_*` variable. `.env.local` is ignored by Git.

## Current cloud integration

- Customer menu reads available menu items and categories from Supabase.
- Guest checkout calls the `create-guest-order` Edge Function. Prices and totals are calculated server-side from database records.
- Customer details are optional; orders are pickup orders.
- Staff can sign in with an existing Supabase Auth account whose **app_metadata.role** is `operator` or `admin`.
- Authenticated operators can read the order queue, advance order status, and toggle menu item availability.
- Operator order queue refreshes on database changes and has a 20-second refresh fallback.
- Row Level Security is enabled on all public application tables.

## Not yet enabled

- Admins can invite Operators and Admins, view staff accounts, change roles, and revoke app access from the Access Management tab.
- Staff permissions are stored in trusted `app_metadata.role` and enforced server-side. Do not use user-editable metadata for access decisions.
- The first Admin account requires a one-time secure bootstrap by the project owner; after that, Admins can manage all staff from the app.
- Menu item creation/editing and category management.
- Online payments. Current checkout does not collect money; payment status remains pending and customers pay at the counter.
- Menu photo OCR, external AI voice, customer notifications, production deployment and end-to-end acceptance testing.

## Supabase project

Project reference: `cnzhurhlcjiulyzfutfd`.

The `create-guest-order` and `manage-staff-access` Edge Functions are deployed with JWT verification disabled and validate their own request context. They use the service-role key only inside the Edge Function. Add abuse protection (rate limiting and/or CAPTCHA) and tighten allowed origins before public launch. Staff invitations use Supabase Auth email delivery; configure a production SMTP provider before relying on invitations at scale.

See `supabase/migrations/` for migrations tracked in this repository. The initial database setup predates this migration file; the live project remains the current reference for the base schema.
