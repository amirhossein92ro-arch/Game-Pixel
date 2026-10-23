-- OFFLINE migration-readiness schema. This is NOT the live v16 payload schema.
-- Applied only by explicit tooling; never by application startup.
CREATE TABLE migration_readiness_meta (id INTEGER PRIMARY KEY CHECK(id=1), format TEXT NOT NULL CHECK(format='web2-normalized/v1')) STRICT;
INSERT INTO migration_readiness_meta VALUES(1,'web2-normalized/v1');
CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT, email_normalized TEXT UNIQUE, phone TEXT UNIQUE,
 is_active INTEGER NOT NULL CHECK(is_active IN (0,1)), created_at TEXT, updated_at TEXT, deleted_at TEXT,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 CHECK((email IS NULL AND email_normalized IS NULL) OR (email IS NOT NULL AND email_normalized IS NOT NULL AND email_normalized=lower(trim(email)))),
 CHECK(phone IS NULL OR (length(phone)=11 AND substr(phone,1,2)='09' AND phone NOT GLOB '*[^0-9]*'))
) STRICT;
CREATE TABLE user_credentials (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 password_hash TEXT NOT NULL CHECK(length(password_hash)=60)
) STRICT;
CREATE TABLE admin_accounts (
 id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE RESTRICT, username TEXT NOT NULL UNIQUE,
 email_normalized TEXT UNIQUE, password_hash TEXT NOT NULL CHECK(length(password_hash)=60),
 role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN','ADMIN','ORDER_MANAGER','PRODUCT_MANAGER','SUPPORT')),
 is_active INTEGER NOT NULL CHECK(is_active IN (0,1)), totp_required INTEGER NOT NULL CHECK(totp_required IN (0,1)),
 created_at TEXT, updated_at TEXT, deleted_at TEXT, payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;
CREATE TABLE products (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, price INTEGER NOT NULL CHECK(price>0),
 stock INTEGER NOT NULL CHECK(stock>=0 AND stock<=1000000), status TEXT NOT NULL CHECK(status IN ('active','inactive')),
 revision INTEGER NOT NULL CHECK(revision>=0), created_at TEXT, updated_at TEXT, deleted_at TEXT,
 payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;
CREATE INDEX products_category_active ON products(category,status) WHERE deleted_at IS NULL;
CREATE TABLE discounts (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE CHECK(code=upper(trim(code))), type TEXT NOT NULL CHECK(type IN ('percent','fixed')),
 value INTEGER NOT NULL CHECK(value>0 AND (type<>'percent' OR value<=100)),
 is_active INTEGER NOT NULL CHECK(is_active IN (0,1)), uses INTEGER NOT NULL CHECK(uses>=0),
 max_uses INTEGER CHECK(max_uses>0 AND uses<=max_uses), revision INTEGER NOT NULL CHECK(revision>=0),
 created_at TEXT, updated_at TEXT, deleted_at TEXT, payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;
CREATE TABLE orders (
 id TEXT PRIMARY KEY, code TEXT UNIQUE, user_id TEXT REFERENCES users(id) ON DELETE RESTRICT, source_user_id TEXT,
 status TEXT NOT NULL CHECK(status IN ('pending','paid','processing','shipped','delivered','cancelled')),
 payment_status TEXT NOT NULL CHECK(payment_status IN ('unknown','test','pending','paid','failed','cancelled','refunded')), payment_provider TEXT, payment_reference TEXT,
 subtotal INTEGER CHECK(subtotal>=0), discount INTEGER CHECK(discount>=0), shipping_cost INTEGER CHECK(shipping_cost>=0),
 total INTEGER NOT NULL CHECK(total>=0), revision INTEGER NOT NULL CHECK(revision>=0),
 created_at TEXT, updated_at TEXT, payload TEXT NOT NULL CHECK(json_valid(payload)),
 CHECK(subtotal IS NULL OR discount IS NULL OR discount<=subtotal),
 CHECK(subtotal IS NULL OR discount IS NULL OR shipping_cost IS NULL OR total=subtotal-discount+shipping_cost),
 UNIQUE(payment_provider,payment_reference), UNIQUE(id,user_id)
) STRICT;
CREATE INDEX orders_owner_date ON orders(user_id,created_at);
CREATE INDEX orders_status_date ON orders(status,created_at);
CREATE INDEX orders_date ON orders(created_at);
CREATE TABLE order_items (
 order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 source_product_id TEXT NOT NULL, product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
 product_name TEXT NOT NULL, unit_price INTEGER NOT NULL CHECK(unit_price>0),
 quantity INTEGER NOT NULL CHECK(quantity>0), line_total INTEGER NOT NULL CHECK(line_total=unit_price*quantity),
 position INTEGER NOT NULL CHECK(position>=0), payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(order_id,source_product_id)
) STRICT;
CREATE TABLE notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, resource_id TEXT, created_at TEXT, read_at TEXT,
 payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;
CREATE INDEX notifications_owner_read_date ON notifications(user_id,read_at,created_at);
CREATE TABLE audit_logs (
 id TEXT PRIMARY KEY, admin_id TEXT REFERENCES admin_accounts(id) ON DELETE RESTRICT,
 source_actor_id TEXT, actor_username TEXT, actor_role TEXT, action TEXT NOT NULL,
 target_type TEXT, target_id TEXT, details TEXT NOT NULL CHECK(json_valid(details)), created_at TEXT,
 payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;
CREATE INDEX audit_logs_date ON audit_logs(created_at);
CREATE INDEX audit_logs_actor_date ON audit_logs(source_actor_id,created_at);
CREATE TABLE settings (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE messages (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE posts (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE comments (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE user_addresses (
 id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 is_default INTEGER NOT NULL CHECK(is_default IN (0,1)), payload TEXT NOT NULL CHECK(json_valid(payload)), PRIMARY KEY(user_id,id)
) STRICT;
CREATE UNIQUE INDEX addresses_one_default ON user_addresses(user_id) WHERE is_default=1;
CREATE TABLE wishlist (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 created_at TEXT, PRIMARY KEY(user_id,product_id)
) STRICT;
CREATE TABLE tickets (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, subject TEXT NOT NULL, category TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('open','answered','closed')), created_at TEXT, updated_at TEXT, payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;
CREATE INDEX tickets_owner_date ON tickets(user_id,updated_at);
CREATE TABLE ticket_messages (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
 author TEXT NOT NULL CHECK(author IN ('user','admin')), message TEXT NOT NULL, created_at TEXT, payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;
CREATE INDEX ticket_messages_parent ON ticket_messages(ticket_id);
CREATE TABLE idempotency_keys (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, purpose TEXT NOT NULL, key TEXT NOT NULL,
 order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT, request_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at>created_at), PRIMARY KEY(user_id,purpose,key),
 FOREIGN KEY(order_id,user_id) REFERENCES orders(id,user_id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX idempotency_expiry ON idempotency_keys(expires_at);
-- Session state is legitimate persistent security data, but JSON imports never transfer active credentials.
CREATE TABLE sessions (
 hash TEXT PRIMARY KEY, principal_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('user','admin')),
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL, principal_version INTEGER NOT NULL CHECK(principal_version>=0)
) STRICT;
CREATE INDEX sessions_principal ON sessions(principal_id,kind,expires_at);
CREATE TRIGGER preserve_final_super_admin_delete BEFORE DELETE ON admin_accounts
 WHEN OLD.role='SUPER_ADMIN' AND OLD.is_active=1 AND (SELECT count(*) FROM admin_accounts WHERE role='SUPER_ADMIN' AND is_active=1)<=1
 BEGIN SELECT RAISE(ABORT,'FINAL_SUPER_ADMIN'); END;
CREATE TRIGGER preserve_final_super_admin_update BEFORE UPDATE OF role,is_active ON admin_accounts
 WHEN OLD.role='SUPER_ADMIN' AND OLD.is_active=1 AND (NEW.role<>'SUPER_ADMIN' OR NEW.is_active<>1)
 AND (SELECT count(*) FROM admin_accounts WHERE role='SUPER_ADMIN' AND is_active=1)<=1
 BEGIN SELECT RAISE(ABORT,'FINAL_SUPER_ADMIN'); END;
-- No payment_events or admin_permissions table: callbacks and custom permission grants do not exist today.
-- Factor ciphers, reset challenges, pending auth, devices and lockouts require a dedicated security-state
-- migration before this rehearsal format can replace the live store. It is deliberately not a runtime driver.
