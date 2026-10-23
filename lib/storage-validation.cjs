'use strict';
const statuses = require('../storage/statuses.cjs');
const collections = ['products','users','orders','discounts','messages','posts','comments'];
const fail = () => Object.assign(new Error('Persistent data failed validation.'), {status:400, statusCode:400, code:'STORAGE_VALIDATION'});
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v, min = 0) => Number.isSafeInteger(v) && v >= min;
function jsonValue(value, seen = new Set()) {
    if (typeof value === 'number' && !Number.isFinite(value) || value === undefined || typeof value === 'function' || typeof value === 'bigint') throw fail();
    if (!value || typeof value !== 'object') return;
    if (seen.has(value) || !Array.isArray(value) && ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw fail();
    seen.add(value); for (const item of Object.values(value)) jsonValue(item, seen); seen.delete(value);
}
function row(table, value) {
    if (!collections.includes(table) || !object(value) || !['string','number'].includes(typeof value.id) || !String(value.id).trim() || String(value.id).length > 200) throw fail();
    jsonValue(value);
    if (value.revision !== undefined && !integer(value.revision)) throw fail();
    if (table === 'products') {
        if (typeof value.name !== 'string' || !value.name.trim() || !integer(value.price,1) || value.price > 1e12 || !integer(value.stock) || value.stock > 1000000
            || value.status !== undefined && !statuses.product.includes(value.status)
            || value.discount !== undefined && (!integer(value.discount) || value.discount > 99)
            || value.features !== undefined && (!Array.isArray(value.features) || value.features.some(v => typeof v !== 'string'))) throw fail();
    }
    if (table === 'users') {
        if (value.role !== undefined && !['user','admin','USER','ADMIN','SUPER_ADMIN','ORDER_MANAGER','PRODUCT_MANAGER','SUPPORT'].includes(value.role)
            || value.banned !== undefined && typeof value.banned !== 'boolean'
            || value.addresses !== undefined && !Array.isArray(value.addresses)) throw fail();
    }
    if (table === 'orders') {
        if (value.status !== undefined && !statuses.order.includes(value.status)
            || value.items !== undefined && !Array.isArray(value.items)) throw fail();
        for (const key of ['subtotal','discount','shippingCost','total']) if (value[key] !== undefined && !integer(value[key])) throw fail();
        const ids = new Set();
        for (const item of value.items || []) {
            const id = String(item.id ?? item.product ?? ''), price = item.price ?? item.unitPrice;
            if (!id || ids.has(id) || !integer(item.quantity,1) || !integer(price,1) || !integer(price*item.quantity,1)
                || item.unitPrice !== undefined && item.unitPrice !== price
                || item.lineTotal !== undefined && item.lineTotal !== price*item.quantity) throw fail();
            ids.add(id);
        }
        if (value.items?.length && value.subtotal !== undefined && value.items.reduce((sum,i) => sum+(i.price??i.unitPrice)*i.quantity,0) !== value.subtotal) throw fail();
        if (['subtotal','discount','shippingCost','total'].every(k => value[k] !== undefined)
            && (value.discount > value.subtotal || value.total !== value.subtotal-value.discount+value.shippingCost)) throw fail();
    }
    if (table === 'discounts') {
        if (typeof value.code !== 'string' || !/^[A-Z0-9_-]{2,50}$/.test(value.code) || !['percent','fixed'].includes(value.type)
            || !integer(value.value,1) || value.type === 'percent' && value.value > 100 || typeof value.active !== 'boolean' || !integer(value.uses)
            || ['maxUses','perUserLimit','maxDiscount'].some(k => value[k] != null && !integer(value[k],1))
            || value.maxUses != null && value.uses > value.maxUses) throw fail();
    }
    return value;
}
function rows(table, values) {
    if (!Array.isArray(values)) throw fail();
    const ids = new Set(), codes = new Set();
    for (const value of values) {
        row(table,value); const id = String(value.id);
        if (ids.has(id) || table === 'discounts' && codes.has(value.code)) throw fail();
        ids.add(id); if (table === 'discounts') codes.add(value.code);
    }
    return values;
}
function state(value) {
    if (!object(value)) throw fail(); jsonValue(value);
    for (const table of collections) if (Object.hasOwn(value,table)) rows(table,value[table]);
    return value;
}
module.exports = {collections, row, rows, state, jsonValue, fail};
