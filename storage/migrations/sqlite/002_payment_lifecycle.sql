-- Rebuild the rehearsal order table so historical payment states remain portable.
CREATE TABLE orders_new (
 id TEXT PRIMARY KEY, code TEXT UNIQUE, user_id TEXT REFERENCES users(id) ON DELETE RESTRICT, source_user_id TEXT,
 status TEXT NOT NULL CHECK(status IN ('pending','awaiting_payment','payment_failed','paid','processing','shipped','delivered','refund_pending','partially_refunded','refunded','cancelled')),
 payment_status TEXT NOT NULL CHECK(payment_status IN ('unknown','test','pending','authorized','captured','paid','failed','cancelled','partially_refunded','refunded')),
 payment_provider TEXT, payment_reference TEXT,
 subtotal INTEGER CHECK(subtotal>=0), discount INTEGER CHECK(discount>=0), shipping_cost INTEGER CHECK(shipping_cost>=0),
 total INTEGER NOT NULL CHECK(total>=0), revision INTEGER NOT NULL CHECK(revision>=0),
 created_at TEXT, updated_at TEXT, payload TEXT NOT NULL CHECK(json_valid(payload)),
 CHECK(subtotal IS NULL OR discount IS NULL OR discount<=subtotal),
 CHECK(subtotal IS NULL OR discount IS NULL OR shipping_cost IS NULL OR total=subtotal-discount+shipping_cost),
 UNIQUE(payment_provider,payment_reference), UNIQUE(id,user_id)
) STRICT;
INSERT INTO orders_new SELECT * FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;
CREATE INDEX orders_owner_date ON orders(user_id,created_at);
CREATE INDEX orders_status_date ON orders(status,created_at);
CREATE INDEX orders_date ON orders(created_at);

CREATE TABLE payment_attempts (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 provider TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','authorized','captured','failed','cancelled')),
 amount INTEGER NOT NULL CHECK(amount>=0),currency TEXT NOT NULL,provider_reference TEXT,failure_code TEXT,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(provider,provider_reference)
) STRICT;
CREATE INDEX payment_attempts_order ON payment_attempts(order_id,created_at);
CREATE TABLE payment_refunds (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 payment_id TEXT NOT NULL REFERENCES payment_attempts(id) ON DELETE RESTRICT,
 idempotency_key TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),
 reason_code TEXT NOT NULL CHECK(reason_code IN ('CUSTOMER_REQUEST','OUT_OF_STOCK','DUPLICATE_ORDER','PAYMENT_ERROR','ADMIN_CORRECTION','OTHER')),
 status TEXT NOT NULL CHECK(status IN ('pending','completed','failed')),created_by TEXT NOT NULL,
 provider_reference TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(order_id,idempotency_key)
) STRICT;
CREATE INDEX payment_refunds_order ON payment_refunds(order_id,created_at);
CREATE TABLE payment_events (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 event_type TEXT NOT NULL,created_at TEXT NOT NULL,actor_type TEXT NOT NULL,actor_id TEXT NOT NULL,
 details TEXT NOT NULL CHECK(json_valid(details))
) STRICT;
CREATE INDEX payment_events_order ON payment_events(order_id,created_at);
