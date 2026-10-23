'use strict';
const {execute}=require('./execute.cjs');
// Privileged domain operations; values are always bound, never interpolated.
module.exports = db => Object.freeze({
    findUsersById:(...values)=>execute(db,'SELECT payload FROM users WHERE id=?','get',values),
    findSessionsByHashAndKindAndExpires:(...values)=>execute(db,'SELECT * FROM sessions WHERE hash=? AND kind=? AND expires>?','get',values),
    findSessionDetailsBySessionHash:(...values)=>execute(db,'SELECT last_activity_at FROM session_details WHERE session_hash=?','get',values),
    deleteSessionsByHash:(...values)=>execute(db,'DELETE FROM sessions WHERE hash=?','run',values),
    findAccountsById:(...values)=>execute(db,'SELECT * FROM accounts WHERE id=?','get',values),
    updateSessionDetailsBySessionHashAndLastActivityAt:(...values)=>execute(db,'UPDATE session_details SET last_activity_at=? WHERE session_hash=? AND (last_activity_at IS NULL OR last_activity_at<?)','run',values),
    findAdminAccountsByIdAndActive:(...values)=>execute(db,'SELECT * FROM admin_accounts WHERE id=? AND active=1','get',values),
    deleteSessionsByExpires:(...values)=>execute(db,'DELETE FROM sessions WHERE expires<=?','run',values),
    findAdminAccountsById:(...values)=>execute(db,'SELECT session_version,active FROM admin_accounts WHERE id=?','get',values),
    listSessionsByPrincipalAndKind:(...values)=>execute(db,'SELECT hash FROM sessions WHERE principal=? AND kind=? ORDER BY expires DESC LIMIT -1 OFFSET 9','all',values),
    createSessions:(...values)=>execute(db,'INSERT INTO sessions(hash,principal,kind,csrf,expires,principal_version) VALUES(?,?,?,?,?,?)','run',values),
    createSessionDetails:(...values)=>execute(db,'INSERT INTO session_details(session_hash,created_at,device,last_activity_at,ip,public_id) VALUES(?,?,?,?,?,?)','run',values),
    listAccountLoginDevicesByUserId:(...values)=>execute(db,'SELECT device,last_ip FROM account_login_devices WHERE user_id=?','all',values),
    createAccountLoginDevices:(...values)=>execute(db,'INSERT INTO account_login_devices(user_id,device,last_ip,last_seen) VALUES(?,?,?,?) ON CONFLICT(user_id,device) DO UPDATE SET last_ip=excluded.last_ip,last_seen=excluded.last_seen','run',values),
    findSessionDetailsBySessionHash2:(...values)=>execute(db,'SELECT created_at FROM session_details WHERE session_hash=?','get',values),
    findAccountsByEmailAndPhone:(...values)=>execute(db,'SELECT id FROM accounts WHERE email=? OR phone=?','get',values),
    createAccounts:(...values)=>execute(db,'INSERT INTO accounts VALUES(?,?,?,?,?)','run',values),
    findAccountsByEmail:(...values)=>execute(db,'SELECT * FROM accounts WHERE email=?','get',values),
    deletePendingAuthByUserIdAndExpires:(...values)=>execute(db,'DELETE FROM pending_auth WHERE user_id=? OR expires<=?','run',values),
    createPendingAuth:(...values)=>execute(db,'INSERT INTO pending_auth(token_hash,user_id,csrf_hash,expires,created_at,password_check,principal_version) VALUES(?,?,?,?,?,?,?)','run',values),
    findPendingAuthByTokenHashAndExpires:(...values)=>execute(db,'SELECT * FROM pending_auth WHERE token_hash=? AND expires>?','get',values),
    updatePendingAuthByTokenHashAndAttempts:(...values)=>execute(db,'UPDATE pending_auth SET attempts=attempts+1 WHERE token_hash=? AND attempts<5','run',values),
    deletePendingAuthByTokenHash:(...values)=>execute(db,'DELETE FROM pending_auth WHERE token_hash=?','run',values),
    findAccountsById2:(...values)=>execute(db,'SELECT password_hash FROM accounts WHERE id=?','get',values),
    findAccountsByEmailAndPhoneAndId:(...values)=>execute(db,'SELECT id FROM accounts WHERE (email=? OR phone=?) AND id<>?','get',values),
    updateAccountsById:(...values)=>execute(db,'UPDATE accounts SET email=?,phone=? WHERE id=?','run',values),
    findAdminAccountsByActive:(...values)=>execute(db,'SELECT id FROM admin_accounts WHERE active=1','get',values),
    findIdempotencyByUserIdAndKeyAndPurpose:(...values)=>execute(db,"SELECT * FROM idempotency WHERE user_id=? AND key=? AND purpose='checkout' AND expires_at>?",'get',values),
    findIdempotencyByUserIdAndPurposeAndRequestHash:(...values)=>execute(db,`SELECT o.id FROM idempotency i JOIN orders o ON o.id=i.order_id
                WHERE i.user_id=? AND i.purpose='checkout' AND i.request_hash=? AND json_extract(o.payload,'$.createdAt')>?
                AND json_extract(o.payload,'$.status')<>'cancelled' LIMIT 1`,'get',values),
    createIdempotency:(...values)=>execute(db,'INSERT INTO idempotency(user_id,key,order_id,request_hash,purpose,created_at,expires_at) VALUES(?,?,?,?,?,?,?)','run',values)
});
