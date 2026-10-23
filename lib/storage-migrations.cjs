'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const validation = require('./storage-validation.cjs');
const {publishFile} = require('./atomic-file.cjs');
const schemaVersion = 16;
const markers = ['migration-v1','product-string-ids-v1','expanded-product-catalog-v1','catalog-media-v2','catalog-taxonomy-v3'];
function event(name) { require('./operational-log.cjs').write(name,{level:name.includes('failure')||name.includes('corrupt')?'error':'info',category:'storage'}); }
function corrupt(cause) { return Object.assign(new Error('Storage validation failed. Original data is preserved. Stop writers, inspect private storage, and restore a verified backup using scripts/restore.cjs; see deploy/operations.md.',{cause}),{code:'STORAGE_CORRUPT'}); }
function validateDatabase(db) {
    if (db.prepare('PRAGMA quick_check').all().some(r => Object.values(r)[0] !== 'ok') || db.prepare('PRAGMA foreign_key_check').all().length) throw corrupt();
    const present = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
    for (const table of validation.collections) if (present.has(table)) {
        const rows = db.prepare(`SELECT id,payload FROM ${table}`).all();
        const values = rows.map(r => { const value = JSON.parse(r.payload); if (String(value?.id) !== r.id) throw corrupt(); return value; });
        validation.rows(table,values);
    }
    if (present.has('settings')) for (const r of db.prepare('SELECT id,payload FROM settings').all()) {
        if(r.id==='bootstrap-password-config'&&/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(r.payload))continue;
        validation.jsonValue(JSON.parse(r.payload));
    }
    if (present.has('accounts')) {
        const emails = new Set(), phones = new Set();
        for (const r of db.prepare('SELECT id,email,phone,payload FROM accounts').all()) {
            const value = JSON.parse(r.payload); validation.row('users',value);
            const email = r.email.trim().toLowerCase(), phone = r.phone.trim();
            if (String(value.id) !== r.id || email !== r.email || phone !== r.phone || emails.has(email) || phones.has(phone)) throw corrupt();
            emails.add(email); phones.add(phone);
        }
    }
    return present;
}
function preflight(filename) {
    if (filename === ':memory:' || !fs.existsSync(filename)) return;
    if (!fs.lstatSync(filename).isFile() || fs.statSync(filename).size === 0) {event('corrupt-data');throw corrupt();}
    let db;
    try {
        db = new DatabaseSync(filename,{readOnly:true});
        const present = validateDatabase(db);
        const version = db.prepare('PRAGMA user_version').get().user_version;
        if (version > schemaVersion) throw corrupt();
        const pending = version < schemaVersion || markers.some(id => !present.has('settings') || !db.prepare('SELECT 1 FROM settings WHERE id=?').get(id));
        if (pending) {
            const target = path.join(path.dirname(filename),'.migration-v16-'+crypto.randomUUID()+'.sqlite'), staged = target+'.partial';
            let owned = false;
            try {
                const fd = fs.openSync(staged,'wx',0o600); fs.closeSync(fd); owned = true;
                db.prepare('VACUUM INTO ?').run(staged);
                const snapshot = new DatabaseSync(staged,{readOnly:true});
                try { validateDatabase(snapshot); } finally { snapshot.close(); }
                publishFile(staged,target); owned = false; event('migration-backup-created');
            } finally { if (owned) fs.unlinkSync(staged); }
        }
    } catch(error) { event('corrupt-data-or-migration-backup-failure'); throw corrupt(error); }
    finally { db?.close(); }
}
function migrate(db) {
    const columns = new Set(db.prepare('PRAGMA table_info(idempotency)').all().map(r=>r.name));
    for (const [name,type] of [['purpose',"TEXT NOT NULL DEFAULT 'checkout'"],['created_at','INTEGER'],['expires_at','INTEGER']]) if (!columns.has(name)) db.exec(`ALTER TABLE idempotency ADD COLUMN ${name} ${type}`);
    const time = Date.now();
    db.prepare('UPDATE idempotency SET created_at=COALESCE(created_at,?),expires_at=COALESCE(expires_at,?+86400000)').run(time,time);
    db.exec(`CREATE INDEX IF NOT EXISTS idempotency_expiry ON idempotency(expires_at);
        CREATE UNIQUE INDEX IF NOT EXISTS discount_unique_code ON discounts(json_extract(payload,'$.code'));
        CREATE UNIQUE INDEX IF NOT EXISTS order_unique_code ON orders(json_extract(payload,'$.code')) WHERE json_extract(payload,'$.code') IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS account_normalized_email ON accounts(lower(trim(email)));
        CREATE TABLE IF NOT EXISTS storage_meta (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
        INSERT OR IGNORE INTO storage_meta VALUES(1,0);`);
    // SQLite constraints protect every connection, including maintenance tools.
    const checks = {
        products: `json_type(NEW.payload,'$.price')='integer' AND json_extract(NEW.payload,'$.price') BETWEEN 1 AND 1000000000000
            AND json_type(NEW.payload,'$.stock')='integer' AND json_extract(NEW.payload,'$.stock') BETWEEN 0 AND 1000000
            AND (json_type(NEW.payload,'$.status') IS NULL OR json_extract(NEW.payload,'$.status') IN ('active','inactive'))`,
        orders: `(json_type(NEW.payload,'$.status') IS NULL OR json_extract(NEW.payload,'$.status') IN ('pending','paid','processing','shipped','delivered','cancelled'))
            AND (json_type(NEW.payload,'$.items') IS NULL OR json_type(NEW.payload,'$.items')='array')
            AND NOT EXISTS (SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.quantity') IS NOT 'integer' OR json_extract(value,'$.quantity')<1
                OR json_type(value,'$.price') IS NOT 'integer' OR json_extract(value,'$.price')<1
                OR (json_type(value,'$.lineTotal') IS NOT NULL AND json_extract(value,'$.lineTotal')<>json_extract(value,'$.quantity')*json_extract(value,'$.price')))
            AND (json_type(NEW.payload,'$.total') IS NULL OR (json_type(NEW.payload,'$.total')='integer' AND json_extract(NEW.payload,'$.total')>=0))`,
        users: `(json_type(NEW.payload,'$.role') IS NULL OR json_extract(NEW.payload,'$.role') IN ('user','admin','USER','ADMIN','SUPER_ADMIN','ORDER_MANAGER','PRODUCT_MANAGER','SUPPORT'))
            AND (json_type(NEW.payload,'$.addresses') IS NULL OR json_type(NEW.payload,'$.addresses')='array')`,
        discounts: `json_type(NEW.payload,'$.uses')='integer' AND json_extract(NEW.payload,'$.uses')>=0
            AND (json_extract(NEW.payload,'$.maxUses') IS NULL OR json_extract(NEW.payload,'$.uses')<=json_extract(NEW.payload,'$.maxUses'))`
    };
    for (const table of validation.collections) for (const operation of ['INSERT','UPDATE']) db.exec(`CREATE TRIGGER IF NOT EXISTS storage_${table}_${operation.toLowerCase()} BEFORE ${operation} ON ${table}
        WHEN NOT COALESCE(json_valid(NEW.payload) AND json_type(NEW.payload)='object' AND CAST(json_extract(NEW.payload,'$.id') AS TEXT)=NEW.id AND length(NEW.id)>0 AND (${checks[table] || '1'}),0)
        BEGIN SELECT RAISE(ABORT,'STORAGE_VALIDATION'); END;`);
    db.exec(`DROP TRIGGER IF EXISTS storage_settings_insert; DROP TRIGGER IF EXISTS storage_settings_update;
        CREATE TRIGGER storage_settings_insert BEFORE INSERT ON settings WHEN NOT json_valid(NEW.payload) AND NOT (NEW.id='bootstrap-password-config' AND length(NEW.payload)=60 AND NEW.payload GLOB '$2[aby]$[0-9][0-9]$*') BEGIN SELECT RAISE(ABORT,'STORAGE_VALIDATION'); END;
        CREATE TRIGGER storage_settings_update BEFORE UPDATE ON settings WHEN NOT json_valid(NEW.payload) AND NOT (NEW.id='bootstrap-password-config' AND length(NEW.payload)=60 AND NEW.payload GLOB '$2[aby]$[0-9][0-9]$*') BEGIN SELECT RAISE(ABORT,'STORAGE_VALIDATION'); END;
        PRAGMA user_version=${schemaVersion};`);
}
module.exports = {schemaVersion, preflight, migrate, validateDatabase, corrupt, event};
