'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tables = ['products','users','orders','discounts','messages','posts','comments'];
function scrub(value) {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(password|password_?hash|currentPassword|newPassword|confirmPassword|cardNumber|cvv2?|expiryDate|expiryMonth|expiryYear)$/i.test(key)).map(([key,v])=>[key,scrub(v)]));
}
function openDatabase(filename, seedFile) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename),{recursive:true});
    const db = new DatabaseSync(filename);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    for(const table of tables) db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)));`);
    db.exec(`CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,phone TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY,principal TEXT NOT NULL,kind TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS password_reset_challenges (
        id TEXT PRIMARY KEY,user_id TEXT,phone_hash TEXT NOT NULL,otp_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,verified_token_hash TEXT,verified_expires_at INTEGER,used_at INTEGER,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS password_reset_phone ON password_reset_challenges(phone_hash,created_at);
      CREATE TABLE IF NOT EXISTS order_items (order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,product_id TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),unit_price INTEGER NOT NULL CHECK(unit_price>0),PRIMARY KEY(order_id,product_id));
      CREATE TABLE IF NOT EXISTS idempotency (user_id TEXT NOT NULL,key TEXT NOT NULL,order_id TEXT NOT NULL REFERENCES orders(id),request_hash TEXT NOT NULL,PRIMARY KEY(user_id,key));`);
    db.exec(`CREATE TABLE IF NOT EXISTS wishlist (
      user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,product_id TEXT NOT NULL,created_at TEXT NOT NULL,
      PRIMARY KEY(user_id,product_id));
      CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),subject TEXT NOT NULL,category TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open','answered','closed')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS tickets_owner ON tickets(user_id,updated_at);
      CREATE TABLE IF NOT EXISTS ticket_messages (
      id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      author TEXT NOT NULL CHECK(author IN ('user','admin')),message TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,type TEXT NOT NULL,
      title TEXT NOT NULL,message TEXT NOT NULL,resource_id TEXT,created_at TEXT NOT NULL,read_at TEXT);
      CREATE INDEX IF NOT EXISTS notifications_owner ON notifications(user_id,created_at);
      CREATE TABLE IF NOT EXISTS session_details (
      session_hash TEXT PRIMARY KEY REFERENCES sessions(hash) ON DELETE CASCADE,
      created_at TEXT NOT NULL,device TEXT NOT NULL);`);
    db.exec(`CREATE TABLE IF NOT EXISTS admin_accounts (
      id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN','ADMIN','ORDER_MANAGER','PRODUCT_MANAGER','SUPPORT')),
      active INTEGER NOT NULL CHECK(active IN (0,1)),totp_required INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,actor_username TEXT NOT NULL,actor_role TEXT NOT NULL,
      action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,details TEXT NOT NULL CHECK(json_valid(details)),created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS audit_date ON audit_logs(created_at);`);
    if (!db.prepare('PRAGMA table_info(admin_accounts)').all().some(c => c.name === 'last_login')) db.exec('ALTER TABLE admin_accounts ADD COLUMN last_login TEXT');
    if (!db.prepare('PRAGMA table_info(admin_accounts)').all().some(c => c.name === 'session_version')) db.exec('ALTER TABLE admin_accounts ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0');
    function transaction(fn) {
        if(db.isTransaction) return fn();
        db.exec('BEGIN IMMEDIATE');
        try {const result=fn();db.exec('COMMIT');return result;} catch(error){db.exec('ROLLBACK');throw error;}
    }
    const list = table => {if(!tables.includes(table))throw Error('Unknown collection');return db.prepare(`SELECT payload FROM ${table} ORDER BY rowid`).all().map(r=>JSON.parse(r.payload));};
    function replace(table,rows) {
        if(!tables.includes(table)) throw Error('Unknown collection');
        const keep=new Set((rows||[]).map(row=>String(row.id)));
        for(const old of db.prepare(`SELECT id FROM ${table}`).all())if(!keep.has(old.id))db.prepare(`DELETE FROM ${table} WHERE id=?`).run(old.id);
        const insert=db.prepare(`INSERT INTO ${table}(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`);
        for(const raw of rows||[]) {
            const row=scrub(raw);
            if(row.id==null)row.id=crypto.randomUUID();
            if(table==='products')row.id=String(row.id);
            if(table==='orders')for(const item of row.items||[])if(item.id!=null)item.id=String(item.id);
            insert.run(String(row.id),JSON.stringify(row));
            if(table==='orders') {db.prepare('DELETE FROM order_items WHERE order_id=?').run(String(row.id));for(const item of row.items||[]) {
                const price=Number(item.price??item.unitPrice);
                if(Number.isSafeInteger(item.quantity)&&item.quantity>0&&Number.isSafeInteger(price)&&price>0)
                    db.prepare('INSERT INTO order_items VALUES(?,?,?,?)').run(String(row.id),String(item.id??item.product),item.quantity,price);
            }}
        }
    }
    function read() {
        const settings=db.prepare("SELECT payload FROM settings WHERE id='legacy'").get();
        const data=settings?JSON.parse(settings.payload):{};
        for(const table of tables)data[table]=list(table);
        return data;
    }
    function write(data) {return transaction(()=>{
        for(const table of tables) if(Array.isArray(data[table])) replace(table,data[table]);
        const settings=Object.fromEntries(Object.entries(data).filter(([key])=>!tables.includes(key)&&key!=='admin'));
        db.prepare("INSERT OR REPLACE INTO settings VALUES('legacy',?)").run(JSON.stringify(scrub(settings)));
    });}
    if(!db.prepare("SELECT 1 FROM settings WHERE id='migration-v1'").get()) transaction(()=>{
        const seed=fs.existsSync(seedFile)?JSON.parse(fs.readFileSync(seedFile,'utf8').replace(/^\uFEFF/,'')):{};
        const now=new Date().toISOString();
        seed.products=(seed.products||[]).map(p=>({...p,image:p.image||'img/product-placeholder.svg',status:p.status==='inactive'?'inactive':'active',createdAt:p.createdAt||now,updatedAt:p.updatedAt||now}));
        seed.orders=(seed.orders||[]).map(o=>({...scrub(o),paymentStatus:o.paymentMethod==='test-card'?'test':o.paymentStatus||'unknown'}));
        seed.discounts=[{id:crypto.randomUUID(),code:'WEB2',type:'percent',value:10,active:true,expiresAt:null,maxUses:null,uses:0},...(seed.discounts||[]).filter(d=>d.code!=='WEB2')];
        write(seed);
        db.prepare("INSERT INTO settings VALUES('migration-v1','true')").run();
    });
    // Upgrade legacy numeric IDs without allocating new identities or changing keys.
    if(!db.prepare("SELECT 1 FROM settings WHERE id='product-string-ids-v1'").get()) transaction(()=>{
        replace('products',list('products'));
        replace('orders',list('orders'));
        db.prepare("INSERT INTO settings VALUES('product-string-ids-v1','true')").run();
    });
    // One-time upgrade for databases created before the expanded shipped catalog.
    // Existing IDs, administrator edits and recorded deletions always win.
    if(!db.prepare("SELECT 1 FROM settings WHERE id='expanded-product-catalog-v1'").get()) transaction(()=>{
        const seed=fs.existsSync(seedFile)?JSON.parse(fs.readFileSync(seedFile,'utf8').replace(/^\uFEFF/,'')):{};
        const existing=list('products'),ids=new Set(existing.map(p=>String(p.id)));
        const deleted=new Set(db.prepare("SELECT target_id FROM audit_logs WHERE action='PRODUCT_DELETED' AND target_type='product'").all().map(r=>r.target_id));
        const added=[];
        for(const raw of seed.products||[]) {
            if(raw.id==null || !String(raw.id).trim() || !raw.name || !Number.isSafeInteger(raw.price) || raw.price<=0)throw Error('Invalid shipped product seed');
            const id=String(raw.id);
            if(ids.has(id)||deleted.has(id))continue;
            if(existing.some(p=>p.name===raw.name && p.brand===raw.brand))continue;
            const timestamp=new Date().toISOString();
            added.push({...raw,id,image:raw.image||'img/product-placeholder.svg',status:raw.status==='inactive'?'inactive':'active',createdAt:raw.createdAt||timestamp,updatedAt:raw.updatedAt||timestamp});
            ids.add(id);
        }
        if(added.length)replace('products',[...existing,...added]);
        db.prepare("INSERT INTO settings VALUES('expanded-product-catalog-v1',?)").run(JSON.stringify({added:added.map(p=>p.id)}));
    });
    // Add local catalog artwork and consolidate legacy categories on existing installations.
    // Custom admin-uploaded artwork is preserved; only missing/placeholder images are replaced.
    if(!db.prepare("SELECT 1 FROM settings WHERE id='catalog-media-v2'").get()) transaction(()=>{
        const seed=fs.existsSync(seedFile)?JSON.parse(fs.readFileSync(seedFile,'utf8').replace(/^\uFEFF/,'')):{};
        const shipped=new Map((seed.products||[]).filter(p=>p.id!=null).map(p=>[String(p.id),p]));
        const legacyCategories=new Set(['هدست گیمینگ','مانیتور گیمینگ','کنترلر گیمینگ','وبکم','حافظه گیمینگ','خنک‌کننده','گیمینگ','اسپیکر گیمینگ','موسپد گیمینگ','هاب و تجهیزات USB','لوازم ستاپ']);
        const products=list('products').map(product=>{
            const current={...product},source=shipped.get(String(product.id));
            if(!source)return current;
            if(!current.image || current.image==='img/product-placeholder.svg')current.image=source.image||'img/product-placeholder.svg';
            if(legacyCategories.has(current.category))current.category=source.category;
            if(!current.shortDescription)current.shortDescription=source.shortDescription||source.description||'';
            return current;
        });
        replace('products',products);
        db.prepare("INSERT INTO settings VALUES('catalog-media-v2',?)").run(JSON.stringify({updatedAt:new Date().toISOString()}));
    });
    if(!db.prepare("SELECT 1 FROM settings WHERE id='catalog-taxonomy-v3'").get()) transaction(()=>{
        const seed=fs.existsSync(seedFile)?JSON.parse(fs.readFileSync(seedFile,'utf8').replace(/^\uFEFF/,'')):{};
        const shipped=new Map((seed.products||[]).filter(p=>p.id!=null).map(p=>[String(p.id),p]));
        const products=list('products').map(product=>{
            const source=shipped.get(String(product.id));
            return source ? {...product,category:source.category,image:product.image||source.image||'img/product-placeholder.svg'} : product;
        });
        replace('products',products);
        db.prepare("INSERT INTO settings VALUES('catalog-taxonomy-v3',?)").run(JSON.stringify({updatedAt:new Date().toISOString()}));
    });
    return {db,list,read,write,replace,transaction,close:()=>db.close()};
}
module.exports={openDatabase,scrub};
