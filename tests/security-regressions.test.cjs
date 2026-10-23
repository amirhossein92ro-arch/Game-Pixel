'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {spawn} = require('node:child_process');
const {DatabaseSync} = require('node:sqlite');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');

async function launch(t) {
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'web2-security-regression-'));
    const database = path.join(directory, 'test.sqlite'), seed = path.join(directory, 'seed.json');
    fs.writeFileSync(seed, JSON.stringify({products:[{id:'secure-item', name:'Security fixture', price:10000,
        stock:500, discount:0, category:'fixture', supplierCost:7000, internalNotes:'private inventory notes',
        supplierEmail:'private@example.invalid'}], users:[], orders:[]}));
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['server.js'], {cwd:root, windowsHide:true,
        env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:base,
            ALLOWED_ORIGINS:'',TRUST_PROXY:'',DATABASE_PATH:database,SEED_DATA_PATH:seed,
            ADMIN_USERNAME:'admin',ADMIN_PASSWORD:'Unique regression admin 2026!',ADMIN_TOTP_SECRET:'',
            CAPTCHA_TEST_MODE:'true',SMS_PROVIDER:'mock',PAYMENT_MODE:'test'},stdio:['ignore','pipe','pipe']});
    t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
            const ended = new Promise(resolve => child.once('exit', resolve));child.kill();await ended;
        }
        if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir())) throw Error('Unsafe cleanup.');
        fs.rmSync(directory, {recursive:true,force:true,maxRetries:5,retryDelay:100});
    });
    await new Promise((resolve,reject) => {
        let errors = '';const timeout = setTimeout(() => reject(Error('Server startup timed out.')),20000);
        child.stderr.on('data',data => errors += data);
        child.once('exit',code => {clearTimeout(timeout);reject(Error(`Startup failed (${code}): ${errors}`));});
        child.stdout.on('data',data => {if (String(data).includes('Server is running')) {clearTimeout(timeout);resolve();}});
    });
    const client = () => ({cookie:'',csrf:'',async call(url,method='GET',body,headers={}) {
        const response = await fetch(base + url, {method,redirect:'manual',headers:{Origin:base,
            ...(this.cookie?{Cookie:this.cookie}:{}),...(body!==undefined?{'Content-Type':'application/json','X-CSRF-Token':this.csrf}:{}),...headers},
            body:body===undefined?undefined:JSON.stringify(body)});
        const cookies=response.headers.getSetCookie();if(cookies.length)this.cookie=cookies.map(c=>c.split(';')[0]).join('; ');
        const raw=await response.text();const data=/application\/json/.test(response.headers.get('Content-Type')||'')?JSON.parse(raw):raw;
        if(data?.csrfToken)this.csrf=data.csrfToken;return {status:response.status,response,data,raw};
    }});
    return {base,database,client};
}

