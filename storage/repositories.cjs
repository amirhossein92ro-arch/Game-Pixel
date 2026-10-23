'use strict';
const {safeCall} = require('./errors.cjs');
const validation = require('../lib/storage-validation.cjs');
function createRepositories(store) {
    const repositories = {};
    for (const collection of validation.collections) repositories[collection] = Object.freeze({
        findById:id => store.get(collection, id) ?? undefined,
        findMany:(query = {}) => store.page(collection, query),
        count:() => store.count(collection),
        create:value => safeCall(() => store.put(collection, value, {insert:true})),
        update:(id, change, options = {}) => safeCall(() => store.mutate(collection, id, change, options)),
        delete:(id, options = {}) => safeCall(() => store.remove(collection, id, options)),
        // Referenced products are soft-deleted by the existing adapter, preserving order snapshots.
        softDelete:(id, options = {}) => {if(!['users','products'].includes(collection))throw validation.fail();return safeCall(() => store.mutate(collection, id, row => ({...row,...(collection==='users'?{banned:true}:{status:'inactive'}),deletedAt:new Date().toISOString()}), options));}
    });
    return Object.freeze(repositories);
}
module.exports = {createRepositories};
