'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {safeCall} = require('../errors.cjs');
const definitions = Object.freeze([{version:1,name:'normalized',file:path.join(__dirname,'../migrations/sqlite/001_normalized.sql')},{version:2,name:'payment-lifecycle',file:path.join(__dirname,'../migrations/sqlite/002_payment_lifecycle.sql')}]);
function applyMigrations(db) {
    return safeCall(() => {
        if(db.isTransaction)throw Object.assign(new Error('Schema migration requires an idle connection.'),{code:'SCHEMA_TRANSACTION_ACTIVE'});
        const foreignKeys=db.prepare('PRAGMA foreign_keys').get().foreign_keys;
        if(foreignKeys)db.exec('PRAGMA foreign_keys=OFF');
        try {
            db.exec('BEGIN IMMEDIATE');
            db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY,name TEXT NOT NULL,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)');
            if(db.prepare('SELECT version FROM schema_migrations').all().some(row=>!definitions.some(item=>item.version===row.version)))throw Object.assign(new Error('Unsupported schema version.'),{code:'SCHEMA_VERSION_UNSUPPORTED'});
            for (const migration of definitions) {
                const sql = fs.readFileSync(migration.file,'utf8'), checksum = crypto.createHash('sha256').update(sql).digest('hex');
                const applied = db.prepare('SELECT name,checksum FROM schema_migrations WHERE version=?').get(migration.version);
                if (applied && (applied.checksum !== checksum || applied.name !== migration.name)) throw Object.assign(new Error('Migration checksum mismatch.'), {code:'MIGRATION_CHECKSUM'});
                if (applied) continue;
                db.exec(sql);
                db.prepare('INSERT INTO schema_migrations VALUES(?,?,?,?)').run(migration.version,migration.name,checksum,new Date().toISOString());
            }
            if(db.prepare('PRAGMA foreign_key_check').all().length)throw Object.assign(new Error('Migration foreign key check failed.'),{code:'MIGRATION_FOREIGN_KEY'});
            db.exec('COMMIT');
        } catch (error) { if(db.isTransaction)db.exec('ROLLBACK'); throw error; }
        finally {if(foreignKeys)db.exec('PRAGMA foreign_keys=ON');}
    });
}
module.exports = {applyMigrations, definitions};