test('real HTTP regressions for public data, duplicate checkout, principal limits and admin caching',async t => {
    const env=await launch(t),guest=env.client(),user=env.client(),admin=env.client();
    const registration=await user.call('/api/auth/register','POST',{name:'Regression Buyer',email:'regression@example.invalid',
        phone:'09121112021',password:'Unique regression buyer 2026!',captchaToken:'test-valid-captcha'});
    assert.equal(registration.status,201);
    const body={items:[{id:'secure-item',quantity:1}],recipientName:'Regression Buyer',recipientPhone:'09121112021',
        recipientAddress:'Complete address for security regression testing',isAgreed:true};
    await t.test('public product responses use an explicit field allowlist',async()=>{
        for(const route of ['/api/products','/api/products/secure-item']) {
            const result=await guest.call(route);assert.equal(result.status,200);
            assert.doesNotMatch(result.raw,/supplierCost|internalNotes|supplierEmail|private inventory notes/);
        }
    });
    await t.test('rotating checkout keys cannot reserve the same cart repeatedly',async()=>{
        const key=crypto.randomUUID();const first=await user.call('/api/checkout','POST',body,{'Idempotency-Key':key});assert.equal(first.status,201);
        const replay=await user.call('/api/checkout','POST',body,{'Idempotency-Key':key});assert.equal(replay.status,200);assert.equal(replay.data.order.id,first.data.order.id);
        const forged=await user.call('/api/checkout','POST',body,{'Idempotency-Key':crypto.randomUUID()});assert.equal(forged.status,409);
    });
    await t.test('large quantity abuse is rejected even when inventory is available',async()=>{
        const result=await user.call('/api/checkout/quote','POST',{items:[{id:'secure-item',quantity:100}]});assert.equal(result.status,409);
    });
    await t.test('new orders share a persisted per-account budget',async()=>{
        for(let i=0;i<9;i++)assert.equal((await user.call('/api/checkout','POST',{...body,note:'Separate legitimate order '+i},{'Idempotency-Key':crypto.randomUUID()})).status,201);
        const blocked=await user.call('/api/checkout','POST',{...body,note:'Excess order'},{'Idempotency-Key':crypto.randomUUID()});assert.equal(blocked.status,429);
        assert.ok(Number(blocked.response.headers.get('Retry-After'))>0);
    });
    await t.test('guest admin redirects and authorized content cannot be cached',async()=>{
        const redirect=await guest.call('/admin');assert.equal(redirect.status,302);assert.equal(redirect.response.headers.get('Cache-Control'),'no-store');
        assert.equal((await admin.call('/api/admin/login','POST',{username:'admin',password:'Unique regression admin 2026!'})).status,200);
        assert.equal((await admin.call('/admin')).response.headers.get('Cache-Control'),'no-store');
        assert.equal((await guest.call('/')).response.headers.get('X-Frame-Options'),'DENY');
        assert.doesNotMatch((await guest.call('/')).response.headers.get('Content-Security-Policy'),/script-src[^;]*cdnjs/);
    });
    await t.test('private paths, traversal, headers and sensitive pages are protected',async()=>{
        for(const route of ['/.env','/.git/config','/server.js','/package.json','/data.json','/.backup-final/admin.html','/.backup-before-demo/admin.html','/admin.html','/admin-login.html/../admin.html','/js/../server.js','/img/%2e%2e/server.js','/img/%252e%252e/server.js']){
            const result=await guest.call(route);
            if(route==='/admin-login.html/../admin.html')assert.ok([403,404].includes(result.status),route);
            else assert.ok([403,404].includes(result.status),`${route}: ${result.status}`);
        }
        for(const route of ['/profile.html','/checkout.html','/admin-login.html'])assert.equal((await guest.call(route)).response.headers.get('Cache-Control'),'no-store');
        const home=await guest.call('/');const csp=home.response.headers.get('Content-Security-Policy');
        for(const directive of ["default-src 'self'","object-src 'none'","frame-ancestors 'none'","base-uri 'self'","form-action 'self'"])assert.ok(csp.includes(directive),directive);
        assert.equal(home.response.headers.get('X-Frame-Options'),'DENY');
        assert.equal(home.response.headers.get('X-Content-Type-Options'),'nosniff');
        assert.ok(home.response.headers.get('Permissions-Policy'));
        assert.equal((await guest.call('/admin?next=https://evil.invalid')).response.headers.get('Location'),'/admin-login');
    });
    await t.test('bad JSON, oversized bodies and prototype keys fail safely',async()=>{
        const malformed=await fetch(env.base+'/api/contact',{method:'POST',headers:{Origin:env.base,'Content-Type':'application/json'},body:'{broken'});
        assert.equal(malformed.status,400);assert.doesNotMatch(await malformed.text(),/stack|server\.js|SyntaxError/i);
        const oversized=await fetch(env.base+'/api/contact',{method:'POST',headers:{Origin:env.base,'Content-Type':'application/json'},body:JSON.stringify({message:'x'.repeat(1048577)})});
        assert.equal(oversized.status,413);
        for(const key of ['__proto__','constructor','prototype']){
            const response=await fetch(env.base+'/api/contact',{method:'POST',headers:{Origin:env.base,'Content-Type':'application/json'},body:`{"${key}":{"polluted":true}}`});
            assert.equal(response.status,400,key);
        }
        assert.equal({}.polluted,undefined);
    });
    await t.test('admin image data rejects spoofed file signatures and active SVG',async()=>{
        const product={name:'Image signature regression',price:10000,stock:1,category:'fixture'};
        for(const image of [
            'data:image/png;base64,'+Buffer.from('<script>alert(1)</script>').toString('base64'),
            'data:image/svg+xml;base64,'+Buffer.from('<svg onload="alert(1)"/>').toString('base64'),
            'data:image/jpeg;base64,'+Buffer.from('not a jpeg image').toString('base64')
        ])assert.equal((await admin.call('/api/admin/products','POST',{...product,image})).status,400);
    });
    await t.test('legacy product mutation aliases use the admin CSRF context with both cookies',async()=>{
        const revision=(await admin.call('/api/admin/products/secure-item')).data.revision;const result=await admin.call('/api/products/secure-item','PUT',{price:11000,revision},{Cookie:admin.cookie+'; '+user.cookie});assert.equal(result.status,200);
        assert.equal((await user.call('/api/products/secure-item','PUT',{price:1})).status,403);
    });
    await t.test('credential and recovery inputs reject wrong types and oversized identifiers',async()=>{
        for(const [route,body]of [['/api/admin/login',{username:['admin'],password:'bad'}],['/api/auth/forgot-password/verify',{challengeId:crypto.randomUUID(),otp:123456,captchaToken:'test-valid-captcha'}]]) {
            assert.equal((await guest.call(route,'POST',body)).status,400);
        }
    });
});

