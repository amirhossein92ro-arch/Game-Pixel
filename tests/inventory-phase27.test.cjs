'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openDatabase}=require('../lib/database.cjs');
const {createInventory}=require('../lib/inventory.cjs');
const {createPaymentLifecycle}=require('../lib/payment-lifecycle.cjs');
const {launch}=require('./helpers/security-server.cjs');
const seed=path.join(__dirname,'../data.json');
function fixture(t,persist=false){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'web2-inventory-')),file=persist?path.join(dir,'inventory.sqlite'):':memory:';
    let store=openDatabase(file,seed);t.after(()=>{store?.close();assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});
    const open=()=>{store=openDatabase(file,seed);return store;};
    const product={id:'inventory-test',name:'Inventory fixture',price:1000,stock:1,status:'active'};
    store.put('products',product,{insert:true});
    const order=id=>{const at=new Date().toISOString(),value={id,code:'W2-'+id,userId:'buyer',status:'pending',paymentStatus:'pending',stockReserved:true,total:1000,items:[{id:product.id,name:product.name,price:1000,quantity:1}],createdAt:at,updatedAt:at};return store.put('orders',value,{insert:true});};
    return {get store(){return store;},open,close:()=>{store.close();store=null;},order,product};
}
test('last unit reserves once, releases once, and accepts a later checkout',t=>{
    const f=fixture(t),inventory=createInventory(f.store),first=f.order('first'),second=f.order('second');
    inventory.reserve(first);assert.deepEqual(inventory.quantities(f.product.id).available,0);
    assert.equal(inventory.quantities(f.product.id).reserved,1);
    assert.throws(()=>inventory.reserve(second),{code:'INSUFFICIENT_STOCK'});
    assert.equal(inventory.finish(first,'RELEASED'),true);assert.equal(inventory.finish(first,'RELEASED'),false);
    assert.equal(inventory.quantities(f.product.id).available,1);
    inventory.reserve(second);assert.equal(inventory.quantities(f.product.id).available,0);
    assert.equal(inventory.reconcile().issues.length,0);
});
test('trusted capture commits once; refund does not physically restock',t=>{
    const f=fixture(t),inventory=createInventory(f.store),flow=createPaymentLifecycle(f.store,inventory),order=f.order('capture');
    inventory.reserve(order);const attempt=flow.start(order,{provider:'test',reference:'TEST-INVENTORY-CAPTURE'}),eventId=crypto.randomUUID();
    assert.equal(flow.verify({eventId,attemptId:attempt.id,scenario:'SUCCESS'}).completed,true);
    assert.equal(inventory.byOrder(order.id)[0].status,'COMMITTED');assert.deepEqual(inventory.quantities(f.product.id),{productId:f.product.id,onHand:0,reserved:0,available:0,threshold:5,status:'active',revision:2});
    assert.equal(flow.verify({eventId,attemptId:attempt.id,scenario:'SUCCESS'}).replayed,true);
    flow.refund(order.id,{key:'inventory-refund-key-0001',amount:1000,reasonCode:'CUSTOMER_REQUEST',actorId:'admin'});
    assert.equal(inventory.quantities(f.product.id).available,0);
    const returned=[{id:f.product.id,quantity:1}],returnKey='return-key-0000001';
    assert.equal(inventory.restockOrder(order.id,returned,returnKey,{id:'admin'},'Physical return').replayed,false);
    assert.equal(inventory.restockOrder(order.id,returned,returnKey,{id:'admin'},'Physical return').replayed,true);
    assert.throws(()=>inventory.restockOrder(order.id,returned,'return-key-0000002',{id:'admin'}),{status:409});
    assert.equal(inventory.quantities(f.product.id).available,1);
    assert.equal(inventory.history(f.product.id).filter(row=>row.reason==='RETURNED').length,1);
});
test('payment failure releases the hold and retry creates a single new hold',t=>{
    const f=fixture(t),inventory=createInventory(f.store),flow=createPaymentLifecycle(f.store,inventory),order=f.order('failure');
    inventory.reserve(order);const attempt=flow.start(order,{provider:'test',reference:'TEST-INVENTORY-FAILURE'});
    assert.equal(flow.verify({eventId:crypto.randomUUID(),attemptId:attempt.id,scenario:'FAILURE'}).failed,true);
    assert.equal(inventory.byOrder(order.id)[0].status,'RELEASED');assert.equal(inventory.quantities(f.product.id).available,1);
    const retried=flow.retry(order.id,order.userId);assert.equal(retried.status,'pending');
    assert.equal(inventory.byOrder(order.id).filter(row=>row.status==='ACTIVE').length,1);
    assert.equal(inventory.quantities(f.product.id).available,0);
});
test('expiry releases only expired holds, late capture remains a discrepancy, and restart persists history',t=>{
    const f=fixture(t,true),inventory=createInventory(f.store),flow=createPaymentLifecycle(f.store,inventory),order=f.order('expiry');
    inventory.reserve(order);const attempt=flow.start(order,{provider:'test',reference:'TEST-INVENTORY-EXPIRY'});
    f.store.db.prepare("UPDATE inventory_reservations SET expires_at=? WHERE order_id=?").run(Date.now()-1,order.id);
    assert.equal(inventory.expire(),1);assert.equal(inventory.expire(),0);
    assert.equal(inventory.quantities(f.product.id).available,1);assert.equal(inventory.byOrder(order.id)[0].status,'EXPIRED');
    assert.equal(flow.verify({eventId:crypto.randomUUID(),attemptId:attempt.id,scenario:'SUCCESS'}).discrepancy,true);
    assert.equal(inventory.quantities(f.product.id).available,1);
    f.close();const reopened=f.open(),again=createInventory(reopened);assert.equal(again.byOrder(order.id)[0].status,'EXPIRED');assert.equal(again.history(f.product.id).length,2);
});
test('adjustments validate held units and bulk transaction rolls back together',t=>{
    const f=fixture(t),inventory=createInventory(f.store),order=f.order('adjust');inventory.reserve(order);
    assert.throws(()=>inventory.adjust(f.product.id,-1,'DAMAGED',{id:'admin'}),{status:409});
    assert.equal(inventory.adjust(f.product.id,2,'RESTOCK',{id:'admin'}).available,2);
    assert.throws(()=>f.store.transaction(()=>{inventory.adjust(f.product.id,1,'RESTOCK',{id:'admin'});inventory.adjust('missing',1,'RESTOCK',{id:'admin'});}),{status:404});
    assert.equal(inventory.quantities(f.product.id).available,2);
});
test('inventory API applies role permissions, audits changes, and rejects partial bulk edits',async t=>{
    const app=await launch(t),chief=app.client(),buyer=app.client(),limited=app.client();
    await app.admin(chief);await app.register(buyer,91);
    const created=await chief.call('/api/admin/admins','POST',{username:'inventory_order_manager',email:'inventory-order-manager@example.invalid',password:'Inventory manager password 2026!',role:'ORDER_MANAGER'});
    assert.equal(created.status,201);
    assert.equal((await limited.call('/api/admin/login','POST',{username:'inventory_order_manager',password:'Inventory manager password 2026!'})).status,200);
    assert.equal((await buyer.call('/api/admin/inventory')).status,403);
    assert.equal((await limited.call('/api/admin/inventory')).status,403);
    const view=await chief.call('/api/admin/inventory?stock=available&page=1&pageSize=10');assert.equal(view.status,200);assert.equal(view.data.items[0].available,20);
    const id=view.data.items[0].id;
    const insufficient=await buyer.call('/api/checkout/quote','POST',{items:[{id,quantity:21}]});
    assert.equal(insufficient.status,409);assert.equal(insufficient.data.code,'INSUFFICIENT_STOCK');assert.equal(insufficient.data.available,20);
    assert.equal((await chief.call('/api/admin/inventory/'+id+'/adjustments','POST',{delta:3,reason:'RESTOCK',note:'Test replenishment'})).status,201);
    assert.equal((await chief.call('/api/admin/inventory/'+id)).data.available,23);
    assert.equal((await chief.call('/api/admin/inventory/'+id+'/history')).data.items[0].reason,'RESTOCK');
    const invalid=await chief.call('/api/admin/inventory/bulk','POST',{rows:[{productId:id,delta:2,reason:'RESTOCK'},{productId:'missing',delta:1,reason:'RESTOCK'}]});assert.equal(invalid.status,409);
    assert.equal((await chief.call('/api/admin/inventory/'+id)).data.available,23);
    assert.equal((await chief.call('/api/admin/inventory/reconciliation')).status,200);
});
