# Food Cart OS

Responsive React + TypeScript ordering and operations app for a single food cart.

## Supabase project

The app is configured for the Food Cart Supabase project. Its current cloud setup includes:

- `menu_categories`, `menu_items`, `orders`, `order_items`, and `store_settings` tables.
- Row Level Security enabled on every public table.
- Five starter menu categories and five starter menu items, plus default store settings.
- `create-guest-order` Edge Function. It validates item IDs and quantities, calculates prices and tax from database values, creates the order and line items, and returns an order number and pickup token.

## Run locally

Requirements: Node.js 20+ and npm.

1. Extract this repository.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Set `VITE_SUPABASE_URL` to `https://cnzhurhlcjiulyzfutfd.supabase.co`.
5. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to the project's publishable key from Supabase Settings → API Keys.
6. Run `npm run dev` and open the local URL printed by Vite.

Only the publishable key belongs in the browser. Never place a Supabase secret/service-role key or payment credentials in `VITE_*` variables or commit them to source control.

## Connected in this build

- Customer menu reads categories and available menu items from Supabase.
- Guest checkout calls the deployed `create-guest-order` Edge Function.
- The database, not the browser, determines current item prices and computes the order total.
- Order creation writes an order and its line items to Supabase.
- Browser speech input/output and the rule-based menu assistant remain available.

## Pending before real-world launch

- Operator authentication and role assignment, then live operator menu/order management and realtime updates.
- Payment gateway integration and verified payment webhooks. Current checkout records a pending/demo payment; it does not charge a customer.
- AI model/voice integration, menu-photo OCR, notifications, production hosting/domain, and end-to-end QA.

The operator dashboard still contains sample/local state in this build. Do not use it as a live kitchen order console until staff authentication and live order synchronization are implemented. The order-creation function is publicly callable for guest checkout; add abuse controls (rate limiting/CAPTCHA) and an origin policy before broad public promotion.
