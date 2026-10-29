# Phase 27 inventory

## Stock model

`product.stock` remains the server-authoritative **available** quantity for existing catalog and cart clients. `reserved` is the sum of ACTIVE reservation rows. `onHand = available + reserved`. Quantities are nonnegative integers; checkout accepts 1-99 units per line. Product flags are `active`, `inactive`, and a separate `discontinued` flag that forces inactive visibility while retaining old order snapshots. There are no product variants in this catalog.

## Reservations and payment

Checkout creates an order, payment attempt, and per-item ACTIVE reservations in one `BEGIN IMMEDIATE` SQLite transaction. A stable checkout idempotency key prevents duplicate orders and holds. Capture commits the hold once. Failure and eligible cancellation release it once. Payment retry creates a new hold. Holds expire after `INVENTORY_RESERVATION_TTL_SECONDS` (default 1800); expiry runs on catalog/checkout requests and existing hourly maintenance, and may be invoked through `POST /api/admin/inventory/cleanup`. No new background timer is introduced. A capture after expiry is flagged for payment reconciliation and does not silently consume stock.

Legacy orders created before this change have `stockReserved` but no reservation rows. Their existing release/retry path remains available; they do not acquire retroactive expiry.

## Administration

The inventory tab shows physical, reserved, and available units, low/out-of-stock counts, filters, sorting, paginated history, delta adjustments, and transactional bulk adjustments. `LOW_STOCK_THRESHOLD` defaults to 5. The endpoint set is under `/api/admin/inventory`; reconciliation is report-only. Product editor absolute stock changes remain compatible but are audited as `MANUAL_CORRECTION` and require `inventory.adjust` permission. The preferred workflow is a delta and reason in the inventory tab. `ADMIN` has inventory view/adjust; `PRODUCT_MANAGER` has view/adjust/bulk; `SUPER_ADMIN` has all; order and support managers have none.

Refunds are financial only. To add returned physical units, an authorized administrator submits order ID, product ID, quantity, and note to `POST /api/admin/orders/:id/restock` with an idempotency key. The order must have a completed refund, and cumulative returned quantity cannot exceed purchased quantity. That action creates a `RETURNED` adjustment. Shipped units are never automatically restocked.

## Reconciliation and operations

`GET /api/admin/inventory/reconciliation` reports negative available quantities, reservation inconsistencies, orphan/terminal-order holds, and expired ACTIVE holds. Startup logs issue counts and codes; it does not repair records. The new tables live in the same SQLite database and are included in normal SQLite backups. JSON is an offline seed/import format, not a selectable runtime backend; its import/export tools do not migrate live reservations. Export or migration of a live store should use the SQLite backup path.

No automatic repair tool or external inventory notification is installed. The dashboard is the deduplicated low-stock alert surface; inventory counts and expiry counts come from stored records. Production stock must only be changed through authorized admin operations after a verified backup.

