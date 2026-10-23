'use strict';
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {safeCall}=require('../errors.cjs');
const {applyMigrations}=require('./schema.cjs');
const {definitions,rowValues,insert,children,decode}=require('./records.cjs');
const validation=require('../../lib/storage-validation.cjs');
const {hashPattern}=require('./validate.cjs');
function openRehearsal(filename,{initialize=false}={}) {
    if(filename!==':memory:'&&!fs.existsSync(filename)&&!initialize)throw Object.assign(new Error('Initialize the rehearsal schema explicitly first.'),{code:'SCHEMA_REQUIRED'});
    if(filename!==':memory:'&&fs.existsSync(filename)&&fs.statSync(filename).size){
        const probe=new DatabaseSync(filename,{readOnly:true});
        try{if(!probe.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='migration_readiness_meta'").get())throw Object.assign(new Error('Only rehearsal databases may be opened here.'),{code:'STORAGE_FORMAT_UNSUPPORTED'});}finally{probe.close();}
    }
    const db=new DatabaseSync(filename);let savepoint=0;
    try {
        db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
        if(initialize)applyMigrations(db);
        if(db.prepare('SELECT format FROM migration_readiness_meta WHERE id=1').get()?.format!=='web2-normalized/v1')throw Error('Unsupported rehearsal format.');
        if(filename!==':memory:')fs.chmodSync(filename,0o600);
        function transaction(work) {
            if(typeof work!=='function'||work.constructor.name==='AsyncFunction')throw Object.assign(new Error('Transactions must be synchronous.'),{code:'STORAGE_ASYNC_TRANSACTION'});
            return safeCall(()=>{const nested=db.isTransaction,name='rehearsal_'+(++savepoint);db.exec(nested?`SAVEPOINT ${name}`:'BEGIN IMMEDIATE');try {
                const result=work();if(result&&typeof result.then==='function'){result.catch?.(()=>{});throw Object.assign(new Error('Transactions must be synchronous.'),{code:'STORAGE_ASYNC_TRANSACTION'});}
                db.exec(nested?`RELEASE ${name}`:'COMMIT');return result;
            } catch(error){if(db.isTransaction)db.exec(nested?`ROLLBACK TO ${name}; RELEASE ${name}`:'ROLLBACK');throw error;}});
        }
        const repositories={};
        function check(entity,row){
            if(validation.collections.includes(entity))validation.row(entity,row);else validation.jsonValue(row);
            if(!row||row.id==null||!String(row.id).trim())throw validation.fail();
            const hash=row.passwordHash??row.password_hash;if(hash!==undefined&&!hashPattern.test(hash))throw validation.fail();
        }
        for(const [entity,definition]of Object.entries(definitions)) {
            const findById=id=>safeCall(()=>decode(db,entity,db.prepare(`SELECT payload FROM ${definition.table} WHERE id=?`).get(String(id))));
            const count=()=>db.prepare(`SELECT count(*) n FROM ${definition.table}`).get().n;
            const create=row=>transaction(()=>{check(entity,row);insert(db,definition.table,rowValues(entity,row,db));children(db,entity,row);return findById(row.id);});
            const update=(id,change,{expectedRevision,requireRevision=false}={})=>transaction(()=>{
                const current=findById(id);if(!current)throw Object.assign(new Error('Record not found.'),{status:404});
                if((requireRevision||expectedRevision!==undefined)&&expectedRevision!==(current.revision??0))throw Object.assign(new Error('Stale record revision.'),{status:409});
                const next=change(structuredClone(current));if(String(next?.id)!==String(id))throw validation.fail();
                if(['products','orders','discounts'].includes(entity))next.revision=(current.revision??0)+1;
                check(entity,next);const values=rowValues(entity,next,db),columns=Object.keys(values).filter(k=>k!=='id');
                db.prepare(`UPDATE ${definition.table} SET ${columns.map(k=>k+'=?').join(',')} WHERE id=?`).run(...columns.map(k=>values[k]),String(id));
                // Child snapshots are written atomically with the parent; historical reads never join current prices/names.
                if(entity==='orders'){db.prepare('DELETE FROM order_items WHERE order_id=?').run(String(id));children(db,entity,next);}
                if(entity==='users'){db.prepare('DELETE FROM user_addresses WHERE user_id=?').run(String(id));for(const address of next.addresses||[])insert(db,'user_addresses',{id:String(address.id),user_id:String(id),is_default:address.isDefault?1:0,payload:JSON.stringify(address)});}
                return findById(id);
            });
            repositories[entity]=Object.freeze({findById,count,create,update,
                findMany:(query={})=>{const {page,pageSize,offset}=require('../../lib/listing.cjs').pageQuery(query);return {items:db.prepare(`SELECT payload FROM ${definition.table} ORDER BY rowid LIMIT ? OFFSET ?`).all(pageSize,offset).map(row=>decode(db,entity,row)),total:count(),page,pageSize};},
                softDelete:(id,options)=>{if(!['users','products','adminAccounts','discounts'].includes(entity))throw validation.fail();return update(id,row=>({...row,...(entity==='users'?{banned:true}:entity==='products'?{status:'inactive'}:{active:false}),deletedAt:new Date().toISOString()}),options);},
                delete:()=>{throw Object.assign(new Error('Historical records require an explicit retention policy; use softDelete where supported.'),{status:409});}
            });
        }
        return {db,repositories:Object.freeze(repositories),transaction,ready:()=>db.prepare('SELECT 1 FROM migration_readiness_meta').get()!==undefined,close:()=>db.close()};
    }catch(error){db.close();throw error;}
}
module.exports={openRehearsal};