test('the final active SUPER_ADMIN is protected by database constraints',()=>{
    const store=require('../lib/database.cjs').openDatabase(':memory:',path.join(root,'missing-test-seed.json'));
    try {
        const add=id=>store.db.prepare('INSERT INTO admin_accounts(id,username,password_hash,role,active,created_at,updated_at) VALUES(?,?,?, ?,1,?,?)')
            .run(id,id,'test-only-unusable-hash','SUPER_ADMIN',new Date().toISOString(),new Date().toISOString());
        add('one');
        for(const statement of ["DELETE FROM admin_accounts WHERE id='one'","UPDATE admin_accounts SET active=0 WHERE id='one'","UPDATE admin_accounts SET role='ADMIN' WHERE id='one'"])assert.throws(()=>store.db.exec(statement));
        add('two');assert.doesNotThrow(()=>store.db.exec("UPDATE admin_accounts SET active=0 WHERE id='one'"));
        assert.throws(()=>store.db.exec("DELETE FROM admin_accounts WHERE id='two'"));
    } finally {store.close();}
});

test('unsafe stored settings URLs cannot become executable DOM links',async()=>{
    const dom=new JSDOM('<!doctype html><body data-page="home"><header class="site-header"></header><main></main><a id="social"><i class="fa-telegram"></i></a></body>',{url:'https://shop.example.invalid/',runScripts:'outside-only'});
    try {
        dom.window.Web2={request:async()=>({announcement:{visible:true,text:'Text only',link:'javascript:window.pwned=1'},
            homeBanner:{enabled:true,title:'Banner',text:'Safe text',image:'javascript:window.pwned=1',link:'javascript:window.pwned=1'},
            social:{telegram:'javascript:window.pwned=1'},storeName:'Shop',contactEmail:'hello@example.invalid',logo:''})};
        if(fs.existsSync(path.join(root,'js/safe-url.js')))vm.runInContext(fs.readFileSync(path.join(root,'js/safe-url.js'),'utf8'),dom.getInternalVMContext());
        vm.runInContext(fs.readFileSync(path.join(root,'js/site.js'),'utf8'),dom.getInternalVMContext());
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(dom.window.document.querySelectorAll('[href^="javascript:"],[src^="javascript:"]').length,0);
    }finally{dom.window.close();}
});

