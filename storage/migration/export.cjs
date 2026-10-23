'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {openRehearsal}=require('./sqlite.cjs');
const {definitions}=require('./records.cjs');
const {syncDirectory}=require('../../lib/atomic-file.cjs');
function exportRehearsal(source,target) {
    const {canonicalFuturePath}=require('./target.cjs');
    source=canonicalFuturePath(source);target=canonicalFuturePath(target);
    if(source===target||fs.existsSync(target)||!target.endsWith('.json'))throw Object.assign(new Error('Export requires a new private JSON destination.'),{code:'EXPORT_TARGET'});
    // Keep exported credentials outside all public application directories.
    const root=path.resolve(__dirname,'../..'),relative=path.relative(root,target);
    if(!relative.startsWith('..')&&!path.isAbsolute(relative)&&relative.split(path.sep)[0]!=='.runtime')throw Object.assign(new Error('Export must be outside the application tree or in .runtime.'),{code:'EXPORT_TARGET'});
    const store=openRehearsal(source);let snapshot;
    try {snapshot=store.transaction(()=>{
        if(store.db.prepare('SELECT count(*) n FROM sessions').get().n)throw Object.assign(new Error('Active security state needs a dedicated migration.'),{code:'EXPORT_SECURITY_STATE'});
        const data={_format:'web2-portable/v1'};
        for(const [entity,definition]of Object.entries(definitions))data[entity]=store.db.prepare(`SELECT id FROM ${definition.table} ORDER BY rowid`).all().map(row=>store.repositories[entity].findById(row.id));
        const hashes=new Map(store.db.prepare('SELECT user_id,password_hash FROM user_credentials').all().map(row=>[row.user_id,row.password_hash]));
        for(const row of data.users)if(hashes.has(String(row.id)))row.passwordHash=hashes.get(String(row.id));
        const admins=new Map(store.db.prepare('SELECT id,password_hash FROM admin_accounts').all().map(row=>[row.id,row.password_hash]));
        for(const row of data.adminAccounts)row.passwordHash=admins.get(String(row.id));
        data.wishlist=store.db.prepare('SELECT user_id AS userId,product_id AS productId,created_at AS createdAt FROM wishlist ORDER BY rowid').all();
        data.idempotencyKeys=store.db.prepare('SELECT user_id AS userId,purpose,key,order_id AS orderId,request_hash AS requestHash,created_at AS createdAt,expires_at AS expiresAt FROM idempotency_keys ORDER BY rowid').all();
        return data;
    });}finally{store.close();}
    const report=require('./validate.cjs').inspect(snapshot).report;if(!report.ok)throw Object.assign(new Error('Export validation failed.'),{code:'EXPORT_VALIDATION'});
    fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
    const staged=path.join(path.dirname(target),'.'+path.basename(target)+'-'+crypto.randomUUID()+'.tmp');let fd,owned=false;
    try {
        fd=fs.openSync(staged,'wx',0o600);owned=true;fs.writeFileSync(fd,JSON.stringify(snapshot,null,2)+'\n','utf8');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
        fs.linkSync(staged,target);fs.unlinkSync(staged);owned=false;syncDirectory(path.dirname(target));
    }finally{if(fd!==undefined)fs.closeSync(fd);if(owned)fs.unlinkSync(staged);}
    return {ok:true,format:'web2-portable/v1',counts:report.counts,containsPasswordHashes:true};
}
module.exports={exportRehearsal};
