'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const validation = require('../../lib/storage-validation.cjs');
const migrations = require('../../lib/storage-migrations.cjs');
const tables = ['products','users','orders','discounts','messages','posts','comments'];
const {scrub}=require('../redact.cjs');
function openDatabase(filename, seedFile) {
    let seed;
    try { seed=seedFile&&fs.existsSync(seedFile)?JSON.parse(fs.readFileSync(seedFile,'utf8').replace(/^\uFEFF/,'')):{}; validation.state(seed); }
    catch { migrations.event('corrupt-seed'); throw migrations.corrupt(); }
    const loadSeed=()=>structuredClone(seed);
    if (filename !== ':memory:') {
        filename=path.resolve(filename); require('./format.cjs').assertRuntimeFormat(filename); migrations.preflight(filename);
        fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
        if(!fs.existsSync(filename)){const fd=fs.openSync(filename,'wx',0o600);fs.closeSync(fd);}
        fs.chmodSync(filename,0o600);
    }
    const db = new DatabaseSync(filename);
    db.function('web2_lower',{deterministic:true},value=>String(value??'').toLowerCase());
    let initialized=false,savepoint=0;
    const snapshots=new WeakMap(),versioned=new Set(['products','orders','discounts']);
    try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=ON; PRAGMA temp_store=MEMORY; BEGIN IMMEDIATE;');
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
    db.exec(`CREATE TABLE IF NOT EXISTS account_factors (
      user_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      secret_cipher TEXT, pending_cipher TEXT, pending_until INTEGER,
      recovery_hashes TEXT NOT NULL DEFAULT '[]', last_step INTEGER NOT NULL DEFAULT -1);
      CREATE TABLE IF NOT EXISTS pending_auth (
      token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      csrf_hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,password_check TEXT NOT NULL,principal_version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_login_devices (
      user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      device TEXT NOT NULL, last_ip TEXT, last_seen TEXT NOT NULL,
      PRIMARY KEY(user_id,device));`);
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
    if (!db.prepare('PRAGMA table_info(admin_accounts)').all().some(c => c.name === 'email')) db.exec('ALTER TABLE admin_accounts ADD COLUMN email TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS admin_accounts_email ON admin_accounts(email) WHERE email IS NOT NULL');
    if (!db.prepare('PRAGMA table_info(session_details)').all().some(c => c.name === 'last_activity_at')) db.exec('ALTER TABLE session_details ADD COLUMN last_activity_at TEXT');
    if (!db.prepare('PRAGMA table_info(session_details)').all().some(c => c.name === 'ip')) db.exec('ALTER TABLE session_details ADD COLUMN ip TEXT');
    if (!db.prepare('PRAGMA table_info(session_details)').all().some(c => c.name === 'public_id')) db.exec('ALTER TABLE session_details ADD COLUMN public_id TEXT');
    for(const row of db.prepare('SELECT session_hash FROM session_details WHERE public_id IS NULL').all())db.prepare('UPDATE session_details SET public_id=? WHERE session_hash=?').run(crypto.randomUUID(),row.session_hash);
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS session_details_public_id ON session_details(public_id)');
    if (!db.prepare('PRAGMA table_info(admin_accounts)').all().some(c => c.name === 'session_version')) db.exec('ALTER TABLE admin_accounts ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0');
    if (!db.prepare('PRAGMA table_info(sessions)').all().some(c => c.name === 'principal_version')) {
        db.exec(`ALTER TABLE sessions ADD COLUMN principal_version INTEGER NOT NULL DEFAULT 0;
          UPDATE sessions SET principal_version=COALESCE((SELECT session_version FROM admin_accounts WHERE id=sessions.principal),0) WHERE kind='admin';
          UPDATE sessions SET principal_version=COALESCE((SELECT CAST(json_extract(payload,'$.sessionVersion') AS INTEGER) FROM accounts WHERE id=sessions.principal),0) WHERE kind='user';`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS sessions_principal ON sessions(principal,kind,expires);
      CREATE INDEX IF NOT EXISTS reset_user ON password_reset_challenges(user_id);
      CREATE TABLE IF NOT EXISTS login_failures (key TEXT PRIMARY KEY,failures INTEGER NOT NULL,window_ends INTEGER NOT NULL,locked_until INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS login_failure_expiry ON login_failures(window_ends,locked_until);`);
    db.exec(`CREATE TABLE IF NOT EXISTS request_budgets (
      key TEXT PRIMARY KEY,hits INTEGER NOT NULL CHECK(hits>0),resets_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS request_budget_expiry ON request_budgets(resets_at);
      CREATE INDEX IF NOT EXISTS idempotency_fingerprint ON idempotency(user_id,request_hash);
      CREATE TRIGGER IF NOT EXISTS preserve_last_super_admin_delete BEFORE DELETE ON admin_accounts
      WHEN OLD.role='SUPER_ADMIN' AND OLD.active=1 AND
        (SELECT count(*) FROM admin_accounts WHERE role='SUPER_ADMIN' AND active=1)<=1
      BEGIN SELECT RAISE(ABORT,'The final active super administrator must be preserved.'); END;
      CREATE TRIGGER IF NOT EXISTS preserve_last_super_admin_update BEFORE UPDATE OF role,active ON admin_accounts
      WHEN OLD.role='SUPER_ADMIN' AND OLD.active=1 AND (NEW.role<>'SUPER_ADMIN' OR NEW.active<>1) AND
        (SELECT count(*) FROM admin_accounts WHERE role='SUPER_ADMIN' AND active=1)<=1
      BEGIN SELECT RAISE(ABORT,'The final active super administrator must be preserved.'); END;`);
    db.exec(`CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at TEXT NOT NULL,
      product_id TEXT, category TEXT, result_count INTEGER, failure_code TEXT,
      CHECK(length(type)<=40), CHECK(result_count IS NULL OR result_count BETWEEN 0 AND 1000000)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS analytics_events_date ON analytics_events(created_at,type);
    CREATE INDEX IF NOT EXISTS analytics_events_product ON analytics_events(product_id,created_at) WHERE product_id IS NOT NULL;`);
    function transaction(fn) {
        // No await or external I/O may escape a synchronous SQLite transaction.
        if(typeof fn!=='function'||fn.constructor.name==='AsyncFunction')throw Object.assign(new Error('Storage transactions must be synchronous.'),{code:'STORAGE_ASYNC_TRANSACTION'});
        const nested=db.isTransaction,name='store_'+(++savepoint);
        let begun=false;
        try {
            db.exec(nested?`SAVEPOINT ${name}`:'BEGIN IMMEDIATE');begun=true;
            const result=fn();
            if(result&&typeof result.then==='function'){result.catch?.(()=>{});throw Object.assign(new Error('Storage transactions must be synchronous.'),{code:'STORAGE_ASYNC_TRANSACTION'});}
            db.exec(nested?`RELEASE ${name}`:'COMMIT');return result;
        } catch(error) {
            if(begun&&db.isTransaction){try{db.exec(nested?`ROLLBACK TO ${name}; RELEASE ${name}`:'ROLLBACK');}catch{migrations.event('rollback-failure');}}
            if([5,6].includes(error.errcode)||/database (?:is locked|table is locked)/i.test(error.message||''))throw Object.assign(new Error('Storage is busy; retry shortly.'),{status:503,statusCode:503,retryAfter:1,code:'STORAGE_BUSY'});
            if(error.code==='STORAGE_VALIDATION'||error.message==='STORAGE_VALIDATION'){migrations.event('validation-failure');throw validation.fail();}
            if(!error.status&&!error.statusCode)migrations.event('write-failure');
            throw error;
        }
    }
    const decode=(table,payload)=>{const value=scrub(JSON.parse(payload));return versioned.has(table)?{...value,revision:value.revision??0}:value;};
    const getStatements=new Map();
    const list = table => {if(!tables.includes(table))throw Error('Unknown collection');return db.prepare(`SELECT payload FROM ${table} ORDER BY rowid`).all().map(r=>decode(table,r.payload));};
    function get(table,id){if(!tables.includes(table))throw Error('Unknown collection');let statement=getStatements.get(table);if(!statement){statement=db.prepare(`SELECT payload FROM ${table} WHERE id=?`);getStatements.set(table,statement);}const r=statement.get(String(id));return r?decode(table,r.payload):null;}
    function assertRevision(current,expected,required=false){
        if(expected===undefined&&!required)return;
        if(!Number.isSafeInteger(expected)||expected<0||expected!==(current?.revision??0)){
            migrations.event('stale-revision-conflict');throw Object.assign(new Error('این رکورد تغییر کرده است؛ اطلاعات را تازه کنید و دوباره تلاش کنید.'),{status:409,statusCode:409,code:'STORAGE_CONFLICT'});
        }
    }
    function saveRow(table,raw,{insert=false}={}){
        validation.row(table,raw);
        const value=scrub(raw);value.id=table==='products'?String(value.id):value.id;
        if(table==='orders')for(const item of value.items||[])if(item.id!=null)item.id=String(item.id);
        const old=get(table,value.id);
        if(insert&&old)throw Object.assign(new Error('Record already exists.'),{status:409,statusCode:409});
        const comparable=v=>{if(!v)return null;const {revision,...rest}=v;return JSON.stringify(rest);};
        if(comparable(old)===comparable(value))return old;
        if(versioned.has(table))value.revision=(old?.revision??0)+1;
        validation.row(table,value);
        db.prepare(`INSERT INTO ${table}(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`).run(String(value.id),JSON.stringify(value));
        if(table==='orders'){
            db.prepare('DELETE FROM order_items WHERE order_id=?').run(String(value.id));
            for(const item of value.items||[])db.prepare('INSERT INTO order_items VALUES(?,?,?,?)').run(String(value.id),String(item.id??item.product),item.quantity,item.price??item.unitPrice);
        }
        if(initialized)db.exec('UPDATE storage_meta SET revision=revision+1 WHERE id=1');
        return value;
    }
    function put(table,value,options){return transaction(()=>saveRow(table,value,options));}
    function mutate(table,id,fn,{expectedRevision,requireRevision=false}={}){
        return transaction(()=>{const current=get(table,id);if(!current)throw Object.assign(new Error('Record not found.'),{status:404,statusCode:404});assertRevision(current,expectedRevision,requireRevision);const next=fn(structuredClone(current));if(!next||String(next.id)!==String(id))throw validation.fail();return saveRow(table,next);});
    }
    function nextId(table){
        if(!tables.includes(table))throw Error('Unknown collection');
        return transaction(()=>{const highest=list(table).reduce((n,r)=>/^[1-9][0-9]*$/.test(String(r.id))&&Number.isSafeInteger(Number(r.id))?Math.max(n,Number(r.id)):n,0),key=table+'-sequence';
            const saved=Number(db.prepare('SELECT payload FROM settings WHERE id=?').get(key)?.payload||0),next=Math.max(highest,saved)+1;
            if(!Number.isSafeInteger(next))throw validation.fail();db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(key,String(next));return String(next);});
    }
    function remove(table,id,{expectedRevision,requireRevision=false}={}){
        return transaction(()=>{const current=get(table,id);if(!current||current.deletedAt)throw Object.assign(new Error('Record not found.'),{status:404,statusCode:404});assertRevision(current,expectedRevision,requireRevision);
            if(table==='products'&&db.prepare('SELECT 1 FROM order_items WHERE product_id=? LIMIT 1').get(String(id)))return saveRow(table,{...current,status:'inactive',deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
            if(!tables.includes(table))throw Error('Unknown collection');db.prepare(`DELETE FROM ${table} WHERE id=?`).run(String(id));if(initialized)db.exec('UPDATE storage_meta SET revision=revision+1 WHERE id=1');return current;});
    }
    function revokeSessions(id) {
        return transaction(() => {
            const result = db.prepare('DELETE FROM sessions WHERE principal=?').run(id);
            db.prepare('DELETE FROM password_reset_challenges WHERE user_id=?').run(id);
            db.prepare('UPDATE admin_accounts SET session_version=session_version+1 WHERE id=?').run(id);
            const account = db.prepare('SELECT payload FROM accounts WHERE id=?').get(id);
            if (account) {
                const payload = JSON.parse(account.payload);
                payload.sessionVersion = (Number(payload.sessionVersion) || 0) + 1;
                db.prepare('UPDATE accounts SET payload=? WHERE id=?').run(JSON.stringify(payload),id);
                db.prepare("UPDATE users SET payload=json_set(payload,'$.sessionVersion',?) WHERE id=?").run(payload.sessionVersion,id);
            }
            return Number(result.changes);
        });
    }
    function securityEvent(action, targetId, details = {}) {
        db.prepare('INSERT INTO audit_logs(actor_id,actor_username,actor_role,action,target_type,target_id,details,created_at) VALUES(?,?,?,?,?,?,?,?)')
            .run('authentication','Authentication','SYSTEM',action,'account',String(targetId || ''),JSON.stringify(scrub(details)),new Date().toISOString());
    }
    function replace(table,rows) {
        validation.rows(table,rows);
        return transaction(()=>{
            const keep=new Set(rows.map(row=>String(row.id)));
            for(const old of db.prepare(`SELECT id FROM ${table}`).all())if(!keep.has(old.id)){db.prepare(`DELETE FROM ${table} WHERE id=?`).run(old.id);if(initialized)db.exec('UPDATE storage_meta SET revision=revision+1 WHERE id=1');}
            for(const raw of rows)saveRow(table,raw);
        });
    }
    function read() {
        return transaction(()=>{
        const settings=db.prepare("SELECT payload FROM settings WHERE id='legacy'").get();
        const data=settings?JSON.parse(settings.payload):{};
        for(const table of tables)data[table]=list(table);
        data.schemaVersion=migrations.schemaVersion;
        if(initialized)snapshots.set(data,db.prepare('SELECT revision FROM storage_meta WHERE id=1').get().revision);
        return data;});
    }
    function write(data,{importing=false}={}) {validation.state(data);return transaction(()=>{
        if(initialized&&!importing&&snapshots.get(data)!==db.prepare('SELECT revision FROM storage_meta WHERE id=1').get().revision)throw Object.assign(new Error('Stale storage snapshot.'),{status:409,statusCode:409});
        for(const table of tables) if(Object.hasOwn(data,table)) replace(table,data[table]);
        const settings=Object.fromEntries(Object.entries(data).filter(([key])=>!tables.includes(key)&&key!=='admin'));
        db.prepare("INSERT OR REPLACE INTO settings VALUES('legacy',?)").run(JSON.stringify(scrub(settings)));
        if(initialized)db.exec('UPDATE storage_meta SET revision=revision+1 WHERE id=1');
    });}
    function update(fn){return transaction(()=>{const data=read();const result=fn(data);if(result&&typeof result.then==='function')throw Error('Storage updates must be synchronous.');write(data);return result;});}
    if(!db.prepare("SELECT 1 FROM settings WHERE id='migration-v1'").get()) transaction(()=>{
        const seed=loadSeed();
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
        const seed=loadSeed();
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
        const seed=loadSeed();
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
        const seed=loadSeed();
        const shipped=new Map((seed.products||[]).filter(p=>p.id!=null).map(p=>[String(p.id),p]));
        const products=list('products').map(product=>{
            const source=shipped.get(String(product.id));
            return source ? {...product,...(source.category?{category:source.category}:{}),image:product.image||source.image||'img/product-placeholder.svg'} : product;
        });
        replace('products',products);
        db.prepare("INSERT INTO settings VALUES('catalog-taxonomy-v3',?)").run(JSON.stringify({updatedAt:new Date().toISOString()}));
    });
    db.exec(`CREATE INDEX IF NOT EXISTS orders_owner_date ON orders(json_extract(payload,'$.userId'),json_extract(payload,'$.createdAt'));
      CREATE INDEX IF NOT EXISTS products_visibility ON products(json_extract(payload,'$.status'),json_extract(payload,'$.deletedAt'));
      CREATE INDEX IF NOT EXISTS audit_actor_recent ON audit_logs(actor_id,id DESC);
      CREATE INDEX IF NOT EXISTS audit_target_recent ON audit_logs(target_type,target_id,id DESC);
      CREATE INDEX IF NOT EXISTS session_principal_kind ON sessions(principal,kind,expires);
      CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
      CREATE INDEX IF NOT EXISTS ticket_message_parent ON ticket_messages(ticket_id);
    `);
    migrations.migrate(db);migrations.validateDatabase(db);db.exec('COMMIT');initialized=true;
    if(filename!==':memory:')for(const file of [filename,filename+'-wal',filename+'-shm'])if(fs.existsSync(file))fs.chmodSync(file,0o600);
    migrations.event('migration-success');
    function cleanup(){return transaction(()=>db.prepare('DELETE FROM idempotency WHERE expires_at<=?').run(Date.now()));}
    const store={driver:'sqlite',db,list,get,put,mutate,remove,nextId,assertRevision,read,write,update,replace,transaction,revokeSessions,securityEvent,cleanup,schemaVersion:migrations.schemaVersion,close:()=>db.close()};
    store.page=(table,query,options)=>require('./collections.cjs').collectionPage(store,table,query,options);
    store.count=table=>{if(!tables.includes(table))throw validation.fail();return db.prepare(`SELECT count(*) n FROM ${table}`).get().n;};
    const epochRevision=db.prepare('SELECT revision FROM storage_meta WHERE id=1'),epochVersion=db.prepare('PRAGMA data_version');
    store.epoch=()=>epochRevision.get().revision+':'+epochVersion.get().data_version;
    store.ready=()=>!!db.prepare('SELECT 1 FROM settings LIMIT 1').get();
    const accessors=new Map(),domains=new Set(["runtime","account","account-factors","admin-security","analytics","auth-recovery","commerce","login-protection","management","rate-limits","site","user-management"]);
    store.access=domain=>{if(!domains.has(domain))throw validation.fail();if(!accessors.has(domain))accessors.set(domain,require('./'+domain+'.cjs')(db));return accessors.get(domain);};
    store.search=require('./search.cjs')(store);
    store.repositories=Object.freeze({...require('../repositories.cjs').createRepositories(store),...require('./relational-repositories.cjs').relationalRepositories(store)});
    return store;
    } catch(error) {
        if(db.isTransaction)db.exec('ROLLBACK');db.close();migrations.event('startup-validation-or-migration-failure');throw error;
    }
}
module.exports={openDatabase,scrub};
