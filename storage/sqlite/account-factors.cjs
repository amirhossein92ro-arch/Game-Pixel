'use strict';
const {execute}=require('./execute.cjs');
// Privileged domain operations; values are always bound, never interpolated.
module.exports = db => Object.freeze({
    findAccountFactorsBySecretCipher:(...values)=>execute(db,'SELECT 1 FROM account_factors WHERE secret_cipher IS NOT NULL LIMIT 1','get',values),
    findAccountFactorsByUserId:(...values)=>execute(db,'SELECT * FROM account_factors WHERE user_id=?','get',values),
    findAccountsById:(...values)=>execute(db,'SELECT password_hash FROM accounts WHERE id=?','get',values),
    updateAccountFactorsByUserIdAndLastStep:(...values)=>execute(db,'UPDATE account_factors SET last_step=? WHERE user_id=? AND last_step<?','run',values),
    updateAccountFactorsByUserIdAndRecoveryHashes:(...values)=>execute(db,'UPDATE account_factors SET recovery_hashes=? WHERE user_id=? AND recovery_hashes=?','run',values),
    createAccountFactors:(...values)=>execute(db,'INSERT INTO account_factors(user_id,pending_cipher,pending_until) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET pending_cipher=excluded.pending_cipher,pending_until=excluded.pending_until','run',values),
    updateAccountFactorsByUserIdAndSecretCipherAndPendingUntil:(...values)=>execute(db,'UPDATE account_factors SET secret_cipher=pending_cipher,pending_cipher=NULL,pending_until=NULL,recovery_hashes=?,last_step=? WHERE user_id=? AND secret_cipher IS NULL AND pending_until>?','run',values),
    deleteAccountFactorsByUserId:(...values)=>execute(db,'DELETE FROM account_factors WHERE user_id=?','run',values),
    updateAccountFactorsByUserId:(...values)=>execute(db,'UPDATE account_factors SET recovery_hashes=? WHERE user_id=?','run',values)
});
