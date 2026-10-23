'use strict';
const {execute}=require('./execute.cjs');
// Privileged domain operations; values are always bound, never interpolated.
module.exports = db => Object.freeze({
    deleteSessionsByExpires:(...values)=>execute(db,'DELETE FROM sessions WHERE expires<=?','run',values),
    deletePendingAuthByExpires:(...values)=>execute(db,'DELETE FROM pending_auth WHERE expires<=?','run',values),
    updateAccountFactorsByPendingUntil:(...values)=>execute(db,'UPDATE account_factors SET pending_cipher=NULL,pending_until=NULL WHERE pending_until<=?','run',values),
    deletePasswordResetChallengesByExpiresAtAndUsedAt:(...values)=>execute(db,'DELETE FROM password_reset_challenges WHERE expires_at<=? OR used_at IS NOT NULL','run',values),
    deleteLoginFailuresByWindowEndsAndLockedUntil:(...values)=>execute(db,'DELETE FROM login_failures WHERE window_ends<=? AND locked_until<=?','run',values),
    deleteRequestBudgetsByResetsAt:(...values)=>execute(db,'DELETE FROM request_budgets WHERE resets_at<=?','run',values)
});