test('static serving rejects directory junctions escaping the public asset root',async t=>{
    const express=require('express'),{publicAsset}=require('../lib/public-assets.cjs');
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'web2-public-boundary-'));
    const publicRoot=path.join(directory,'public'),privateRoot=path.join(directory,'private');
    fs.mkdirSync(publicRoot);fs.mkdirSync(privateRoot);fs.writeFileSync(path.join(privateRoot,'private.svg'),'CONFIDENTIAL');
    fs.writeFileSync(path.join(publicRoot,'safe.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');
    const junction=path.join(publicRoot,'escape');fs.symlinkSync(privateRoot,junction,process.platform==='win32'?'junction':'dir');
    const app=express();app.use('/img',publicAsset(publicRoot,['.svg']),express.static(publicRoot));
    const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
        fs.unlinkSync(junction);if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()))throw Error('Unsafe cleanup.');fs.rmSync(directory,{recursive:true,force:true});});
    const base='http://127.0.0.1:'+server.address().port;
    assert.equal((await fetch(base+'/img/safe.svg')).status,200);
    const escape=await fetch(base+'/img/escape/private.svg');assert.equal(escape.status,404);assert.doesNotMatch(await escape.text(),/CONFIDENTIAL/);
});

test('principal budgets persist across restart, reset on expiry, and keep idempotent retries free',()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'web2-budget-boundary-')),filename=path.join(directory,'test.sqlite');
    const {openDatabase}=require('../lib/database.cjs'),{persistentLimit}=require('../lib/rate-limits.cjs');
    let store=openDatabase(filename,path.join(directory,'missing.json'));
    try {
        let budget=persistentLimit(store,{scope:'test-budget',limit:2,windowMs:900000});budget('account');budget('account');store.close();
        store=openDatabase(filename,path.join(directory,'missing.json'));budget=persistentLimit(store,{scope:'test-budget',limit:2,windowMs:900000});
        assert.throws(()=>budget('account'),e=>e.status===429&&e.retryAfter>0);
        store.db.prepare('UPDATE request_budgets SET resets_at=?').run(Date.now()-1);assert.doesNotThrow(()=>budget('account'));
    }finally{store.close();if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()))throw Error('Unsafe cleanup.');fs.rmSync(directory,{recursive:true,force:true});}
});

test('production cannot silently accept orders through the test payment provider',()=>{
    const previous={NODE_ENV:process.env.NODE_ENV,PAYMENT_MODE:process.env.PAYMENT_MODE};
    try{process.env.NODE_ENV='production';process.env.PAYMENT_MODE='test';assert.throws(()=>require('../lib/payment.cjs').getPaymentProvider().createPayment({code:'TEST',total:100}),e=>e.status===503);}
    finally{for(const [name,value]of Object.entries(previous))if(value===undefined)delete process.env[name];else process.env[name]=value;}
});

test('URL validation rejects active schemes, credential URLs and local traversal',()=>{
    const safe=require('../js/safe-url.js');
    for(const value of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','//evil.invalid','https://user:password@evil.invalid/','/\\evil.invalid','/\n/evil.invalid'])assert.equal(safe.link(value),'');
    for(const value of ['img/../.env','img/.private.svg','img/private.json','data:image/svg+xml;base64,PHN2Zz4=','https://user:password@evil.invalid/image.png'])assert.equal(safe.image(value),'');
    assert.equal(safe.link('/product.html?id=one'),'/product.html?id=one');assert.equal(safe.image('img/products/mouse.svg'),'img/products/mouse.svg');
});
