'use strict';
// Deliberately excludes messages, URLs, headers, bodies, identities and raw errors.
const listeners=new Set();
const events=new Set(['server-started','server-error','request-rejected','process-crash','shutdown','maintenance-failure','configuration-warning','slow-request','runtime-sample','monitoring-unavailable','ops-alert','alert-hook-failed','backup-success','backup-failure','backup-growth','storage-busy','provider-failure',
    'corrupt-data','corrupt-seed','migration-backup-created','corrupt-data-or-migration-backup-failure','rollback-failure','validation-failure','write-failure','stale-revision-conflict','migration-success','startup-validation-or-migration-failure']);
const categories=new Set(['startup','shutdown','unexpected','product','maintenance','configuration','request','storage','provider','auth','validation','conflict','monitoring','backup','alert','uncaught-exception','unhandled-rejection']);
const codes=new Set(['STORAGE_FAILURE','STORAGE_CONFLICT','STORAGE_BUSY','STORAGE_CORRUPT','STORAGE_VALIDATION','SQLITE_BUSY','SQLITE_LOCKED','SQLITE_CORRUPT','SQLITE_NOTADB','SQLITE_FULL','ENOSPC','EACCES','EIO','EADDRINUSE','ECONNREFUSED','ETIMEDOUT','CAPTCHA_UNCONFIGURED','SMS_UNCONFIGURED','CUSTOMER_2FA_UNCONFIGURED','PAYMENTS_UNAVAILABLE']);
function write(event,fields={},sink){
    try{
        if(!events.has(event))return null;
        const row={time:new Date().toISOString(),level:['info','warn','error'].includes(fields.level)?fields.level:'info',event,category:categories.has(fields.category)?fields.category:'monitoring'};
        if(codes.has(fields.code))row.code=fields.code;
        if(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(fields.requestId||''))row.requestId=fields.requestId;
        if(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(fields.method))row.method=fields.method;
        for(const key of ['status','durationMs','count'])if(Number.isFinite(fields[key])&&fields[key]>=0)row[key]=Math.min(1e9,Math.round(fields[key]));
        if(['INFO','WARNING','CRITICAL'].includes(fields.severity))row.severity=fields.severity;
        if(['problem','recovery'].includes(fields.state))row.state=fields.state;
        if(fields.condition&&require('./ops-state.cjs').conditions.includes(fields.condition))row.condition=fields.condition;
        if(event==='server-started')row.message='Server is running';
        if(event==='process-crash'&&fields.productionOriginRequired)row.reason='Production requires HTTPS';
        (sink||((value)=>console.error(value)))(JSON.stringify(row));
        for(const listener of listeners){try{listener(row);}catch{}}
        return row;
    }catch{return null;}
}
function subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
module.exports={write,subscribe};
