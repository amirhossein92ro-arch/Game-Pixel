'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const fixture=require('./fixtures/migration-v1.json');
const {importJSON}=require('../storage/migration/import.cjs');

function workspace(t) {
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'web2-migration-validation-'));
    t.after(()=>{
        assert.equal(path.dirname(folder),os.tmpdir());
        assert.ok(path.basename(folder).startsWith('web2-migration-validation-'));
        fs.rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    });
    return {folder,source:path.join(folder,'source.json'),target:path.join(folder,'uncreated','target.sqlite')};
}

function rejectedWithoutWrites(files,data,code,at) {
    fs.writeFileSync(files.source,JSON.stringify(data));
    const original=fs.readFileSync(files.source),names=fs.readdirSync(files.folder);
    for(const dryRun of [true,false]) {
        const report=importJSON({source:files.source,target:files.target,dryRun});
        assert.equal(report.ok,false,JSON.stringify({code,at,dryRun}));
        assert.ok(report.issues.some(issue=>issue.code===code&&issue.at===at),JSON.stringify(report.issues));
        assert.deepEqual(fs.readdirSync(files.folder),names);
        assert.deepEqual(fs.readFileSync(files.source),original);
    }
}

test('migration validation rejects impossible calendar timestamps before creating any target',t=>{
    const files=workspace(t);
    for(const timestamp of ['2026-02-30T10:00:00Z','2025-02-29T12:30:00Z','1900-02-29T10:00:00Z','2026-04-31T10:00:00Z','2026-10-20T24:00:00Z']) {
        const data=structuredClone(fixture);data.orders[0].createdAt=timestamp;
        rejectedWithoutWrites(files,data,'AMBIGUOUS_OR_INVALID_TIMESTAMP','orders[0].createdAt');
    }
});

test('valid leap dates and timezone offsets retain source timestamps and correct UTC columns',t=>{
    const {folder,source}=workspace(t);
    for(const [index,timestamp]of ['2000-02-29T12:30:00Z','2024-02-29T23:30:00.123456789+03:30','2026-12-31T23:45:00-02:00'].entries()) {
        const data=structuredClone(fixture);data.orders[0].createdAt=timestamp;
        fs.writeFileSync(source,JSON.stringify(data));const original=fs.readFileSync(source),target=path.join(folder,'valid-'+index+'.sqlite');
        assert.equal(importJSON({source,target,dryRun:true}).ok,true);
        assert.equal(importJSON({source,target,dryRun:false}).ok,true);
        const db=new DatabaseSync(target,{readOnly:true});
        try {
            const order=db.prepare('SELECT created_at,payload FROM orders WHERE id=?').get(data.orders[0].id);
            assert.equal(order.created_at,new Date(timestamp).toISOString());
            assert.equal(JSON.parse(order.payload).createdAt,timestamp);
        } finally {db.close();}
        assert.deepEqual(fs.readFileSync(source),original);
    }
});

test('malformed optional administrator email fails dry-run with a safe field location',t=>{
    const files=workspace(t);
    for(const email of [{private:'private-email-marker'},['private-email-marker'],42,'private-email-marker']) {
        const data=structuredClone(fixture);data.adminAccounts[0].email=email;
        rejectedWithoutWrites(files,data,'INVALID_EMAIL','adminAccounts[0].email');
        const report=importJSON({source:files.source,target:files.target,dryRun:true});
        assert.doesNotMatch(JSON.stringify(report),/private-email-marker/);
    }
});

test('checkout replay keys require an order owned by the same existing customer',t=>{
    const files=workspace(t);
    for(const owner of [undefined,null,'other-customer']) {
        const data=structuredClone(fixture);
        data.users.push({id:'other-customer',email:'other@example.invalid',phone:'09120000002'});
        if(owner===undefined)delete data.orders[0].userId;else data.orders[0].userId=owner;
        rejectedWithoutWrites(files,data,'IDEMPOTENCY_OWNER_CONFLICT','idempotencyKeys[0].userId');
    }
});
