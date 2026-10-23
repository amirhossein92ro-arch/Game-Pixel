'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),fixture=require('./fixtures/migration-v1.json');
const {openStorage,configuration}=require('../storage/index.cjs');
const {openRehearsal}=require('../storage/migration/sqlite.cjs');
const {inspect}=require('../storage/migration/validate.cjs');
const {importJSON}=require('../storage/migration/import.cjs');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function workspace(t){const folder=fs.mkdtempSync(path.join(os.tmpdir(),'web2-migration-'));t._storageCleanup??=[];t.after(()=>{for(const close of t._storageCleanup.splice(0).reverse())close();assert.equal(path.dirname(folder),os.tmpdir());fs.rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100});});return folder;}
function source(t,data=structuredClone(fixture)){const folder=workspace(t),file=path.join(folder,'source.json');fs.writeFileSync(file,JSON.stringify(data));return {folder,file,target:path.join(folder,'target.sqlite')};}

test('explicit runtime driver selection preserves the deployed SQLite default and fails before creating storage',t=>{
    const folder=workspace(t),filename=path.join(folder,'live.sqlite');
    assert.equal(configuration({},folder).driver,'sqlite');
    assert.equal(configuration({SQLITE_PATH:filename},folder).filename,filename);
    assert.throws(()=>configuration({SQLITE_PATH:filename,DATABASE_PATH:path.join(folder,'other.sqlite')},folder),{code:'STORAGE_PATH_CONFLICT'});
    for(const driver of ['invalid','json','postgres'])assert.throws(()=>openStorage({env:{STORAGE_DRIVER:driver,DATABASE_PATH:filename,DATABASE_URL:'postgres://fixture:secret@invalid/example'},root:folder}),/Storage|storage/);
    assert.equal(fs.existsSync(filename),false);
    assert.throws(()=>openStorage({config:{driver:'postgres',filename}}),{code:'STORAGE_DRIVER_UNAVAILABLE'});
});

