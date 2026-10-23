# First-party storefront analytics

WEB 2 records short-lived, first-party event counts to understand product discovery and checkout. The browser may send `page_view`, `product_view`, `search` (result count only), `filter_used`, `add_to_cart`, `remove_from_cart`, `cart_view`, `checkout_started`, and `checkout_validation_failed`. The server records `registration_completed`, `login_success`, `order_created`, and checkout failure categories from actual outcomes. Order counts are deduplicated by order ID. Paid revenue, discounts, and units sold continue to come from stored server orders, never browser events. Test payments are excluded from completed revenue.

Raw events contain an event ID, UTC timestamp, type, and only applicable product ID, catalog category, result count, or allowlisted failure code. They contain no user ID, IP address, search phrase, session token, CSRF token, password, OTP, payment details, or checkout form values. There is no third-party tracker, fingerprinting, or cross-device ID. Obvious crawler user agents are omitted from the client event endpoint without blocking the crawler. Metrics are counts of events, so repeat visitors and people using multiple tabs can contribute more than once. Funnel ratios are approximate and hidden when the denominator has fewer than ten events. No raw search phrases are retained, so zero-result reporting is a count rather than a phrase list.

`ANALYTICS_ENABLED` defaults to true; set `false` to stop new event writes. `ANALYTICS_RETENTION_DAYS` defaults to 90 (allowed 7–365). Hourly maintenance deletes expired analytics events only. The admin report shows total event count and an approximate storage estimate. Analytics share the existing SQLite backup because they reside in the runtime database; retention limits their footprint. Do not treat analytics as a source of order or payment truth.

## Endpoints

| Endpoint | Access | Limit and CSRF | Output |
| --- | --- | --- | --- |
| `POST /api/analytics/event` | Public first-party JSON request | 60 requests per IP per 15 minutes, in addition to existing API limits; authenticated sessions retain the existing CSRF check | 204 on valid or duplicate event; no raw events exposed |
| `GET /api/admin/analytics` | Admin with `analytics.read` | Existing admin/API limits; GET has no CSRF mutation | Aggregate order metrics plus `journey` counts, funnel, failures, product/category counts, and retention size |

The admin endpoint accepts `range=today`, `7d`, or `30d`, or `range=custom&start=YYYY-MM-DD&end=YYYY-MM-DD` for at most 90 UTC days. The existing `days=7|30|90` parameter still controls legacy charts. The dashboard offers today, seven-day, and 30-day presets. A custom range is available through the admin API. There is no public raw-event endpoint or export.

To test, use `node --require ./tests/helpers/isolated-environment.cjs --test tests/analytics-phase25.test.cjs`. The test creates disposable storage and does not write production records.
