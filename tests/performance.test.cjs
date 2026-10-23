'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),vm=require('node:vm');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');

test('paged APIs, hot filesystem paths, cache invalidation and security over isolated HTTP',async t=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-performance-')),database=path.join(temp,'store.sqlite'),seed=path.join(temp,'seed.json');
    fs.writeFileSync(seed,JSON.stringify({products:Array.from({length:130},(_,i)=>({id:String(i+1),name:'Performance fixture '+i,brand:'Fixture',category:'کیبورد گیمینگ',price:100000,stock:20,status:'active',description:'Long description '.repeat(250),features:['feature'],image:'img/product-placeholder.svg'})),users:[],orders:[]}));
    const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
    const base='http://127.0.0.1:'+port;
    const child=spawn(process.execPath,['--expose-gc','--require',path.join(root,'scripts/benchmark.cjs'),'server.js'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:base,ALLOWED_ORIGINS:base,TRUST_PROXY:'',DATABASE_PATH:database,SEED_DATA_PATH:seed,ADMIN_USERNAME:'perfadmin',ADMIN_PASSWORD:'Performance-admin-2026!',ADMIN_TOTP_SECRET:'',CAPTCHA_TEST_MODE:'true',SMS_PROVIDER:'mock',PAYMENT_MODE:'test',WEB2_BENCHMARK_PROBE:'1'}});
    let errors='',output='';child.stderr.on('data',d=>errors+=d);
    t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}if(path.dirname(temp)!==os.tmpdir())throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true});});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(errors||'Startup timeout')),20000);child.once('exit',code=>{clearTimeout(timer);reject(Error('Exit '+code+': '+errors));});child.stdout.on('data',d=>{output+=d;if(output.includes('Server is running')){clearTimeout(timer);resolve();}});});
    const get=url=>fetch(base+url);
    const client=()=>({cookie:'',csrf:'',async call(url,method='GET',body){const response=await fetch(base+url,{method,headers:{Origin:base,...(this.cookie?{Cookie:this.cookie}:{}),...(this.csrf?{'X-CSRF-Token':this.csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(response.headers.getSetCookie().length)this.cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');const data=response.status===204?null:await response.json();if(data?.csrfToken)this.csrf=data.csrfToken;return {response,data};}});
    const admin=client(),user=client();
    assert.equal((await admin.call('/api/admin/login','POST',{username:'perfadmin',password:'Performance-admin-2026!',captchaToken:'test-valid-captcha'})).response.status,200);
    assert.equal((await user.call('/api/auth/register','POST',{name:'Performance customer',email:'performance@example.test',phone:'09120000555',password:'Performance-user-2026!',captchaToken:'test-valid-captcha'})).response.status,201);
    const db=new DatabaseSync(database);
    try{
        await t.test('lists have bounded pages, safe summaries and validated maximums',async()=>{
            const initial=await get('/api/products');assert.equal(initial.headers.get('X-Total-Count'),'130');assert.equal((await initial.json()).length,100);assert.match(initial.headers.get('Link'),/page=2/);
            const response=await fetch(base+'/api/products?page=2&pageSize=20&view=summary',{headers:{Origin:base}}),data=await response.json();assert.match(response.headers.get('Access-Control-Expose-Headers'),/X-Total-Count/);assert.match(response.headers.get('Access-Control-Expose-Headers'),/Link/);assert.equal(data.items.length,20);assert.equal(data.total,130);assert.equal(data.pages,7);assert.equal(data.items[0].description,undefined);assert.equal(data.items[0].features,undefined);
            for(const url of ['/api/products?pageSize=101','/api/products?page=0','/api/products?pageSize=1.2','/api/admin/products?pageSize=1000000','/api/admin/orders?pageSize=101','/api/admin/users?pageSize=101','/api/admin/audit?pageSize=101','/api/orders?pageSize=101','/api/users/me/notifications?pageSize=101','/api/tickets?pageSize=101']){
                const actor=url.includes('/admin/')?admin:user;assert.equal((await actor.call(url)).response.status,400,url);
            }
            const users=await admin.call('/api/admin/users?page=1&pageSize=1');assert.equal(users.data.items.length,1);assert.doesNotMatch(JSON.stringify(users.data),/password_hash|\$2[aby]\$|addresses|sessionVersion/);
        });
        await t.test('public HTML stays bounded and contains working server pagination',async()=>{
            const html=await(await get('/products')).text();assert.equal((html.match(/class="product-card"/g)||[]).length,100);assert.match(html,/rel="next" href="\/products\?page=2"/);
            const second=await(await get('/products?page=2')).text();assert.equal((second.match(/class="product-card"/g)||[]).length,30);assert.match(second,/rel="canonical" href="[^\"]+\/products\?page=2"/);
            assert.equal((await get('/products?pageSize=1000000')).status,400);
        });
        await t.test('cached pages immediately reflect committed writes, not rolled back data',async()=>{
            const before=await(await get('/product.html?id=1')).text();assert.match(before,/Performance fixture 0/);
            db.exec('BEGIN IMMEDIATE');db.prepare("UPDATE products SET payload=json_set(payload,'$.name','Rolled back value') WHERE id='1'").run();db.exec('ROLLBACK');
            assert.doesNotMatch(await(await get('/product.html?id=1')).text(),/Rolled back value/);
            db.prepare("UPDATE products SET payload=json_set(payload,'$.name','Committed fixture') WHERE id='1'").run();
            assert.match(await(await get('/product.html?id=1')).text(),/Committed fixture/);
            const current=(await admin.call('/api/admin/products/1')).data;
            assert.equal((await admin.call('/api/admin/products/1','PUT',{stock:19})).response.status,409);
            assert.equal((await admin.call('/api/admin/products/1','PUT',{stock:19,revision:current.revision})).response.status,200);
            assert.match(await(await get('/product.html?id=1')).text(),/۱۹ عدد موجود/);
        });
        await t.test('cold page rendering and public API reads avoid synchronous filesystem work',async()=>{
            let id=0;
            const sample=reset=>new Promise(resolve=>{const n=++id;function receive(m){if(m.id===n){child.off('message',receive);resolve(m);}}child.on('message',receive);child.send({type:'benchmark-sample',id:n,reset});});
            await sample(true);await(await get('/products?page=1')).arrayBuffer();await(await get('/api/products/1')).arrayBuffer();const metrics=await sample(false);assert.equal(metrics.syncFs,0);
        });
        await t.test('private responses remain uncacheable, bodies stay bounded and storage stays sound',async()=>{
            const asset=await get('/script.js'),etag=asset.headers.get('ETag');assert.match(asset.headers.get('Cache-Control'),/must-revalidate/);assert.ok(etag);assert.equal((await fetch(base+'/script.js',{headers:{'If-None-Match':etag,'Cache-Control':'max-age=0'}})).status,304);
            for(const url of ['/api/users/me','/api/orders','/api/admin/users','/api/admin/audit']){const c=url.includes('/admin/')?admin:user;assert.match((await c.call(url)).response.headers.get('Cache-Control'),/no-store/);}
            const tooLarge=await fetch(base+'/api/contact',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({message:'x'.repeat(1024*1024)})});assert.equal(tooLarge.status,413);assert.doesNotMatch(await tooLarge.text(),/stack|SyntaxError|SQLITE/);
            assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare("SELECT count(*) n FROM products WHERE json_extract(payload,'$.stock')<0").get().n,0);assert.doesNotMatch(errors,/unhandled-rejection|uncaught-exception/);
        });
    }finally{db.close();}
});

test('session reads coalesce and cancellation stays recognizable',async()=>{
    let finish,calls=0;
    const context=vm.createContext({URL,Headers,Event,localStorage:{removeItem(){}},location:{href:'http://localhost:3000/',origin:'http://localhost:3000'},addEventListener(){},dispatchEvent(){},fetch:async()=>{calls++;return new Promise(resolve=>finish=resolve);}});context.window=context;
    vm.runInContext(fs.readFileSync(path.join(root,'js/session.js'),'utf8'),context);
    const first=context.Web2.refresh(),second=context.Web2.refresh();assert.equal(calls,1);finish(Response.json({user:null,csrfToken:null}));await Promise.all([context.Web2.ready,first,second]);
    const controller=new AbortController();
    // The native fetch mock is replaced through a separate isolated session.
    const aborted=vm.createContext({URL,Headers,Event,localStorage:{removeItem(){}},location:{href:'http://localhost:3000/',origin:'http://localhost:3000'},addEventListener(){},dispatchEvent(){},fetch:async(_url,options)=>{if(options.signal)throw Object.assign(Error('Aborted'),{name:'AbortError'});return Response.json({user:null,csrfToken:null});}});aborted.window=aborted;vm.runInContext(fs.readFileSync(path.join(root,'js/session.js'),'utf8'),aborted);await aborted.Web2.ready;
    await assert.rejects(aborted.Web2.request('/api/admin/products',{signal:controller.signal}),{name:'AbortError'});
});

test('only verified asset fingerprints receive immutable caching',()=>{
    const {assetCache,fingerprint}=require('../lib/asset-cache.cjs');
    const apply=assetCache(root,['script.js']),version=fingerprint(fs.readFileSync(path.join(root,'script.js')));
    for(const [v,immutable]of [[version,true],['arbitrary',false],['',false]]){const headers={},res={req:{originalUrl:'/script.js?v='+v},setHeader:(k,value)=>headers[k]=value};apply(res,path.join(root,'script.js'));assert.equal(headers['Cache-Control'].includes('immutable'),immutable);}
});

test('superseded admin product searches abort and cannot replace newer rows',async()=>{
    const nodes=new Map(),requests=[];
    nodes.set('adminProductSearch',{value:'old'});nodes.set('product-list',{after:node=>nodes.set(node.id,node)});
    const context=vm.createContext({console,URLSearchParams,AbortController,localStorage:{getItem(){return null;},setItem(){},removeItem(){}},document:{readyState:'loading',body:{dataset:{}},addEventListener(){},getElementById:id=>nodes.get(id)||null,querySelector(){return null;},querySelectorAll(){return [];},createElement(){return {setAttribute(){}};}},window:{addEventListener(){},setTimeout,clearTimeout,location:{search:''}}});
    vm.runInContext(fs.readFileSync(path.join(root,'script.js'),'utf8'),context);
    context.adminRequest=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));vm.runInContext('renderAdminProducts=()=>{};',context);
    const first=vm.runInContext('loadAdminProductsFromApi()',context),duplicate=vm.runInContext('loadAdminProductsFromApi()',context);assert.equal(requests.length,1);
    nodes.get('adminProductSearch').value='new';const second=vm.runInContext('loadAdminProductsFromApi()',context);assert.equal(requests.length,2);assert.equal(requests[0].options.signal.aborted,true);
    requests[1].resolve({items:[{id:'new',name:'New result',price:100,stock:1}],total:1,pages:1});await second;
    requests[0].resolve({items:[{id:'old',name:'Stale result',price:100,stock:1}],total:1,pages:1});await Promise.all([first,duplicate]);assert.equal(vm.runInContext('products[0].id',context),'new');
});

test('bounded catalog pages load once, keep off-page cart items and render at most 100 cards',async()=>{
    const {JSDOM,VirtualConsole}=require('jsdom');
    const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost:3000/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()}),w=dom.window,requests=[];
    try{
        const products=Array.from({length:130},(_,i)=>({id:String(i+1),name:'Fixture '+i,price:100,stock:5,shortDescription:'Summary',description:'Full detail',category:'کیبورد گیمینگ'}));
        w.fetch=async url=>{requests.push(String(url));const parsed=new URL(url,w.location.href),page=Number(parsed.searchParams.get('page')||1);return parsed.search?Response.json({items:products.slice(100),total:130,page,pageSize:100,pages:2}):Response.json(products.slice(0,100),{headers:{'X-Total-Count':'130'}});};
        w.Element.prototype.scrollIntoView=function(){};w.localStorage.setItem('web2_cart',JSON.stringify([{id:'130',quantity:2}]));
        vm.runInContext(fs.readFileSync(path.join(root,'script.js'),'utf8'),dom.getInternalVMContext());vm.runInContext('initializeStore.initialized=true;',dom.getInternalVMContext());
        await Promise.all([vm.runInContext('loadProductsFromApi()',dom.getInternalVMContext()),vm.runInContext('loadProductsFromApi()',dom.getInternalVMContext())]);
        assert.equal(requests.length,2);assert.equal(vm.runInContext('products.length',dom.getInternalVMContext()),130);
        vm.runInContext('setupProductControls();setupProductControls();renderProducts();',dom.getInternalVMContext());assert.equal(w.document.querySelectorAll('#productGrid .product-card').length,100);
        const image=w.document.querySelector('#productGrid img');assert.equal(image.getAttribute('loading'),'lazy');assert.equal(image.width,480);assert.equal(image.height,360);
        w.document.querySelector('[data-catalog-page="next"]').click();assert.equal(w.document.querySelectorAll('#productGrid .product-card').length,30);assert.equal(vm.runInContext('getCart()[0].id',dom.getInternalVMContext()),'130');assert.equal(vm.runInContext('getCart()[0].quantity',dom.getInternalVMContext()),2);
    }finally{w.close();}
});