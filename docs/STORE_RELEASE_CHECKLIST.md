# Store release checklist

## Product and engineering
- [x] Owner sign-up, sign-in and password recovery
- [x] One cart per owner account
- [x] Database-enforced one-cart membership per user account
- [x] Cart-specific owner/manager/operator membership
- [x] Cart-specific menu, settings, orders and sales reporting
- [x] Customer ordering remains a browser-based QR experience
- [x] Cash-at-pickup checkout; no online payment collection
- [x] QR display, PNG download and print layout
- [x] Android and iOS Capacitor projects build in CI
- [x] Native owner apps launch directly into the owner workspace
- [x] Native authentication callback handling implemented for email confirmation and password recovery
- [x] SPA rewrites for /owner and /c/:slug routes
- [x] Tenant-aware RLS and cart-scoped customer order recovery
- [x] Checkout idempotency and per-session/cart rate limits
- [x] Customer order/session association and 30-day browser history
- [x] Atomic customer-session creation with checkout; rejected attempts leave no orphan sessions
- [x] Daily cleanup of expired 30-day customer sessions and checkout-idempotency records
- [x] Customer-facing 30-distinct-item order limit
- [x] Cart-scoped category, session and order-audit foreign-key integrity
- [x] Owner order-history cursor pagination with matching database index
- [x] Browser storage fallback for checkout session/request IDs
- [x] Automated regression tests for basket and browser-storage edge cases
- [x] Production Vercel project linked to GitHub main and deployed successfully
- [x] Production QR base URL configured as https://food-cart-os.vercel.app
- [x] Edge Function CORS restricted to production, native app and local development origins
- [ ] End-to-end acceptance test with a newly registered owner and a real test cart
- [x] Configure Supabase Auth site URL and allowed redirect URLs for production, including `foodcartos://auth/callback`
- [ ] Enable leaked-password protection in Supabase Auth (blocked by current plan capability)
- [ ] Complete production end-to-end acceptance test on a dedicated test cart
- [ ] Verify automated backups and complete a restore drill
- [ ] Add production monitoring and alerting
- [ ] Deploy latest main commit after Vercel's 100-deploy/24-hour quota resets

## Store submission
- [ ] Final app icon set and splash screens
- [ ] Store screenshots and listing copy
- [ ] Finalise and publish privacy policy (draft in `docs/PRIVACY_POLICY_DRAFT.md`)
- [ ] Finalise and publish terms of service (draft in `docs/TERMS_OF_SERVICE_DRAFT.md`)
- [ ] Support/privacy contact email and legal publisher details
- [ ] Confirm legal publisher/entity name and business address
- [ ] Google Play developer account and app signing
- [ ] Apple Developer account, bundle ID and signing
- [ ] Signed Android App Bundle (AAB), not debug APK
- [ ] Signed iOS archive and App Store Connect submission
- [ ] App privacy/data-safety declarations completed
- [ ] TestFlight and Play internal testing completed

## Decisions needed before public launch
1. Legal publisher/entity name and business address.
2. Confirm the public support/privacy email address.
3. Approve an order/session/idempotency data-retention schedule and deletion process.
4. Access to Google Play Console and Apple Developer accounts when store submission begins.
5. Confirmation of the final app display name and store listing branding (current default: Food Cart OS).
