'use strict';
const {execute}=require('./execute.cjs');
// Privileged domain operations; values are always bound, never interpolated.
module.exports = db => Object.freeze({
    findAccountsById:(...values)=>execute(db,'SELECT email FROM accounts WHERE id=?','get',values),
    countSessionsByPrincipalAndKindAndAdm:(...values)=>execute(db,"SELECT count(*) n FROM sessions WHERE principal=? AND kind='admin' AND expires>?",'get',values),
    listAuditLogsByActorId:(...values)=>execute(db,'SELECT action,created_at AS createdAt FROM audit_logs WHERE actor_id=? ORDER BY id DESC LIMIT 3','all',values),
    findAdminAccountsByIdAndActive:(...values)=>execute(db,'SELECT * FROM admin_accounts WHERE id=? AND active=1','get',values),
    findSessionsByHashAndKindAndAdm:(...values)=>execute(db,"SELECT 1 FROM sessions WHERE hash=? AND kind='admin' AND expires>?",'get',values),
    findAdminAccountsByUsername:(...values)=>execute(db,'SELECT id FROM admin_accounts WHERE username=?','get',values),
    findAdminAccountsByEmail:(...values)=>execute(db,'SELECT id FROM admin_accounts WHERE email=?','get',values),
    createAdminAccounts:(...values)=>execute(db,'INSERT INTO admin_accounts(id,username,email,password_hash,role,active,totp_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)','run',values),
    findAdminAccountsById:(...values)=>execute(db,'SELECT * FROM admin_accounts WHERE id=?','get',values),
    countAdminAccountsByRoleAndSUPER_ADMAndActive:(...values)=>execute(db,"SELECT count(*) n FROM admin_accounts WHERE role='SUPER_ADMIN' AND active=1",'get',values),
    updateAdminAccountsById:(...values)=>execute(db,'UPDATE admin_accounts SET role=?,active=?,updated_at=? WHERE id=?','run',values),
    findAccountsById2:(...values)=>execute(db,'SELECT payload FROM accounts WHERE id=?','get',values),
    updateAccountsById:(...values)=>execute(db,'UPDATE accounts SET payload=? WHERE id=?','run',values),
    findSessionDetailsBySessionHash:(...values)=>execute(db,'SELECT public_id AS id FROM session_details WHERE session_hash=?','get',values),
    findSessionsByPublicIdAndKindAndAdm:(...values)=>execute(db,"SELECT s.principal,s.hash FROM sessions s JOIN session_details d ON d.session_hash=s.hash WHERE d.public_id=? AND s.kind='admin'",'get',values),
    deleteSessionsByHash:(...values)=>execute(db,'DELETE FROM sessions WHERE hash=?','run',values),
    createSettings:(...values)=>execute(db,"INSERT INTO settings(id,payload) VALUES('site-config',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",'run',values),
    listTickets:(...values)=>execute(db,"SELECT t.id,t.subject title,a.email subtitle FROM tickets t JOIN accounts a ON t.user_id=a.id WHERE instr(web2_lower(t.id),?)>0 OR instr(web2_lower(t.subject),?)>0 OR instr(web2_lower(a.email),?)>0 OR instr(web2_lower(json_extract(a.payload,'$.name')),?)>0 ORDER BY t.rowid LIMIT 8",'all',values)
});
