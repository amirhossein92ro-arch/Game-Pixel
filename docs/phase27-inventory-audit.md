# Phase 27 inventory audit (before changes)

- Runtime storage is SQLite only (`storage/index.cjs`). JSON is a seed/import format; there is no active JSON transaction backend. SQLite uses synchronous `BEGIN IMMEDIATE` transactions and versioned product rows.
- Product `stock` is a nonnegative integer and currently means sellable units. Public catalog and the frontend read this field. Products have `active`/`inactive` status, and deletion is soft when orders reference the product.
- Checkout quotes validate product status, price, quantity (1–99), and current `stock`. Checkout creates an order, payment attempt, and decrements product `stock` in one transaction. Idempotency uses user/key and request hash.
- `stockReserved` on the order marks the decrement, but no individual reservation records or expiry exist. Payment failure/cancellation adds units back; retry decrements again. Trusted payment capture leaves stock decremented. Refunds do not restock.
- Order items snapshot name, price, quantity, and product ID. Historical order totals do not depend on current catalog prices.
- Admin product editing accepts an absolute `stock` value and writes an audit entry when it changes. Bulk actions cover status/category/delete, not stock. A low-stock panel exists; its threshold is hardcoded at 5 in search.
- Existing role permissions cover product read/edit and order refunds. There are no separate inventory view/adjust/bulk permissions, no inventory history, and no reservation reconciliation.
- Existing payment reconciliation checks financial state. There are no reservation invariants or expiry metrics.

The implementation must preserve the public `stock` field as available stock for compatibility while tracking physical on-hand and active reservations separately. Existing orders without reservation rows require a legacy path.
