# Payment and order lifecycle

## Starting point

Checkout calculates totals on the server, saves an order and decrements stock in one SQLite transaction, and binds a 24-hour idempotency key to the order. The only configured provider is a test stub: it returns `paymentStatus: test` and never records a charge. Admin updates can change the order status, but cannot claim an unpaid order is paid. Cancellation restores stock once. There are no payment attempts, verified callbacks, refunds, or reconciliation records. The runtime uses SQLite JSON order payloads; the normalized SQLite migration format is a separate portability format.

## Policy

Order `status` describes fulfillment. `paymentStatus` describes funds and is never set from checkout input or an admin fulfillment update. Existing `pending`/`test` orders remain compatible. Stock is reserved at checkout, released on verified payment failure or eligible cancellation, and reserved again atomically for a retry. A timed-out attempt stays pending until trusted verification and cannot be retried. A failed attempt may be retried against the same order, preserving its original amount. Real provider operations remain unavailable. Test verification and refunds are available only in test mode and require server-side controls. Financial records are append-only where possible; reconciliation reports discrepancies and does not repair them.

The central order transition policy lives in `lib/order-lifecycle.cjs`. Legacy test/unknown orders may proceed through fulfillment without a captured payment for compatibility; this never changes their payment status or counts revenue. Production checkout has no working provider and fails closed. Admin fulfillment updates cannot set `paid` or a refund state. Paid orders cannot be cancelled through the normal cancellation route; a verified refund is required.

## Records and endpoints

The runtime SQLite schema adds `payment_attempts`, `payment_refunds`, and `payment_events`. Attempts capture the server-calculated order total and `IRR` currency. Refunds use a unique key per order, structured reason codes, and a cumulative amount limit. Events provide the order timeline. Existing orders require no rewrite and retain their historical status. Legacy orders without an attempt are not automatically treated as captured.

Checkout continues to use a 24-hour idempotency key and one transaction for order creation, stock, coupon usage, the first payment attempt, and linkage. `POST /api/orders/:id/payments/retry` and `POST /api/orders/:id/cancel` require the owner's session and CSRF token. `POST /api/admin/orders/:id/refunds` requires `orders.refund`, a recent admin session, CSRF, and an idempotency key. `GET /api/admin/payments/reconciliation` requires `system.monitor` and only reports discrepancies. Admin order detail includes a safe attempt summary, refund totals, remaining refundable amount, and timeline. Customer responses omit provider references.

In test mode only, `POST /api/payments/webhook/test` accepts HMAC-SHA256 signed raw JSON when `PAYMENT_TEST_WEBHOOK_SECRET` is set. It enforces a five-minute timestamp window, a 4 KiB body cap, a persistent rate limit, and event ID deduplication. `SUCCESS`, `FAILURE`, `TIMEOUT`, and `DUPLICATE_CALLBACK` are synthetic outcomes. Production never mounts this route. There is no unsigned callback or real-provider adapter.

Analytics counts only non-test captured payments as gross revenue and subtracts completed refunds for net revenue. Synthetic test captures never count as real revenue. Financial state is never repaired automatically. The reconciliation endpoint reports captured/unpaid orders, amount mismatches, refund mismatches, and impossible combinations. A late capture after cancellation leaves the order cancelled and raises a discrepancy; an authorized admin can explicitly refund the captured amount, clearing the discrepancy without restoring stock a second time.
