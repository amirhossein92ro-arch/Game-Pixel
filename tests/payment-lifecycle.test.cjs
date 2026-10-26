'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertTransition,orderStates,paymentStates}=require('../lib/order-lifecycle.cjs');
const path=require('node:path'),{openDatabase}=require('../lib/database.cjs');
const fs=require('node:fs'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto'),{getPaymentProvider}=require('../lib/payment.cjs');
const {createPaymentLifecycle}=require('../lib/payment-lifecycle.cjs');
test('order transitions reject impossible states and unpaid paid claims',()=>{
    assert.ok(orderStates.includes('refunded'));
    assert.ok(paymentStates.includes('partially_refunded'));
    assert.equal(assertTransition({status:'pending',paymentStatus:'test'},'processing'),true);
    assert.equal(assertTransition({status:'pending',paymentStatus:'test'},'cancelled'),true);
    assert.throws(()=>assertTransition({status:'pending',paymentStatus:'test'},'paid'),{status:409});
    assert.throws(()=>assertTransition({status:'cancelled',paymentStatus:'test'},'shipped'),{status:409});
    assert.throws(()=>assertTransition({status:'refunded',paymentStatus:'refunded'},'paid'),{status:409});
    assert.throws(()=>assertTransition({status:'delivered',paymentStatus:'captured'},'pending'),{status:409});
});
test('verified test capture, duplicate callback and cumulative refunds are atomic',()=>{
    const store=openDatabase(':memory:',path.join(__dirname,'../data.json'));
    try{
        const at=new Date().toISOString(),flow=createPaymentLifecycle(store);
        store.put('orders',{id:'payment-flow-test',code:'W2-PAYMENT-FLOW',userId:'customer',status:'pending',paymentStatus:'test',total:100,items:[],createdAt:at,updatedAt:at},{insert:true});
        const order=store.get('orders','payment-flow-test'),attempt=flow.start(order,{provider:'test',reference:'TEST-W2-PAYMENT-FLOW'});
        assert.equal(flow.verify({eventId:crypto.randomUUID(),attemptId:attempt.id,scenario:'TIMEOUT'}).pending,true);
        const eventId=crypto.randomUUID();assert.equal(flow.verify({eventId,attemptId:attempt.id,scenario:'SUCCESS'}).completed,true);
        assert.equal(flow.verify({eventId,attemptId:attempt.id,scenario:'SUCCESS'}).replayed,true);
        assert.equal(store.get('orders',order.id).paymentStatus,'captured');
        const first=flow.refund(order.id,{key:'refund-key-0000001',amount:40,reasonCode:'CUSTOMER_REQUEST',actorId:'admin'});
        assert.equal(first.order.paymentStatus,'partially_refunded');
        assert.equal(flow.refund(order.id,{key:'refund-key-0000001',amount:40,reasonCode:'CUSTOMER_REQUEST',actorId:'admin'}).replayed,true);
        assert.throws(()=>flow.refund(order.id,{key:'refund-key-0000002',amount:61,reasonCode:'OTHER',actorId:'admin'}),{status:409});
        assert.equal(flow.refund(order.id,{key:'refund-key-0000003',amount:60,reasonCode:'OTHER',actorId:'admin'}).order.paymentStatus,'refunded');
        assert.equal(flow.reconcile().issues.length,0);
    }finally{store.close();}
});
test('test provider verifies signed callbacks and never enables production payments',()=>{
    const oldMode=process.env.PAYMENT_MODE,oldEnv=process.env.NODE_ENV;
    try{
        process.env.PAYMENT_MODE='test';process.env.NODE_ENV='test';
        const provider=getPaymentProvider(),attempt={id:'attempt',status:'captured',amount:120,currency:'IRR',provider_reference:'TEST-REF'};
        assert.equal(provider.verifyPayment(attempt,'SUCCESS').status,'captured');
        assert.equal(provider.verifyPayment(attempt,'TIMEOUT').status,'pending');
        assert.equal(provider.verifyPayment(attempt,'FAILURE').status,'failed');
        const body=Buffer.from('{"eventId":"sample"}'),signature=crypto.createHmac('sha256','synthetic-secret').update(body).digest('hex');
        assert.equal(provider.verifyWebhook(body,signature,'synthetic-secret'),true);
        assert.equal(provider.verifyWebhook(body,signature,'wrong-secret'),false);
        assert.equal(provider.refundPayment(attempt,40,'refund-key').status,'completed');
        process.env.NODE_ENV='production';assert.throws(()=>getPaymentProvider().verifyPayment(attempt,'SUCCESS'),{status:503});
        assert.throws(()=>getPaymentProvider().refundPayment(attempt,40,'refund-key'),{status:503});
    }finally{if(oldMode===undefined)delete process.env.PAYMENT_MODE;else process.env.PAYMENT_MODE=oldMode;if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;}
});
test('payment ledger keeps attempts, refunds and timeline linked to orders',()=>{
    const store=openDatabase(':memory:',path.join(__dirname,'../data.json'));
    try{
        const at=new Date().toISOString(),ledger=store.access('payment');
        store.put('orders',{id:'payment-ledger-test',status:'pending',paymentStatus:'test',total:100,items:[],createdAt:at,updatedAt:at},{insert:true});
        ledger.createAttempt({id:'attempt-1',orderId:'payment-ledger-test',provider:'test',status:'pending',amount:100,currency:'IRR',createdAt:at,updatedAt:at});
        assert.equal(ledger.updateAttempt('attempt-1','captured',null,at).changes,1);
        assert.equal(ledger.updateAttempt('attempt-1','captured',null,at).changes,0);
        ledger.createRefund({id:'refund-1',orderId:'payment-ledger-test',paymentId:'attempt-1',key:'refund-key-0001',amount:40,reasonCode:'CUSTOMER_REQUEST',status:'pending',createdBy:'admin',createdAt:at,updatedAt:at});
        assert.equal(ledger.refundedAmount('payment-ledger-test'),40);
        ledger.event({id:'event-1',orderId:'payment-ledger-test',type:'PAYMENT_STARTED',createdAt:at,actorType:'system',actorId:'system'});
        assert.equal(ledger.events('payment-ledger-test').length,1);
        assert.throws(()=>ledger.createRefund({id:'refund-2',orderId:'payment-ledger-test',paymentId:'attempt-1',key:'refund-key-0001',amount:40,reasonCode:'CUSTOMER_REQUEST',status:'pending',createdBy:'admin',createdAt:at,updatedAt:at}));
    }finally{store.close();}
});
test('payment and refund records survive reopening an isolated SQLite store',()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'web2-payment-persist-')),filename=path.join(directory,'payment.sqlite');
    let store;
    try{
        store=openDatabase(filename,path.join(__dirname,'../data.json'));
        const at=new Date().toISOString(),flow=createPaymentLifecycle(store);
        store.put('orders',{id:'payment-persist-test',code:'W2-PERSIST-TEST',status:'pending',paymentStatus:'test',total:20,items:[],createdAt:at,updatedAt:at},{insert:true});
        const attempt=flow.start(store.get('orders','payment-persist-test'),{provider:'test',reference:'TEST-W2-PERSIST-TEST'});
        flow.verify({eventId:crypto.randomUUID(),attemptId:attempt.id,scenario:'SUCCESS'});
        flow.refund('payment-persist-test',{key:'persistent-refund-0001',amount:20,reasonCode:'OTHER',actorId:'admin'});
        store.close();store=openDatabase(filename,path.join(__dirname,'../data.json'));
        const detail=createPaymentLifecycle(store).detail(store.get('orders','payment-persist-test'));
        assert.equal(detail.paymentStatus,'refunded');assert.equal(detail.refunds.length,1);assert.equal(detail.timeline.filter(e=>e.type==='REFUND_COMPLETED').length,1);
        assert.deepEqual(createPaymentLifecycle(store).reconcile().issues,[]);
    }finally{store?.close();if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()))throw Error('Unsafe payment fixture cleanup.');fs.rmSync(directory,{recursive:true,force:true});}
});
test('normalized migration round-trips payment attempts, refunds and events',()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'web2-payment-portable-')),source=path.join(directory,'source.json'),target=path.join(directory,'target.sqlite'),exported=path.join(directory,'export.json');
    try{
        const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/migration-v1.json'),'utf8'));
        fixture.orders[0].status='partially_refunded';fixture.orders[0].paymentStatus='partially_refunded';fixture.orders[0].refundedAmount=50000;
        const at='2025-01-02T00:00:00.000Z';
        fixture.paymentAttempts=[{id:'payment-attempt-1',orderId:'order-01',provider:'test',status:'captured',amount:255000,currency:'IRR',providerReference:'TEST-MIGRATED',createdAt:at,updatedAt:at}];
        fixture.paymentRefunds=[{id:'payment-refund-1',orderId:'order-01',paymentId:'payment-attempt-1',key:'portable-refund-key-0001',amount:50000,reasonCode:'CUSTOMER_REQUEST',status:'completed',createdBy:'admin-01',providerReference:'TEST-REFUND-MIGRATED',createdAt:at,updatedAt:at}];
        fixture.paymentEvents=[{id:'payment-event-1',orderId:'order-01',type:'REFUND_COMPLETED',actorType:'admin',actorId:'admin-01',createdAt:at,details:{amount:50000}}];
        fs.writeFileSync(source,JSON.stringify(fixture));
        const {importJSON}=require('../storage/migration/import.cjs'),{exportRehearsal}=require('../storage/migration/export.cjs');
        const imported=importJSON({source,target,dryRun:false});assert.equal(imported.ok,true,JSON.stringify(imported.issues));
        assert.equal(imported.verification.counts.paymentAttempts,1);assert.equal(imported.verification.counts.paymentRefunds,1);assert.equal(imported.verification.counts.paymentEvents,1);
        exportRehearsal(target,exported);const roundtrip=JSON.parse(fs.readFileSync(exported,'utf8'));
        assert.equal(roundtrip.paymentAttempts[0].amount,255000);assert.equal(roundtrip.paymentRefunds[0].amount,50000);assert.equal(roundtrip.paymentEvents[0].details.amount,50000);
        assert.equal(roundtrip.orders[0].paymentStatus,'partially_refunded');
        fixture.paymentRefunds[0].amount=300000;fs.writeFileSync(source,JSON.stringify(fixture));
        const invalid=importJSON({source,dryRun:true});assert.equal(invalid.ok,false);assert.ok(invalid.issues.some(i=>i.code==='REFUND_EXCEEDS_CAPTURED_AMOUNT'));
    }finally{if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()))throw Error('Unsafe portable payment cleanup.');fs.rmSync(directory,{recursive:true,force:true});}
});
test('normalized v1 order records upgrade in place to payment schema v2',()=>{
    const db=new DatabaseSync(':memory:');
    try{
        const oldSql=fs.readFileSync(path.join(__dirname,'../storage/migrations/sqlite/001_normalized.sql'),'utf8');
        db.exec('PRAGMA foreign_keys=ON');db.exec(oldSql);
        db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY,name TEXT NOT NULL,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)');
        db.prepare('INSERT INTO schema_migrations VALUES(?,?,?,?)').run(1,'normalized',crypto.createHash('sha256').update(oldSql).digest('hex'),new Date().toISOString());
        const old={id:'legacy-payment-order',status:'pending',paymentStatus:'test',total:25,items:[]};
        db.prepare('INSERT INTO orders(id,status,payment_status,total,revision,payload) VALUES(?,?,?,?,?,?)').run(old.id,old.status,old.paymentStatus,old.total,0,JSON.stringify(old));
        require('../storage/migration/schema.cjs').applyMigrations(db);
        assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n,2);
        assert.equal(db.prepare('SELECT total FROM orders WHERE id=?').get(old.id).total,25);
        db.prepare('UPDATE orders SET status=?,payment_status=? WHERE id=?').run('partially_refunded','partially_refunded',old.id);
        assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    }finally{db.close();}
});
test('runtime v16 order trigger upgrades without rewriting existing orders',()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'web2-payment-upgrade-')),filename=path.join(directory,'runtime.sqlite');let store;
    try{
        store=openDatabase(filename,path.join(__dirname,'../data.json'));
        const at=new Date().toISOString();store.put('orders',{id:'pre-upgrade-order',code:'W2-PRE-UPGRADE',status:'pending',paymentStatus:'test',total:25,items:[],createdAt:at,updatedAt:at},{insert:true});
        store.db.exec("DROP TRIGGER storage_orders_update; CREATE TRIGGER storage_orders_update BEFORE UPDATE ON orders WHEN json_extract(NEW.payload,'$.status') NOT IN ('pending','paid','processing','shipped','delivered','cancelled') BEGIN SELECT RAISE(ABORT,'STORAGE_VALIDATION'); END; PRAGMA user_version=16;");
        store.close();store=null;store=openDatabase(filename,path.join(__dirname,'../data.json'));
        store.mutate('orders','pre-upgrade-order',o=>({...o,status:'awaiting_payment'}));
        assert.equal(store.get('orders','pre-upgrade-order').total,25);assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,17);
    }finally{store?.close();if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()))throw Error('Unsafe runtime payment cleanup.');fs.rmSync(directory,{recursive:true,force:true});}
});
