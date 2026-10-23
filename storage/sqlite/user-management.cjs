'use strict';
const {execute}=require('./execute.cjs');
// Privileged domain operations; values are always bound, never interpolated.
module.exports = db => Object.freeze({
    findAccountsById:(...values)=>execute(db,'SELECT * FROM accounts WHERE id=?','get',values),
    findAdminAccountsById:(...values)=>execute(db,'SELECT * FROM admin_accounts WHERE id=?','get',values),
    countOrders:(...values)=>execute(db,"SELECT count(*) n,coalesce(sum(CASE WHEN json_extract(payload,'$.paymentStatus')='paid' THEN json_extract(payload,'$.total') ELSE 0 END),0) total FROM orders WHERE json_extract(payload,'$.userId')=?",'get',values),
    findSessionsByHashAndKindAndAdm:(...values)=>execute(db,"SELECT hash FROM sessions WHERE hash=? AND kind='admin' AND expires>?",'get',values),
    countAdminAccountsByRoleAndSUPER_ADMAndActive:(...values)=>execute(db,"SELECT count(*) n FROM admin_accounts WHERE role='SUPER_ADMIN' AND active=1",'get',values),
    updateAccountsById:(...values)=>execute(db,'UPDATE accounts SET email=?,phone=?,payload=? WHERE id=?','run',values),
    findAccountsByEmailAndPhoneAndId:(...values)=>execute(db,'SELECT id FROM accounts WHERE (email=? OR phone=?) AND id<>?','get',values),
    findAdminAccountsByUsernameAndId:(...values)=>execute(db,'SELECT id FROM admin_accounts WHERE username=? AND id<>?','get',values),
    updateAdminAccountsById:(...values)=>execute(db,'UPDATE admin_accounts SET username=?,updated_at=? WHERE id=?','run',values),
    findAdminAccountsByEmailAndId:(...values)=>execute(db,'SELECT id FROM admin_accounts WHERE email=? AND id<>?','get',values),
    updateAdminAccountsById2:(...values)=>execute(db,'UPDATE admin_accounts SET username=?,email=?,updated_at=? WHERE id=?','run',values),
    deleteAdminAccountsById:(...values)=>execute(db,'DELETE FROM admin_accounts WHERE id=?','run',values),
    updateAdminAccountsById3:(...values)=>execute(db,'UPDATE admin_accounts SET role=?,updated_at=? WHERE id=?','run',values),
    findAdminAccountsByUsername:(...values)=>execute(db,'SELECT id FROM admin_accounts WHERE username=?','get',values),
    createAdminAccounts:(...values)=>execute(db,'INSERT INTO admin_accounts(id,username,password_hash,role,active,totp_required,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)','run',values),
    updateAdminAccountsById4:(...values)=>execute(db,'UPDATE admin_accounts SET active=?,updated_at=? WHERE id=?','run',values),
    updateAccountsById2:(...values)=>execute(db,'UPDATE accounts SET password_hash=? WHERE id=?','run',values),
    updateAdminAccountsById5:(...values)=>execute(db,'UPDATE admin_accounts SET password_hash=?,updated_at=? WHERE id=?','run',values),
    deleteTicketsByUserId:(...values)=>execute(db,'DELETE FROM tickets WHERE user_id=?','run',values),
    deleteAccountsById:(...values)=>execute(db,'DELETE FROM accounts WHERE id=?','run',values)
});