test('runtime repository contract retains validation, revisions, atomic rollback and stable opaque IDs',t=>{
    const folder=workspace(t),seed=path.join(folder,'seed.json');fs.writeFileSync(seed,'{}');
    const store=openStorage({env:{SQLITE_PATH:path.join(folder,'runtime.sqlite'),SEED_DATA_PATH:seed},root:folder});t._storageCleanup.push(()=>store.close());
    const products=store.repositories.products,p={id:'opaque-product-id',name:'Fixture',price:10000,stock:2,status:'active'};
    assert.equal(products.create(p).id,p.id);assert.equal(products.count(),1);assert.equal(products.findMany({page:1,pageSize:1}).total,1);
    assert.throws(()=>products.findMany({pageSize:1000000}),{status:400});
    const first=products.findById(p.id);products.update(p.id,r=>({...r,stock:1}),{expectedRevision:first.revision,requireRevision:true});
    assert.throws(()=>products.update(p.id,r=>({...r,stock:0}),{expectedRevision:first.revision,requireRevision:true}),{status:409});
    assert.throws(()=>products.create(p),{status:409});
    assert.throws(()=>store.transaction(()=>{products.update(p.id,r=>({...r,stock:0}));products.create({...p,id:'rollback-product'});throw Error('rollback');}),/rollback/);
    assert.equal(products.findById(p.id).stock,1);assert.equal(products.findById('rollback-product'),undefined);
    assert.throws(()=>products.update(p.id,r=>({...r,stock:-1})),{status:400});
    assert.equal(store.ready(),true);assert.equal(store.db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
});

test('dry run reads legacy JSON without target writes or source changes',t=>{
    const {folder,file,target}=source(t),before=hash(file),names=fs.readdirSync(folder);
    const report=importJSON({source:file,target,dryRun:true});assert.equal(report.ok,true,JSON.stringify(report));assert.equal(report.counts.orderItems,1);assert.equal(report.counts.userCredentials,1);assert.equal(report.orderTotal,'255000');
    assert.deepEqual(fs.readdirSync(folder),names);assert.equal(hash(file),before);assert.equal(fs.existsSync(target),false);
    const cli=JSON.parse(execFileSync(process.execPath,['scripts/migrate-json-to-db.cjs','--source',file,'--target',target,'--dry-run'],{cwd:root,encoding:'utf8',windowsHide:true}));assert.equal(cli.dryRun,true);assert.equal(fs.existsSync(target),false);
});

test('dry run reports precise conflict locations, missing references, invalid timestamps and hashes without PII or secrets',()=>{
    const data=structuredClone(fixture);data.users.push({...data.users[0],id:'another-id',email:' FIXTURE@EXAMPLE.INVALID '});data.products.push({...data.products[0]});
    data.orders.push({...data.orders[0],id:'other-order'});data.orders[0].userId='missing-customer';data.orders[0].items[0].id='missing-product';data.notifications[0].userId='missing-customer';data.discounts.push({...data.discounts[0],id:'other-coupon'});
    data.users[0].passwordHash='SECRET-INVALID-HASH';data.users[0].createdAt='2025-01-01T00:00:00';
    const report=inspect(data).report,codes=report.issues.map(issue=>issue.code);
    for(const code of ['DUPLICATE_ID','DUPLICATE_EMAIL','DUPLICATE_PHONE','DUPLICATE_CODE','MISSING_REFERENCE','INVALID_PASSWORD_HASH','AMBIGUOUS_OR_INVALID_TIMESTAMP'])assert.ok(codes.includes(code),code);
    assert.ok(report.issues.some(issue=>issue.at==='products[1].id'&&issue.related==='products[0].id'));
    assert.doesNotMatch(JSON.stringify(report),/SECRET-INVALID-HASH|fixture@example|09120000001|missing-customer|missing-product/);
});

test('import preserves counts, roles, exact hashes, IDs, timestamps and historical financial snapshots',t=>{
    const {file,target}=source(t),before=hash(file),report=importJSON({source:file,target,dryRun:false});assert.equal(report.ok,true);assert.equal(report.verification.quickCheck,'ok');assert.deepEqual(report.verification.counts,report.counts);assert.equal(hash(file),before);
    const store=openRehearsal(target);t._storageCleanup.push(()=>store.close());assert.equal(store.ready(),true);
    assert.equal(store.db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);assert.equal(store.db.prepare('PRAGMA journal_mode').get().journal_mode,'wal');assert.equal(store.db.prepare('PRAGMA busy_timeout').get().timeout,5000);
    assert.equal(store.db.prepare('SELECT password_hash FROM user_credentials').get().password_hash,fixture.users[0].passwordHash);assert.equal(store.db.prepare('SELECT password_hash FROM admin_accounts').get().password_hash,fixture.adminAccounts[0].passwordHash);
    assert.doesNotMatch(JSON.stringify(store.repositories.users.findById('customer-01')),/password|\$2b\$/);
    assert.equal(store.repositories.adminAccounts.findById('admin-01').role,'SUPER_ADMIN');
    const original=store.repositories.orders.findById('order-01');assert.deepEqual(original,fixture.orders[0]);
    store.repositories.products.update('product-01',row=>({...row,name:'Changed name',price:900000}));store.repositories.products.softDelete('product-01');store.repositories.users.softDelete('customer-01');
    assert.deepEqual(store.repositories.orders.findById('order-01'),original);
    assert.throws(()=>store.db.prepare('DELETE FROM products WHERE id=?').run('product-01'),/FOREIGN KEY/);assert.throws(()=>store.db.prepare('DELETE FROM users WHERE id=?').run('customer-01'),/FOREIGN KEY/);
    assert.equal(store.repositories.orders.findMany({page:1,pageSize:1}).items.length,1);assert.throws(()=>store.repositories.orders.findMany({pageSize:101}),{status:400});
});

test('normalized schema constraints and bound dangerous values reject injection without changing query semantics',t=>{
    const {file,target}=source(t);importJSON({source:file,target,dryRun:false});const store=openRehearsal(target);t._storageCleanup.push(()=>store.close());
    assert.throws(()=>store.repositories.users.create({id:'duplicate-email',email:' FIXTURE@EXAMPLE.INVALID '}),{status:409});
    assert.throws(()=>store.repositories.notifications.create({id:'bad-notification',userId:'missing',type:'security',title:'title',message:'message'}),{status:400});
    assert.throws(()=>store.repositories.products.create({id:'bad-stock',name:'Bad',price:1,stock:-1,status:'active'}),{status:400});
    assert.throws(()=>store.db.prepare('UPDATE products SET stock=-1 WHERE id=?').run('product-01'),/CHECK/);
    const attack="x'); DROP TABLE products; --",p=store.repositories.products.create({id:attack,name:attack,price:1,stock:1,status:'active'});assert.equal(p.name,attack);assert.equal(store.repositories.products.findById(attack).id,attack);assert.equal(store.repositories.products.count(),2);
    assert.throws(()=>store.repositories.discounts.create({...fixture.discounts[0],id:'duplicate-coupon'}),{status:409});
    assert.throws(()=>store.repositories.orders.create({...fixture.orders[0],id:'duplicate-code'}),{status:409});
    assert.equal(store.db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('transaction failures roll stock, orders and coupon usage back together; nested savepoints stay usable',t=>{
    const {file,target}=source(t);importJSON({source:file,target,dryRun:false});const store=openRehearsal(target);t._storageCleanup.push(()=>store.close());
    const {products,orders,discounts}=store.repositories;
    for(const failure of ['stock','order','coupon']){
        assert.throws(()=>store.transaction(()=>{
            products.update('product-01',row=>({...row,stock:failure==='stock'?-1:row.stock-1}));
            orders.create({...fixture.orders[0],id:'new-'+failure,code:failure==='order'?fixture.orders[0].code:'code-'+failure,paymentReference:'ref-'+failure});
            discounts.update('discount-01',row=>({...row,uses:failure==='coupon'?100:row.uses+1}));
        }));
        assert.equal(products.findById('product-01').stock,5);assert.equal(orders.count(),1);assert.equal(discounts.findById('discount-01').uses,1);
    }
    store.transaction(()=>{assert.throws(()=>store.transaction(()=>{products.update('product-01',row=>({...row,stock:0}));throw Error('nested');}));assert.equal(products.findById('product-01').stock,5);});
    assert.throws(()=>store.transaction(async()=>{}),{code:'STORAGE_ASYNC_TRANSACTION'});
    assert.throws(()=>store.transaction(()=>{products.update('product-01',row=>({...row,stock:0}));return Promise.resolve();}));assert.equal(products.findById('product-01').stock,5);
});

test('imports exclude environment and active authentication secrets; plaintext passwords and unknown entities fail closed',t=>{
    const data=structuredClone(fixture);data.sessions=[{hash:'secret-session-hash',csrf:'secret-csrf'}];data.SMTP_PASSWORD='smtp-fixture-secret';data.settings[0].value.apiKey='api-fixture-secret';data.auditLogs[0].details.secret='audit-fixture-secret';
    const {file,target}=source(t,data);const report=importJSON({source:file,target,dryRun:false});assert.equal(report.ok,true);assert.equal(report.excluded.topLevelKeys,2);
    const db=new DatabaseSync(target,{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);const payloads=db.prepare('SELECT payload FROM settings UNION ALL SELECT payload FROM audit_logs').all();assert.doesNotMatch(JSON.stringify(payloads),/smtp-fixture-secret|api-fixture-secret|audit-fixture-secret/);}finally{db.close();}
    data.users[0].password='plaintext-secret';assert.ok(inspect(data).report.issues.some(i=>i.code==='PLAINTEXT_PASSWORD'));data.unknownBusinessRecords=[];assert.ok(inspect(data).report.issues.some(i=>i.code==='UNSUPPORTED_COLLECTION'));
});

test('invalid imports and existing, active or source destinations remain untouched',t=>{
    const data=structuredClone(fixture);data.products.push({...data.products[0]});const {file,target}=source(t,data),before=hash(file);
    const report=importJSON({source:file,target,dryRun:false});assert.equal(report.ok,false);assert.equal(fs.existsSync(target),false);assert.equal(hash(file),before);
    fs.writeFileSync(target,'existing target bytes');const targetHash=hash(target);assert.equal(importJSON({source:file,target,dryRun:false}).ok,false);assert.equal(hash(target),targetHash);
    assert.equal(importJSON({source:file,target:file,dryRun:true}).ok,false);
    assert.equal(importJSON({source:file,target:path.join(root,'var/web2.sqlite'),dryRun:true}).ok,false);
});

test('runtime and rehearsal formats cannot be opened interchangeably or changed implicitly',t=>{
    const {file,target,folder}=source(t);importJSON({source:file,target,dryRun:false});const before=hash(target);
    assert.throws(()=>openStorage({env:{DATABASE_PATH:target,SEED_DATA_PATH:file},root:folder}),{code:'STORAGE_FORMAT_UNSUPPORTED'});assert.equal(hash(target),before);
    const seed=path.join(folder,'empty.json');fs.writeFileSync(seed,'{}');const live=path.join(folder,'live.sqlite');const runtime=openStorage({env:{DATABASE_PATH:live,SEED_DATA_PATH:seed},root:folder});runtime.close();const liveBefore=hash(live);
    assert.throws(()=>openRehearsal(live,{initialize:true}),{code:'STORAGE_FORMAT_UNSUPPORTED'});assert.equal(hash(live),liveBefore);
    const missing=path.join(folder,'missing.sqlite');assert.throws(()=>openRehearsal(missing),{code:'SCHEMA_REQUIRED'});assert.equal(fs.existsSync(missing),false);
});

test('versioned schema migration is explicit, idempotent and detects checksum changes',t=>{
    const folder=workspace(t),target=path.join(folder,'schema.sqlite');
    execFileSync(process.execPath,['scripts/storage-schema.cjs','--target',target,'--apply'],{cwd:root,windowsHide:true,stdio:'pipe'});
    const store=openRehearsal(target);t._storageCleanup.push(()=>store.close());const {applyMigrations}=require('../storage/migration/schema.cjs');applyMigrations(store.db);assert.equal(store.db.prepare('SELECT count(*) n FROM schema_migrations').get().n,1);
    store.db.prepare("UPDATE schema_migrations SET checksum='tampered'").run();assert.throws(()=>applyMigrations(store.db));assert.equal(store.db.isTransaction,false);
});
