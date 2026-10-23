'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const fixture=require('./fixtures/migration-v1.json'),{importJSON}=require('../storage/migration/import.cjs'),{exportRehearsal}=require('../storage/migration/export.cjs'),{openRehearsal}=require('../storage/migration/sqlite.cjs'),{inspect}=require('../storage/migration/validate.cjs');
const root=path.resolve(__dirname,'..');
function fixturePaths(t){const folder=fs.mkdtempSync(path.join(os.tmpdir(),'web2-portability-')),source=path.join(folder,'source.json'),target=path.join(folder,'test.sqlite');fs.writeFileSync(source,JSON.stringify(fixture));t.after(()=>{assert.equal(path.dirname(folder),os.tmpdir());fs.rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100});});return {folder,source,target};}

test('portable export round-trips an isolated normalized import without changing credentials or financial history',t=>{
    const {folder,source,target}=fixturePaths(t),json=path.join(folder,'portable.json'),second=path.join(folder,'second.sqlite');
    const imported=importJSON({source,target,dryRun:false}),report=exportRehearsal(target,json);assert.equal(report.containsPasswordHashes,true);assert.deepEqual(report.counts,imported.counts);
    const exported=JSON.parse(fs.readFileSync(json,'utf8'));assert.deepEqual(exported.users[0].passwordHash,fixture.users[0].passwordHash);assert.deepEqual(exported.orders,fixture.orders);assert.equal(exported.adminAccounts[0].role,'SUPER_ADMIN');
    assert.equal(importJSON({source:json,target:second,dryRun:true}).ok,true);assert.deepEqual(importJSON({source:json,target:second,dryRun:false}).verification.counts,imported.counts);
    assert.throws(()=>exportRehearsal(target,json),{code:'EXPORT_TARGET'});
});

