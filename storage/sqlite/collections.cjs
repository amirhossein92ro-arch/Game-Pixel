'use strict';
const {scrub} = require('../redact.cjs');
const tables = new Set(['products','orders','users','messages','posts','comments','discounts']);
const collator = new Intl.Collator('fa');
const versioned=new Set(['products','orders','discounts']);
const decode=(table,payload)=>{const value=scrub(JSON.parse(payload));if(versioned.has(table)&&value.revision===undefined)value.revision=0;return value;};
const statementCaches=new WeakMap();
function prepare(store,sql){let cache=statementCaches.get(store);if(!cache){cache=new Map();statementCaches.set(store,cache);}if(cache.has(sql))return cache.get(sql);if(cache.size>=64)cache.delete(cache.keys().next().value);const statement=store.db.prepare(sql);cache.set(sql,statement);return statement;}
function pageQuery(query = {}, defaultSize = 20) {
    const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? defaultSize);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw Object.assign(Error('صفحه نامعتبر است.'),{status:400});
    return {page,pageSize,offset:(page-1)*pageSize};
}
function respond(req,res,{items,total,page,pageSize}) {
    res.set('X-Total-Count',String(total));
    if (!Object.keys(req.query).length) {
        if (total > pageSize) res.set('Link',`<${req.baseUrl}${req.path}?page=2&pageSize=${pageSize}>; rel="next"`);
        return res.json(items);
    }
    return res.json({items,total,page,pageSize,pages:Math.ceil(total/pageSize)});
}
// SQL and identifiers come only from fixed application code. Values use bindings.
// Decode only the requested page; SQLite remains the authoritative source.
function collectionPage(store,table,query={}, {where='1',args=[],order='rowid',nameSort=false,projection='payload',defaultSize=20}={}) {
    if (!tables.has(table)) throw Error('Unknown collection');
    const {page,pageSize,offset}=pageQuery(query,defaultSize);
    // Small compatibility responses can determine their total from one bounded read.
    if(!Object.keys(query).length&&!nameSort){const rows=prepare(store,`SELECT ${projection} payload FROM ${table} WHERE ${where} ORDER BY ${order} LIMIT ?`).all(...args,pageSize+1);const total=rows.length<=pageSize?rows.length:prepare(store,`SELECT count(*) n FROM ${table} WHERE ${where}`).get(...args).n;return {items:rows.slice(0,pageSize).map(r=>decode(table,r.payload)),total,page,pageSize};}
    const total=prepare(store,`SELECT count(*) n FROM ${table} WHERE ${where}`).get(...args).n;
    let rows;
    if (nameSort) {
        // Keep Persian collation identical to the UI without decoding full records.
        const ids=prepare(store,`SELECT id,json_extract(payload,'$.name') name FROM ${table} WHERE ${where}`).all(...args)
            .sort((a,b)=>collator.compare(a.name||'',b.name||'')||a.id.localeCompare(b.id)).slice(offset,offset+pageSize);
        const statement=prepare(store,`SELECT ${projection} payload FROM ${table} WHERE id=?`);
        rows=ids.map(({id})=>statement.get(id));
    } else rows=prepare(store,`SELECT ${projection} payload FROM ${table} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args,pageSize,offset);
    return {items:rows.map(r=>decode(table,r.payload)),total,page,pageSize};
}
const orderSummary = order => ({itemCount:order.itemCount??(order.items||[]).reduce((n,item)=>n+Number(item.quantity||0),0),...Object.fromEntries(['id','code','userId','userName','userEmail','userPhone','recipientName','status','paymentStatus','paymentMethod','total','createdAt','updatedAt','revision'].filter(key=>Object.hasOwn(order,key)).map(key=>[key,order[key]]))});
module.exports={pageQuery,respond,collectionPage,orderSummary};
