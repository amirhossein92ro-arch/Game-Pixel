'use strict';
const bcrypt = require('bcrypt');
let running = 0;
async function work(fn) {
    if (running >= 8) throw Object.assign(new Error('Too many credential requests. Try again shortly.'), {status:429, retryAfter:1});
    running++;
    try { return await fn(); } finally { running--; }
}
// Bound queued CPU work across login, registration, recovery and admin password changes.
module.exports = {
    hash:(...args) => work(() => bcrypt.hash(...args)),
    compare:(...args) => work(() => bcrypt.compare(...args)),
    hashSync:(...args) => bcrypt.hashSync(...args),
    compareSync:(...args) => bcrypt.compareSync(...args)
};
