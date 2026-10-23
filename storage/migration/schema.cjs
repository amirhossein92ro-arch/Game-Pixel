'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {safeCall} = require('../errors.cjs');
const definitions = Object.freeze([{version:1,name:'normalized',file:path.join(__dirname,'../migrations/sqlite/001_normalized.sql')}]);
function applyMigrations(db) {
    return safeCall(() => {
        db.exec('BEGIN IMMEDIATE');
        try {
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
            db.exec('COMMIT');
        } catch (error) { if(db.isTransaction)db.exec('ROLLBACK'); throw error; }
    });
}
module.exports = {applyMigrations, definitions};
