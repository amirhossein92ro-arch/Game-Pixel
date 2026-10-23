'use strict';
const {execute}=require('./execute.cjs');
// Privileged domain operations; values are always bound, never interpolated.
module.exports = db => Object.freeze({
    findAdminAccountsByIdAndAdm:(...values)=>execute(db,"SELECT * FROM admin_accounts WHERE id='bootstrap-admin'",'get',values),
    findSettingsById:(...values)=>execute(db,"SELECT payload FROM settings WHERE id='bootstrap-password-config'",'get',values),
    createAdminAccounts:(...values)=>execute(db,'INSERT INTO admin_accounts(id,username,password_hash,role,active,totp_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)','run',values),
    updateAdminAccountsById:(...values)=>execute(db,'UPDATE admin_accounts SET username=?,password_hash=?,totp_required=?,updated_at=? WHERE id=?','run',values),
    createSettings:(...values)=>execute(db,"INSERT INTO settings(id,payload) VALUES('bootstrap-password-config',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",'run',values),
    deleteSessionsByKindAndAdmAndNOT:(...values)=>execute(db,"DELETE FROM sessions WHERE kind='admin' AND principal NOT IN (SELECT id FROM admin_accounts)",'run',values),
    findAdminAccountsByUsername:(...values)=>execute(db,'SELECT * FROM admin_accounts WHERE username=?','get',values),
    findAdminAccountsById:(...values)=>execute(db,'SELECT * FROM admin_accounts WHERE id=?','get',values),
    updateAdminAccountsById2:(...values)=>execute(db,'UPDATE admin_accounts SET last_login=? WHERE id=?','run',values),
    findSettingsById2:(...values)=>execute(db,'SELECT payload FROM settings WHERE id=?','get',values),
    createSettings2:(...values)=>execute(db,'INSERT INTO settings(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload','run',values),
});