test('two independent SQLite connections serialize a final-stock purchase without overselling or partial orders',async t=>{
    const {source,target}=fixturePaths(t);importJSON({source,target,dryRun:false});const initial=openRehearsal(target);initial.repositories.products.update('product-01',row=>({...row,stock:1}));initial.close();
    const program=`const {openRehearsal}=require('./storage/migration/sqlite.cjs');const store=openRehearsal(process.argv[1]);try{store.transaction(()=>{store.repositories.products.update('product-01',row=>({...row,stock:row.stock-1}));store.repositories.orders.create({id:process.argv[2],code:process.argv[2],userId:'customer-01',status:'pending',paymentStatus:'test',items:[{id:'product-01',name:'Historical snapshot',price:100,quantity:1,lineTotal:100}],subtotal:100,discount:0,shippingCost:0,total:100});});console.log('created');}catch(error){if(error.status!==400)throw error;console.log('stock-rejected');}finally{store.close();}`;
    const run=promisify(execFile),results=await Promise.all(['concurrent-01','concurrent-02'].map(id=>run(process.execPath,['-e',program,target,id],{cwd:root,windowsHide:true,timeout:15000})));
    assert.deepEqual(results.map(result=>result.stdout.trim()).sort(),['created','stock-rejected']);
    const store=openRehearsal(target);try{assert.equal(store.repositories.products.findById('product-01').stock,0);assert.equal(store.repositories.orders.count(),2);assert.equal(store.db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{store.close();}
});

test('duplicate replay scopes and mismatched idempotency ownership fail without duplicating orders',t=>{
    const mixed=structuredClone(fixture);mixed.users[0].id=1;mixed.orders[0].userId=1;mixed.notifications[0].userId=1;mixed.tickets[0].userId=1;mixed.wishlist[0].userId=1;mixed.idempotencyKeys[0].userId=1;
    mixed.idempotencyKeys.push({...mixed.idempotencyKeys[0],userId:'1'});mixed.wishlist.push({...mixed.wishlist[0],userId:'1'});
    const problems=inspect(mixed).report.issues.map(issue=>issue.code);assert.ok(problems.includes('DUPLICATE_IDEMPOTENCY_SCOPE'));assert.ok(problems.includes('DUPLICATE_WISHLIST'));
    const {source,target}=fixturePaths(t);importJSON({source,target,dryRun:false});const store=openRehearsal(target);
    try {
        const key=fixture.idempotencyKeys[0],insert=store.db.prepare('INSERT INTO idempotency_keys VALUES(?,?,?,?,?,?,?)');
        assert.throws(()=>insert.run(key.userId,key.purpose,key.key,key.orderId,key.requestHash,key.createdAt,key.expiresAt),/UNIQUE/);
        store.repositories.users.create({id:'other-customer',email:'other@example.invalid'});
        assert.throws(()=>insert.run('other-customer','checkout','different-key',key.orderId,key.requestHash,key.createdAt,key.expiresAt),/FOREIGN KEY/);
        assert.equal(store.repositories.orders.count(),1);
    }finally{store.close();}
});

test('malformed child records and invalid credential values are reported in dry-run validation',()=>{
    for(const mutate of [data=>data.orders[0].items=[null],data=>data.orders[0].items={},data=>data.users[0].addresses={},data=>data.users[0].passwordHash=[fixture.users[0].passwordHash]]){
        const data=structuredClone(fixture);mutate(data);assert.equal(inspect(data).report.ok,false);
    }
});

test('application controllers and services keep SQL behind the storage boundary',()=>{
    for(const file of ['server.js',...fs.readdirSync(path.join(root,'lib')).filter(name=>name.endsWith('.cjs')&&!['storage-migrations.cjs','storage-validation.cjs'].includes(name)).map(name=>'lib/'+name)]){
        const source=fs.readFileSync(path.join(root,file),'utf8');assert.doesNotMatch(source,/\b(?:store\.)?db\.(?:prepare|exec)\s*\(/,file);assert.doesNotMatch(source,/json_extract\s*\(/,file);
    }
});

test('normalized constraints preserve the last administrator and enforce stored email and phone identities',t=>{
    const {source,target}=fixturePaths(t);importJSON({source,target,dryRun:false});const store=openRehearsal(target);
    try {
        assert.throws(()=>store.repositories.adminAccounts.softDelete('admin-01'),{status:409});
        assert.throws(()=>store.db.prepare('DELETE FROM admin_accounts WHERE id=?').run('admin-01'),/FINAL_SUPER_ADMIN/);
        assert.equal(store.repositories.adminAccounts.findById('admin-01').active,true);
        assert.throws(()=>store.db.prepare('UPDATE users SET email_normalized=? WHERE id=?').run('different@example.invalid','customer-01'),/CHECK/);
        assert.throws(()=>store.db.prepare('UPDATE users SET phone=? WHERE id=?').run('bad-phone','customer-01'),/CHECK/);
        assert.throws(()=>store.db.prepare('UPDATE products SET stock=? WHERE id=?').run(1.5,'product-01'),/cannot store/);
    }finally{store.close();}
});

test('failed staging never publishes a partial database or leaves staging credentials behind',t=>{
    const {folder,source,target}=fixturePaths(t),before=fs.readFileSync(source),names=fs.readdirSync(folder),{newTarget}=require('../storage/migration/target.cjs');
    assert.throws(()=>newTarget(target,source,staged=>{const store=openRehearsal(staged,{initialize:true});try{store.repositories.users.create({id:'partial-user'});}finally{store.close();}throw Error('simulated failure');}),/simulated failure/);
    assert.deepEqual(fs.readdirSync(folder),names);assert.deepEqual(fs.readFileSync(source),before);assert.equal(fs.existsSync(target),false);
});

test('JSON source adapter handles a BOM and rejects invalid UTF-8, malformed JSON and oversized files before import',t=>{
    const {source,target}=fixturePaths(t),{readSource}=require('../storage/json/source.cjs');
    fs.writeFileSync(source,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify(fixture))]));assert.equal(importJSON({source,target,dryRun:true}).ok,true);assert.equal(fs.existsSync(target),false);
    for(const bytes of [Buffer.from([0xff,0xfe]),Buffer.from('{invalid')]){fs.writeFileSync(source,bytes);assert.throws(()=>readSource(source),{code:'IMPORT_JSON'});}
    fs.truncateSync(source,64*1024*1024+1);assert.throws(()=>readSource(source),{code:'IMPORT_SOURCE'});assert.equal(fs.existsSync(target),false);
});

test('storage error mapping exposes safe statuses without SQL, credentials or constraint internals',()=>{
    const {storageError}=require('../storage/errors.cjs');
    for(const [raw,status]of [[{message:'UNIQUE constraint failed: accounts.email secret-value'},409],[{message:'FOREIGN KEY constraint failed secret-value'},400],[{message:'database is locked secret-value',errcode:5},503],[{code:'23505',message:'SQL secret-value'},409],[{message:'SELECT private secret-value'},500]]){
        const error=storageError(raw);assert.equal(error.status,status);assert.doesNotMatch(error.message,/SQL|accounts|secret-value|SELECT|constraint/);if(status===503)assert.equal(error.retryAfter,1);
    }
});
