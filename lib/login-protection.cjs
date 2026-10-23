'use strict';
const crypto = require('node:crypto');
const windowMs = 15 * 60000;
const fail = retryAfter => Object.assign(new Error('Too many login attempts. Try again later.'), {status:429, retryAfter});

// SQLite makes account lockouts survive restarts and share an atomic failure budget.
function createLoginProtection(store, kind) {
    const {transaction} = store;
    const key = identifier => crypto.createHash('sha256').update(kind + ':' + String(identifier).trim().toLowerCase()).digest('hex');
    function check(identifier) {
        const time = Date.now(), row = store.access('login-protection').findLoginFailuresByKey(key(identifier));
        if (row?.locked_until > time) throw fail(Math.ceil((row.locked_until - time) / 1000));
        store.access('login-protection').deleteLoginFailuresByWindowEndsAndLockedUntil(time, time);
        if (!row && store.access('login-protection').countLoginFailures().n >= 10000) throw fail(900);
    }
    function failed(identifier) {
        transaction(() => {
            const id = key(identifier), time = Date.now();
            const row = store.access('login-protection').findLoginFailuresByKey2(id);
            const count = row && row.window_ends > time ? row.failures + 1 : 1;
            store.access('login-protection').saveFailure(id, count, row && row.window_ends > time ? row.window_ends : time + windowMs, count >= 5 ? time + windowMs : 0);
        });
    }
    return {check, failed, succeeded:identifier => store.access('login-protection').deleteLoginFailuresByKey(key(identifier))};
}
module.exports = {createLoginProtection};
