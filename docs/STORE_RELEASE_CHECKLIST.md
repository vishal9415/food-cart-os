# Store release checklist

## Product and engineering
- [x] Owner sign-up, sign-in and password recovery
- [x] One cart per owner account
- [x] Cart-specific owner/manager/operator membership
- [x] Cart-specific menu, settings, orders and sales reporting
- [x] Customer ordering remains a browser-based QR experience
- [x] Cash-at-pickup checkout; no online payment collection
- [x] QR display, PNG download and print layout
- [x] Android and iOS Capacitor projects build in CI
- [x] SPA rewrites for /owner and /c/:slug routes
- [x] Tenant-aware RLS and cart-scoped customer order recovery
- [x] Checkout idempotency and per-session rate limit
- [ ] End-to-end acceptance test with a newly registered owner and a real test cart
- [ ] Production domain configured as VITE_PUBLIC_APP_URL
- [ ] Restrict Edge Function CORS to the deployed web domain and approved local origins
- [ ] Configure Supabase Auth site URL and allowed redirect URLs for production
- [ ] Enable leaked-password protection in Supabase Auth
- [ ] Add production monitoring, alerting and automated backups review

## Store submission
- [ ] Final app icon set and splash screens
- [ ] Store screenshots and listing copy
- [ ] Public privacy policy URL and support contact
- [ ] Terms of service URL
- [ ] Confirm legal publisher/entity name and business address
- [ ] Google Play developer account and app signing
- [ ] Apple Developer account, bundle ID and signing
- [ ] Signed Android App Bundle (AAB), not debug APK
- [ ] Signed iOS archive and App Store Connect submission
- [ ] App privacy/data-safety declarations completed
- [ ] TestFlight and Play internal testing completed

## Decisions needed before public launch
1. Public customer web domain (used inside every cart QR code).
2. Legal publisher name and support/privacy contact email.
3. Access to Google Play Console and Apple Developer accounts when store submission begins.
4. Confirmation of the final app display name and store listing branding.
