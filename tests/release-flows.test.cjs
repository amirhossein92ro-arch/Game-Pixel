'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const {launch}=require('./helpers/security-server.cjs');
const {totp}=require('../lib/admin-security.cjs');

test('release customer 2FA can be disabled with valid proof and emits a safe security notification',async t=>{
    const env=await launch(t),client=env.client(),user=await env.register(client);
    const setup=await client.call('/api/users/me/2fa/setup','POST',{currentPassword:user.password});assert.equal(setup.status,200);
    const confirmed=await client.call('/api/users/me/2fa/confirm','POST',{code:totp(setup.data.secret)});assert.equal(confirmed.status,200);
    assert.equal((await client.call('/api/users/me/2fa/disable','POST',{currentPassword:user.password,code:confirmed.data.recoveryCodes[0]})).status,204);
    const security=(await client.call('/api/users/me/security')).data;assert.equal(security.twoFactor.enabled,false);assert.equal(security.twoFactor.recoveryCodesRemaining,0);
    assert.ok((await client.call('/api/users/me/notifications')).data.items.some(notice=>notice.type==='security'&&notice.title.includes('غیرفعال')));
    assert.equal((await client.call('/api/auth/logout','POST',{})).status,204);
    const login=await client.call('/api/auth/login','POST',{email:user.email,password:user.password,captchaToken:'test-valid-captcha'});assert.equal(login.status,200);assert.equal(login.data.twoFactorRequired,undefined);assert.equal(login.data.user.id,user.id);
    const db=env.openDatabase(),events=db.prepare('SELECT action,details FROM audit_logs WHERE target_id=?').all(user.id);assert.ok(events.some(event=>event.action==='USER_2FA_DISABLED'));assert.equal(JSON.stringify(events).includes(setup.data.secret),false);
});

test('release discount expiry, inactivity, edits and invalid values are server enforced and audited',async t=>{
    const env=await launch(t),admin=env.client(),buyer=env.client();await env.admin(admin);await env.register(buyer);
    const input={type:'fixed',value:1000,active:true},items=[{id:'fixture-item',quantity:1}];
    for(const [code,fields]of [['RC_EXPIRED',{expiresAt:new Date(Date.now()-60000).toISOString()}],['RC_INACTIVE',{active:false}],['RC_FUTURE',{startsAt:new Date(Date.now()+3600000).toISOString()}]]){
        assert.equal((await admin.call('/api/admin/discounts','POST',{...input,code,...fields})).status,201);assert.equal((await buyer.call('/api/checkout/quote','POST',{items,discountCode:code})).status,400);
    }
    for(const value of [-1,0,1.5,101])assert.equal((await admin.call('/api/admin/discounts','POST',{type:'percent',code:'RC_INVALID',value})).status,400);
    const created=await admin.call('/api/admin/discounts','POST',{...input,code:'RC_EDIT'});assert.equal(created.status,201);
    assert.equal((await buyer.call('/api/checkout/quote','POST',{items,discountCode:'RC_EDIT'})).data.discount,1000);
    assert.equal((await admin.call('/api/admin/discounts/'+created.data.id,'PUT',{value:2000,revision:created.data.revision})).status,200);
    assert.equal((await buyer.call('/api/checkout/quote','POST',{items,discountCode:'RC_EDIT'})).data.discount,2000);
    const audit=(await admin.call('/api/admin/audit')).data.items;assert.ok(audit.some(row=>row.action==='DISCOUNT_CREATED'));assert.ok(audit.some(row=>row.action==='DISCOUNT_UPDATED'));
});

test('release checkout serializes final coupon use and preserves order history after catalog changes',async t=>{
    const env=await launch(t),admin=env.client(),clients=[env.client(),env.client()];await env.admin(admin);
    const users=[await env.register(clients[0],1),await env.register(clients[1],2)];
    const coupon=await admin.call('/api/admin/discounts','POST',{code:'RELEASE_ONCE',type:'fixed',value:1000,maxUses:1,active:true});assert.equal(coupon.status,201);
    const body={items:[{id:'fixture-item',quantity:1}],discountCode:'RELEASE_ONCE',recipientName:'Release fixture',recipientPhone:users[0].phone,recipientAddress:'Synthetic release shipping address',isAgreed:true};
    const results=await Promise.all(clients.map((client,index)=>client.call('/api/checkout','POST',body,{'Idempotency-Key':'release-coupon-request-'+index+'-2026'})));
    assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);
    const winner=results.findIndex(r=>r.status===201),order=results[winner].data.order,owner=clients[winner],other=clients[1-winner];
    assert.equal(order.items[0].unitPrice,10000);assert.equal(order.discount,1000);assert.equal(order.paymentStatus,'test');
    assert.equal((await owner.call('/api/orders')).data.length,1);assert.equal((await other.call('/api/orders/'+order.id)).status,404);
    const db=env.openDatabase();assert.equal(db.prepare('SELECT count(*) n FROM orders').get().n,1);
    assert.equal((await admin.call('/api/admin/discounts')).data.find(d=>d.id===coupon.data.id).uses,1);
    let product=(await admin.call('/api/admin/products/fixture-item')).data;assert.equal(product.stock,19);
    let changed=await admin.call('/api/admin/products/fixture-item','PUT',{price:90000,status:'inactive',revision:product.revision});assert.equal(changed.status,200);
    assert.equal((await owner.call('/api/checkout/quote','POST',{items:body.items})).status,409);
    assert.deepEqual((await owner.call('/api/orders/'+order.id)).data.items,order.items);
    assert.equal((await admin.call('/api/admin/products/fixture-item','DELETE',{confirm:true,confirmationPhrase:'DELETE',revision:changed.data.revision})).status,204);
    const historical=(await owner.call('/api/orders/'+order.id)).data;assert.equal(historical.total,order.total);assert.deepEqual(historical.items,order.items);
    const notices=(await owner.call('/api/users/me/notifications')).data.items,notice=notices.find(row=>row.type==='order');assert.ok(notice);
    assert.equal((await other.call('/api/users/me/notifications/'+notice.id+'/read','PUT',{})).status,404);
    assert.equal((await owner.call('/api/users/me/notifications/'+notice.id+'/read','PUT',{})).status,200);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('obsolete client-only payment and catalog scripts are outside the public asset allowlist',async t=>{
    const env=await launch(t),guest=env.client();
    for(const route of ['/js/checkout.js','/js/cart.js','/js/products.js'])for(const method of ['GET','HEAD'])assert.equal((await guest.call(route,method)).status,404,method+' '+route);
    for(const route of ['/checkout','/cart','/products']){const page=await guest.call(route);assert.equal(page.status,200);assert.doesNotMatch(page.raw,/<script[^>]*src=["'][^"']*js\/(?:checkout|cart|products)\.js/);}
});

test('backup verification rejects foreign-key corruption even when SQLite integrity_check succeeds',t=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'web2-release-backup-')),filename=path.join(directory,'corrupt.sqlite');
    t.after(()=>{assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
    const db=new DatabaseSync(filename);for(const name of ['accounts','orders','products','settings','audit_logs'])db.exec(`CREATE TABLE ${name}(id TEXT PRIMARY KEY)`);
    db.exec('CREATE TABLE child(parent_id TEXT REFERENCES accounts(id)); PRAGMA foreign_keys=OFF; INSERT INTO child VALUES(\'missing\');');assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
    assert.throws(()=>require('../scripts/backup.cjs').verify(filename),/foreign.key/i);
});
