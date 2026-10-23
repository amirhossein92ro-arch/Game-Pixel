'use strict';
const crypto = require('node:crypto');

// Principal budgets live in SQLite so switching IPs or restarting cannot reset them.
function persistentLimit(store, {scope, limit, windowMs, maxEntries = 10000}) {
    return principal => store.transaction(() => {
        const now = Date.now();
        const key = crypto.createHash('sha256').update(scope + ':' + String(principal)).digest('hex');
        store.access('rate-limits').deleteRequestBudgetsByResetsAt(now);
        if (!store.access('rate-limits').findRequestBudgetsByKey(key)
            && store.access('rate-limits').countRequestBudgets().n >= maxEntries) {
            throw Object.assign(Error('Too many requests. Try again later.'), {status:429,retryAfter:Math.ceil(windowMs/1000)});
        }
        const row = store.access('rate-limits').findRequestBudgets(key,now+windowMs);
        if (row.hits > limit) throw Object.assign(Error('Too many requests. Try again later.'),
            {status:429,retryAfter:Math.max(1,Math.ceil((row.resets_at-now)/1000))});
    });
}
module.exports = {persistentLimit};
