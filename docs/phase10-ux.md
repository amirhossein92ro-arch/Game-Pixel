# Phase 10 shopping UX — 2026-10-16

Phase 10 is complete in the existing working tree. The premium dark gaming
palette and existing components were retained. No dependencies were added.

## Starting state and audit

The interrupted SEO/integration phase had already been completed and documented
in `docs/continuation.md`. Existing security, operations, SEO, responsive styles,
image optimizations, and search debouncing were kept. Before Phase 10 edits,
`node scripts/check.cjs` passed and `npm test` passed 175/175 tests.

The audit covered the homepage, navigation, search/filters, cards, product detail,
cart, checkout, login/register, account sections, admin, and mobile layouts. The
main issues were:

- Cards did not provide a direct purchase action. Seeded ratings, promotional
  badges, warranty defaults, and some homepage copy implied unsupported claims.
- Detail information and purchase controls needed a clearer order. Availability
  needed to distinguish verified inventory from cached data.
- Cart row rebuilding disturbed keyboard focus. Remove/quantity controls,
  shipping estimates, empty states, and coupon feedback needed clearer wording.
- Checkout sent identity fields rejected by the server's strict allowlist.
  Locally calculated percentage discounts could also disagree with a real
  server-side discount cap, preventing a customer from completing review.
- Authentication errors, field validation, pending requests, account return
  destinations, and destructive admin actions needed more consistent behavior.
- Mobile account/cart access, collapsed navigation, filter spacing, touch
  targets, modal bounds, and table containment needed verification and fixes.

## Resulting behavior

Cards expose the product's name, price, category, real feature, stock, wishlist,
and a direct add button. Product detail prioritizes image/title/price/stock and
purchase controls, followed by real features, description, recorded warranty
when present, and support access. Ratings and unverified guarantees are omitted.
Limited stock is shown only for verified positive inventory of three or fewer.
Cached catalog data is clearly described as requiring inventory verification.

Adding a product updates cart counts immediately, prevents repeated double-click
additions, and gives lightweight feedback with a cart link. Quantity updates
retain the row and focus, respect inventory and the server's 99-unit limit, and
show readable line totals. Cart/checkout show subtotal, discount, shipping, and
total; estimates are labeled. Empty carts offer a shopping destination.

Checkout groups contact, shipping, review, and submission. Validation is adjacent
to the field and focuses the first invalid control. Coupon checks and order
submission have pending guards. Actual server quotes, including capped coupons,
are displayed using a short-lived in-memory snapshot bound to the exact cart
and coupon. Review and final submission still request fresh server verification.
The order payload contains only allowed fields; identity and prices remain
server-derived. Expired sessions preserve the saved cart.

Search normalizes Persian/Arabic letter and digit variants and remains debounced
and local. Filter chips, individual clearing, reset, and no-result guidance are
available. Unchanged search results reuse existing product DOM.

Mobile navigation initializes before remote requests finish, has clear account
and cart shortcuts, and closes with Escape while returning focus. Closed links
are inert. Account return destinations are restricted to public same-origin
shopping routes. Dialogs trap focus and return it on close. Touch controls,
visible keyboard focus, readable form text, summary wrapping, bounded dialogs,
and compact scrollable category navigation reuse existing styles.

Admin changes add clear pending states and Persian confirmations for product/user
deletion, disabling accounts, cancelling orders, and reducing privileges.
Cancellation sends no mutation. Tables, role/status labels, empty results, and
filter reset controls are clearer. Harmless actions do not gain confirmation.

## Files changed for this phase

| Group | Files |
| --- | --- |
| Templates | `index.html`, `catalog.html`, `product.html`, `cart.html`, `checkout.html`, `profile.html`, `admin.html`, `admin-login.html` |
| Styles | `style.css`, `css/account.css`, `css/admin.css` |
| Storefront/account scripts | `script.js`, `js/session.js`, `js/profile.js`, `js/wishlist.js` |
| Admin scripts | `js/admin.js`, `js/admin-actions.js`, `js/admin-console.js`, `js/admin-users.js`, `js/admin-login.js` |
| Server rendering/catalog normalization | `server.js`, `lib/seo.cjs` |
| Tests | `tests/shopping-ux.test.cjs`, `tests/admin-browser.test.cjs`, `tests/cart.test.cjs`, `tests/session.test.cjs`, `tests/admin-security.test.cjs`, `tests/admin.test.cjs`, `tests/dev-admin.test.cjs`, `tests/user-management.test.cjs` |
| Handoff | `docs/phase10-ux.md` |

Active template asset URLs were versioned for the changed styles/scripts.
Existing DOM test loaders now strip query strings when opening local scripts;
their authorization checks remain intact. Browser screenshots in `.runtime/`
were refreshed. The read-only verifier refreshed
`var/product-detail-verification.json`.

## Final verification

| Check | Result |
| --- | --- |
| `node scripts/check.cjs` | Pass: JavaScript syntax, HTML IDs, CSP compatibility, local assets/pages |
| `npm test` | 184/184 pass; zero failures, skips, cancellations, or TODOs |
| `node --test tests/shopping-ux.test.cjs` | 9/9 pass with real HTTP sessions, temporary database, server quotes, actual checkout, and admin confirmations |
| Chromium, included in the full suite | Desktop 1440px and mobile 390px flows; existing DOM resized to 320/360/768px for overflow checks, including admin users |
| Browser assertions | Menu/Escape/focus, visible keyboard outline, touch targets, contrast, RTL layout, bounded dialogs/tables, reduced motion, and no uncaught exceptions |
| Product verifier on disposable server/database | 69/69 products, 69 unique card IDs, zero failures; fresh and stale cache paths; normal server limits enabled |
| Git whitespace check on affected tracked files | Pass with Windows CRLF recognized |

Coverage includes add/count/double click, quantity/remove/refill, unavailable
products, Persian search/filter/reset/no results, invalid and capped coupons,
checkout field errors and duplicate prevention, login/registration rejection,
expired sessions, safe return destinations, and cancelled destructive actions.
The full suite also verifies CSRF, session revocation, RBAC, ownership, CSP,
payload allowlists, authoritative pricing/stock, transactional checkout,
idempotency, recovery races, rate limits, persistence, and backup/restore.

## Deployment and remaining validation

There are no known failing flows in this phase. Physical-device, Safari/Firefox,
and manual screen-reader validation remain outside the automated Chromium checks.
Production provider and infrastructure work remains as documented in
`docs/continuation.md`; checkout continues to identify its configured demo mode.

No live deployment, PM2 action, `.env` change, or active database change was made.
Tests and the product verifier used disposable databases. After deploying the
files, restart the PM2 application `web2`: server code and SEO templates are
loaded at process startup, and the supplied PM2 configuration has `watch:false`.
