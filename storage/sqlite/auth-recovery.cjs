'use strict';
const {execute}=require('./execute.cjs');
// Privileged domain operations; values are always bound, never interpolated.
module.exports = db => Object.freeze({
    findPasswordResetChallengesByPhoneHash:(...values)=>execute(db,'SELECT created_at FROM password_reset_challenges WHERE phone_hash=? ORDER BY created_at DESC LIMIT 1','get',values),
    findAccountsByPhone:(...values)=>execute(db,'SELECT id FROM accounts WHERE phone=?','get',values),
    deletePasswordResetChallengesByExpiresAtAndUsedAt:(...values)=>execute(db,'DELETE FROM password_reset_challenges WHERE expires_at<? OR used_at IS NOT NULL','run',values),
    updatePasswordResetChallengesByPhoneHashAndUsedAt:(...values)=>execute(db,'UPDATE password_reset_challenges SET used_at=? WHERE phone_hash=? AND used_at IS NULL','run',values),
    findPasswordResetChallengesById:(...values)=>execute(db,'SELECT * FROM password_reset_challenges WHERE id=?','get',values),
    updatePasswordResetChallengesByIdAndUsedAtAndVerifiedTokenHash:(...values)=>execute(db,'UPDATE password_reset_challenges SET attempts=attempts+1 WHERE id=? AND used_at IS NULL AND verified_token_hash IS NULL AND expires_at>? AND attempts<5','run',values),
    findAccountsById:(...values)=>execute(db,'SELECT phone,payload FROM accounts WHERE id=?','get',values),
    updatePasswordResetChallengesByIdAndUsedAtAndVerifiedExpiresAt:(...values)=>execute(db,'UPDATE password_reset_challenges SET used_at=? WHERE id=? AND used_at IS NULL AND verified_expires_at>? AND verified_token_hash=?','run',values),
    updateAccountsById:(...values)=>execute(db,'UPDATE accounts SET password_hash=? WHERE id=?','run',values),
    updateAdminAccountsById:(...values)=>execute(db,'UPDATE admin_accounts SET password_hash=?,updated_at=? WHERE id=?','run',values),
    createResetChallenge:(...values)=>execute(db,'INSERT INTO password_reset_challenges(id,user_id,phone_hash,otp_hash,expires_at,attempts,verified_token_hash,verified_expires_at,used_at,created_at) VALUES(?,?,?,?,?,0,NULL,NULL,NULL,?)','run',values),
    verifyResetChallenge:(...values)=>execute(db,'UPDATE password_reset_challenges SET otp_hash=?,attempts=5,verified_token_hash=?,verified_expires_at=? WHERE id=? AND used_at IS NULL AND verified_token_hash IS NULL AND expires_at>? AND attempts<=5','run',values)
});
