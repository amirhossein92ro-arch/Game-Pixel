'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const pricing=require('../js/product-pricing.js');
const {openDatabase}=require('../lib/database.cjs');
const seed=require('../data.json');
const pc=seed.products.find(p=>String(p.id)==='214');

test('hardware seed has unique IDs, local illustrations and complete linked PC configuration',()=>{
    assert.equal(new Set(seed.products.map(p=>String(p.id))).size,seed.products.length);
    for(const category of ['پردازنده','مادربرد','رم','کارت گرافیک','SSD و حافظه','خنک‌کننده','پاور','کیس','سیستم کامل گیمینگ']) {
        const rows=seed.products.filter(p=>p.category===category);assert.ok(rows.length,category);
        for(const p of rows){assert.ok(fs.existsSync(path.join(__dirname,'..',p.image)));assert.ok(p.features.length>=4);assert.equal(p.reviews,0,'new seed must not invent reviews');}
    }
    assert.equal(pc.components.length,8);
    for(const c of pc.components)assert.ok(seed.products.some(p=>String(p.id)===c.productId));
    assert.equal(pc.discount,0,'campaign price is computed, never persisted as a permanent discount');
});

test('calendar-year campaign has stable boundaries and one shared authoritative price',()=>{
    const start=Date.parse(pc.campaign.startAt),end=Date.parse(pc.campaign.endAt);
    const anniversary=new Date(start);anniversary.setUTCFullYear(anniversary.getUTCFullYear()+1);
    assert.equal(end,anniversary.getTime());
    assert.equal(pricing.campaignState(pc,start-1),'scheduled');assert.equal(pricing.unitPrice(pc,start-1),72000000);
    assert.equal(pricing.campaignState(pc,start),'active');assert.equal(pricing.unitPrice(pc,start),64800000);
    assert.equal(pricing.unitPrice(pc,end-1),64800000);
    assert.equal(pricing.campaignState(pc,end),'expired');assert.equal(pricing.unitPrice(pc,end),72000000);
    assert.equal(pricing.normalizeCampaign({...pc.campaign,endAt:new Date(end+1000).toISOString()}),null);
    assert.equal(pricing.unitPrice({...pc,campaign:{...pc.campaign,discount:100}},start),72000000);
});

test('hardware migration adds missing seed once, preserving admin edits and deliberate deletions',()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-hardware-')),file=path.join(temp,'seed.json'),database=path.join(temp,'test.sqlite');let store;
    try{
        fs.writeFileSync(file,JSON.stringify({products:[{id:'1',name:'Legacy edited',price:300,stock:2,status:'active'}]}));
        store=openDatabase(database,file);store.db.prepare("DELETE FROM settings WHERE id='pc-hardware-catalog-v4'").run();
        store.put('products',{...seed.products.find(p=>p.id===201),id:'201',price:12345},{insert:true});
        store.db.prepare('INSERT INTO audit_logs(actor_id,actor_username,actor_role,action,target_type,target_id,details,created_at) VALUES(?,?,?,?,?,?,?,?)').run('admin','admin','SUPER_ADMIN','PRODUCT_DELETED','product','202','{}',new Date().toISOString());
        store.close();store=null;fs.writeFileSync(file,JSON.stringify(seed));store=openDatabase(database,file);
        assert.equal(store.get('products','1').name,'Legacy edited');assert.equal(store.get('products','201').price,12345);
        assert.equal(store.get('products','202'),null);assert.ok(store.get('products','214').campaign);
        store.remove('products','203');store.close();store=null;store=openDatabase(database,file);assert.equal(store.get('products','203'),null);
    }finally{store?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

test('HTTP API, summary listings and server quotes agree before and after PC campaign expiry',async t=>{
    const {launch}=require('./helpers/security-server.cjs');const app=await launch(t),db=app.openDatabase();
    const at=new Date(),start=new Date(Date.UTC(at.getUTCFullYear(),0,1)),end=new Date(start);end.setUTCFullYear(end.getUTCFullYear()+1);
    const record={...pc,id:'214',campaign:{...pc.campaign,startAt:start.toISOString(),endAt:end.toISOString()}};
    db.prepare('INSERT INTO products(id,payload) VALUES(?,?)').run('214',JSON.stringify(record));
    const user=app.client();await app.register(user,80);
    let result=await user.call('/api/products/214');assert.equal(result.status,200);assert.deepEqual(result.data.campaign,record.campaign);assert.equal(result.data.components.length,8);
    result=await user.call('/api/products?page=1&pageSize=100&view=summary');assert.ok(result.data.items.find(p=>p.id==='214').campaign);
    result=await user.call('/api/checkout/quote','POST',{items:[{id:'214',quantity:1}]});assert.equal(result.status,200);assert.equal(result.data.items[0].price,64800000);
    const expiredStart=new Date(start);expiredStart.setUTCFullYear(expiredStart.getUTCFullYear()-1);
    db.prepare('UPDATE products SET payload=? WHERE id=?').run(JSON.stringify({...record,campaign:{...record.campaign,startAt:expiredStart.toISOString(),endAt:start.toISOString()}}),'214');
    result=await user.call('/api/checkout/quote','POST',{items:[{id:'214',quantity:1}]});assert.equal(result.status,200);assert.equal(result.data.items[0].price,72000000,'server cannot honor an expired frontend sale');
    for(const url of ['/js/product-pricing.js','/js/storefront-pc.js','/js/storefront-motion.js','/css/storefront-pc.css','/css/storefront-motion.css']) {
        const response=await fetch(app.base+url);assert.equal(response.status,200,url);
    }
});
