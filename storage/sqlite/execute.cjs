'use strict';
const {safeCall} = require('../errors.cjs');
const caches = new WeakMap();
function statement(db, sql) {
    let cache = caches.get(db);
    if (!cache) { cache = new Map(); caches.set(db,cache); }
    let query = cache.get(sql);
    if (!query) {
        if (cache.size >= 64) cache.delete(cache.keys().next().value);
        query = db.prepare(sql); cache.set(sql,query);
    }
    return query;
}
function execute(db, sql, method, values) { return safeCall(() => statement(db,sql)[method](...values)); }
module.exports = {execute, statement};
