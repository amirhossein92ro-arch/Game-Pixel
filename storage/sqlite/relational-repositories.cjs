'use strict';
const {execute}=require('./execute.cjs');
const {pageQuery}=require('../../lib/listing.cjs');
const validation=require('../../lib/storage-validation.cjs');
const {scrub}=require('../redact.cjs');
const noDelete=()=>{throw Object.assign(new Error('This repository is append-only.'),{status:409,code:'STORAGE_APPEND_ONLY'});};
function relationalRepositories(store) {
    const {db}=store;
    const owner=value=>{if(typeof value!=='string'||!value)throw validation.fail();return value;};
    return {
        notifications:Object.freeze({
            findById:(id,userId)=>execute(db,'SELECT id,user_id AS userId,type,title,message,resource_id AS resourceId,created_at AS createdAt,read_at AS readAt FROM notifications WHERE id=? AND user_id=?','get',[String(id),owner(userId)]),
            findMany:({userId,...query})=>{const {page,pageSize,offset}=pageQuery(query);return {items:execute(db,'SELECT id,type,title,message,resource_id AS resourceId,created_at AS createdAt,read_at AS readAt FROM notifications WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT ? OFFSET ?','all',[owner(userId),pageSize,offset]),total:execute(db,'SELECT count(*) n FROM notifications WHERE user_id=?','get',[userId]).n,page,pageSize};},
            count:userId=>execute(db,'SELECT count(*) n FROM notifications WHERE user_id=?','get',[owner(userId)]).n,
            create:row=>{validation.jsonValue(row);if(['id','userId','type','title','message'].some(key=>typeof row[key]!=='string'||!row[key]))throw validation.fail();execute(db,'INSERT INTO notifications(id,user_id,type,title,message,resource_id,created_at,read_at) VALUES(?,?,?,?,?,?,?,?)','run',[row.id,row.userId,row.type,row.title,row.message,row.resourceId??null,row.createdAt??new Date().toISOString(),row.readAt??null]);return {...row};},
            markRead:(id,userId,at=new Date().toISOString())=>execute(db,'UPDATE notifications SET read_at=coalesce(read_at,?) WHERE id=? AND user_id=?','run',[at,String(id),owner(userId)]),
        }),
        auditLogs:Object.freeze({
            findById:id=>{const row=execute(db,'SELECT * FROM audit_logs WHERE id=?','get',[id]);return row?{...row,details:scrub(JSON.parse(row.details))}:undefined;},
            findMany:(query={})=>{const {page,pageSize,offset}=pageQuery(query);return {items:execute(db,'SELECT * FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?','all',[pageSize,offset]).map(row=>({...row,details:scrub(JSON.parse(row.details))})),total:execute(db,'SELECT count(*) n FROM audit_logs','get',[]).n,page,pageSize};},
            count:()=>execute(db,'SELECT count(*) n FROM audit_logs','get',[]).n,
            create:row=>{validation.jsonValue(row);if(['actorId','actorUsername','actorRole','action','targetType','targetId'].some(key=>typeof row[key]!=='string'))throw validation.fail();const result=execute(db,'INSERT INTO audit_logs(actor_id,actor_username,actor_role,action,target_type,target_id,details,created_at) VALUES(?,?,?,?,?,?,?,?)','run',[row.actorId,row.actorUsername,row.actorRole,row.action,row.targetType,row.targetId,JSON.stringify(scrub(row.details||{})),row.createdAt??new Date().toISOString()]);return String(result.lastInsertRowid);},
            update:noDelete,delete:noDelete
        })
    };
}
module.exports={relationalRepositories};
