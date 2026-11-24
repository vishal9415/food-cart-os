# Food Cart OS — launch scenario matrix

This is the release acceptance matrix for the QR customer flow and owner workspace. Run manual scenarios with a dedicated test cart and test account. Never run destructive or load scenarios against a live vendor's production cart.

## Customer ordering and basket

| Scenario | Expected behaviour | Coverage |
|---|---|---|
| Owner deletes an item while a customer has it in the basket | The stale item remains visible as unavailable, can be removed, and blocks checkout until removed | Automated basket rules + production smoke test |
| Owner marks an item unavailable while customer is browsing | Same recovery path as a deleted item; no hidden quantity or misleading subtotal | Automated basket rules + manual |
| Owner changes an item's price while customer is browsing | Server rejects the stale price; menu refreshes; customer sees the current price before retrying | Manual |
| Owner pauses orders while customer is browsing | Server rejects checkout; customer receives a clear message and refreshed store state | Manual |
| Cart is deactivated while customer is browsing | Checkout is rejected; no order is created; customer is told the link is unavailable | Manual |
| Customer refreshes or closes/reopens the tab | Basket restores for the same cart and browser for up to 30 days | Automated basket rules + manual |
| Browser blocks local storage or storage quota is full | Checkout can use an in-memory session/request ID for the current page; reload persistence is unavailable but the customer is not blocked from ordering | Automated storage tests |
| Customer returns to the same cart within 30 days | Orders placed in that browser session appear in recent order history; another cart session never exposes them | Rollback-only database checkout test + manual |
| Customer retries checkout with the same request ID | The same order is returned, the replay is marked, and no duplicate order/request record is created | Rollback-only database idempotency test |
| Menu item is assigned a category from another cart | Database composite foreign key rejects the cross-cart category reference | Rollback-only database constraint test |
| Owner deletes a menu category | Linked menu items retain their cart and become uncategorised rather than losing cart ownership | Rollback-only database constraint test |
| Customer opens two different cart QR links on the same device | Each cart has an independent basket and order session | Manual |
| Customer removes the final item | Basket becomes empty and checkout is unavailable | Automated basket rules |
| Customer quantity reaches 999 or attempts 1,000 | UI caps quantity at 999; server remains the final validator | Automated basket rules |
| Customer tries to order 31 distinct items | Checkout rejects the request without creating a partial order | Manual/API |
| Customer double-clicks Place Order | Button is busy/disabled; one order is created | Manual |
| Network drops after the server creates the order but before the response arrives | Retry uses the same request ID and returns the existing order instead of creating a duplicate | Manual/API |
| Customer has no name or phone | Order can still be placed; both fields remain optional | Manual |
| Customer has an expired or invalid session | A clear recovery message is shown; no other cart's order history is returned | Manual/API |

## Owner operations

| Scenario | Expected behaviour | Coverage |
|---|---|---|
| Two staff members update the same order item at once | Only a valid next status transition succeeds; the other user is asked to refresh | Database transaction + manual |
| Staff member is removed while signed in | Subsequent protected operations are denied by current membership checks | Manual/API |
| Manager/operator tries to invite or remove staff | Request is denied; owner-only controls remain protected server-side | Manual/API |
| Staff tries to edit an order total or item directly | Database trigger rejects direct order mutation; approved status RPC remains available | Database security review |
| An order status audit event references another cart/order/item | Composite foreign keys reject the mismatched audit reference | Database constraint review |
| One item in a multi-item order is ready while another is preparing | Parent order shows partial readiness; item statuses remain independent | Manual |
| All items are served | Parent order moves to completed | Manual |
| More than 100 orders exist | Owner sees the newest 100 first and can load older orders in stable cursor-based pages without losing access to history | Manual regression |
| New orders arrive while older pages are loaded | Newest orders refresh at the top while previously loaded history remains visible; cursor pagination continues from the oldest loaded order | Manual regression |
| Owner searches for an older order | Search covers loaded records; owner loads older pages before searching earlier history | Manual regression |
| Realtime subscription disconnects | Periodic refresh restores the latest order queue | Manual |

## Tenant isolation and security

| Scenario | Expected behaviour | Coverage |
|---|---|---|
| Customer uses a session token against a different cart ID | No orders are returned and no cross-cart access occurs | Edge-function review |
| Staff from Cart A queries Cart B orders/menu | RLS denies access | Database security review |
| Anonymous visitor queries customer session or idempotency tables | No direct access; these tables are service-role-only | RLS/security advisor |
| User tries to create a cart for another user by changing request payload | Edge Function verifies the bearer token and derives the actor from Supabase Auth | Edge-function review |
| User tries to promote themselves to owner or remove the owner | Membership policy and owner-only Edge Function deny the change | Database + Edge Function review |
| Malformed quantities, duplicate item IDs, wrong-cart item IDs or altered prices are submitted | Server-side validation rejects the request atomically | Database checkout function review |

## Operational readiness

- [ ] Confirm production email confirmation and password recovery.
- [ ] Confirm automated backups and a restore drill.
- [ ] Publish privacy policy and terms with real publisher/contact details.
- [ ] Confirm owner support process for missing orders and pickup disputes.
- [ ] Confirm monitoring/alert ownership for checkout Edge Function errors.
- [ ] Confirm rollback procedure to the last known-good Vercel deployment.
- [ ] Run the customer/owner acceptance scenarios on a dedicated test cart.
- [ ] Do not bootstrap a fresh Supabase database until the missing historical migration files are recovered or a reviewed baseline is created.

## Known launch limitations

- Cash at pickup only; no online payment collection or reconciliation.
- Customer order history is tied to the same browser/device and 30-day session; no phone-number lookup or OTP.
- Owner order queue loads the newest 100 orders initially; older orders are available through cursor-based pagination.
- Supabase leaked-password protection is disabled on the current plan; enable it if/when the project plan supports it.
- Store listing publication and legal policy completion are separate from the web app deployment.
