'use strict';
const {readSource}=require('../json/source.cjs');
const {inspect}=require('./validate.cjs');
const {openRehearsal}=require('./sqlite.cjs');
const {insert,definitions}=require('./records.cjs');
const {newTarget,targetProblem}=require('./target.cjs');
function verify(store,plan) {
    const {db,repositories}=store,counts={};
    const {isDeepStrictEqual}=require('node:util');
    for(const entity of Object.keys(definitions))for(const source of plan.data[entity]){const expected=structuredClone(source);delete expected.passwordHash;if(entity==='orders'&&expected.items===undefined)expected.items=[];if(!isDeepStrictEqual(repositories[entity].findById(source.id),expected))throw Object.assign(new Error('Record identity or payload verification failed.'),{code:'IMPORT_VERIFICATION'});}
    for(const [entity,definition]of Object.entries(definitions))counts[entity]=db.prepare(`SELECT count(*) n FROM ${definition.table}`).get().n;
    for(const [entity,table]of Object.entries({wishlist:'wishlist',idempotencyKeys:'idempotency_keys',orderItems:'order_items',userCredentials:'user_credentials',userAddresses:'user_addresses'}))counts[entity]=db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
    for(const [entity,count]of Object.entries(plan.report.counts))if(counts[entity]!==count)throw Object.assign(new Error('Import count verification failed.'),{code:'IMPORT_VERIFICATION'});
    for(const [userId,hash]of plan.credentials)if(db.prepare('SELECT password_hash FROM user_credentials WHERE user_id=?').get(userId)?.password_hash!==hash)throw Object.assign(new Error('Credential verification failed.'),{code:'IMPORT_VERIFICATION'});
    for(const source of plan.data.adminAccounts)if(db.prepare('SELECT password_hash FROM admin_accounts WHERE id=?').get(String(source.id))?.password_hash!==source.passwordHash)throw Object.assign(new Error('Administrator credential verification failed.'),{code:'IMPORT_VERIFICATION'});
    let total=0n;
    for(const source of plan.data.orders){
        const row=repositories.orders.findById(source.id);total+=BigInt(row.total);
        for(const field of ['id','code','userId','subtotal','discount','shippingCost','total','createdAt','updatedAt','items'])if(JSON.stringify(row[field])!==JSON.stringify(source[field])&&!(field==='items'&&source.items===undefined&&row.items.length===0))throw Object.assign(new Error('Historical snapshot verification failed.'),{code:'IMPORT_VERIFICATION'});
    }
    if(total.toString()!==plan.report.orderTotal||db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Object.assign(new Error('Import integrity verification failed.'),{code:'IMPORT_VERIFICATION'});
    return {counts,orderTotal:total.toString(),quickCheck:'ok',foreignKeyErrors:0,credentialsPreserved:true,snapshotsPreserved:true};
}
function importJSON({source,target,dryRun=true}) {
    const snapshot=readSource(source),plan=inspect(snapshot.data);
    const report={...plan.report,dryRun,sourceSha256:snapshot.sha256,sourceBytes:snapshot.bytes,targetFormat:'web2-normalized/v1'};
    if(target){const problem=targetProblem(target,source);if(problem){report.ok=false;report.issueCount++;report.issues.push({code:problem,at:'target'});}}
    if(dryRun||!report.ok)return report;
    if(!target)throw Object.assign(new Error('An explicit new target is required.'),{code:'TARGET_REQUIRED'});
    report.verification=newTarget(target,source,staged=>{
        const store=openRehearsal(staged,{initialize:true});
        try {
            store.transaction(()=>{
                for(const entity of ['users','adminAccounts','products','discounts','orders','notifications','auditLogs','settings','messages','posts','comments','tickets','ticketMessages'])for(const row of plan.data[entity])store.repositories[entity].create(entity==='users'&&plan.credentials.has(String(row.id))?{...row,passwordHash:plan.credentials.get(String(row.id))}:row);
                for(const row of plan.data.wishlist)insert(store.db,'wishlist',{user_id:String(row.userId),product_id:String(row.productId),created_at:row.createdAt??null});
                for(const row of plan.data.idempotencyKeys)insert(store.db,'idempotency_keys',{user_id:String(row.userId),purpose:row.purpose,key:row.key,order_id:String(row.orderId),request_hash:row.requestHash,created_at:row.createdAt,expires_at:row.expiresAt});
                verify(store,plan);
            });
            const result=verify(store,plan);
            // The source file is never rewritten; reject publication if its bytes changed during import.
            if(readSource(source).sha256!==snapshot.sha256)throw Object.assign(new Error('Source changed during import.'),{code:'IMPORT_SOURCE_CHANGED'});
            return result;
        } finally {store.close();}
    });
    return report;
}
module.exports={importJSON,verify};
