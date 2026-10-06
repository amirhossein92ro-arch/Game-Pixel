'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'script.js'),'utf8');
function page(file='product.html',search='?id=1') {
    const errors=[],dom=new JSDOM(fs.readFileSync(path.join(root,file),'utf8'),{url:'http://localhost/'+file+search,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
    const w=dom.window;
    w.addEventListener('error',e=>errors.push(e.message));
    vm.runInContext(source,dom.getInternalVMContext());
    // Explicit initialization below lets tests control response timing and failures.
    vm.runInContext('initializeStore.initialized=true;',dom.getInternalVMContext());
    const run=code=>vm.runInContext(code,dom.getInternalVMContext());
    return {dom,w,run,errors};
}
test('empty or corrupt fallback never erases local products, and fresh storage seeds defaults',async()=>{
    for(const bad of ['[]','{bad','[{}]','null']) {
        const p=page('product.html','?id=20');
        try {
            p.w.localStorage.setItem('gaming_store_products_fallback',bad);
            p.w.localStorage.setItem('gaming_store_products',JSON.stringify([{id:20,name:'Local product',price:200,stock:4}]));
            p.w.fetch=async()=>{throw Error('offline');};
            await p.run('loadProductsFromApi()');
            assert.equal(p.run('getProduct(20).name'),'Local product');
            assert.ok(!p.w.document.querySelector('.not-found-state'));
            p.w.localStorage.setItem('gaming_store_products',bad);
            await p.run('loadProductsFromApi()');
            assert.equal(p.run('getProduct(20).price'),200);
        } finally {p.w.close();}
        const fresh=page('product.html','?id=60');
        try {
            fresh.w.localStorage.setItem('gaming_store_products_fallback',bad);
            fresh.w.localStorage.setItem('gaming_store_products',bad);
            fresh.w.localStorage.setItem('products',JSON.stringify([{id:999,name:'Legacy valid product',price:100,stock:3}]));
            fresh.w.fetch=async()=>{throw Error('offline');};
            await fresh.run('loadProductsFromApi()');
            assert.equal(fresh.run('getProduct(60).id'),'60');
            assert.equal(fresh.run('getProduct(999).name'),'Legacy valid product');
            assert.equal(fresh.w.document.querySelector('.detail-info h1').textContent,fresh.run('getProduct(60).name'));
        } finally {fresh.w.close();}
    }
});
test('partial fallback retains local and all legacy IDs without replacing current values',async()=>{
    const p=page('product.html','?id=40');
    try {
        const product=(id,name)=>({id,name,price:100,stock:3});
        p.w.localStorage.setItem('gaming_store_products_fallback',JSON.stringify([product(20,'Snapshot')]));
        p.w.localStorage.setItem('gaming_store_products',JSON.stringify([product(40,'Local')]));
        p.w.localStorage.setItem('products',JSON.stringify([product(80,'Legacy one')]));
        p.w.localStorage.setItem('store_products',JSON.stringify([product(90,'Legacy two')]));
        p.run('products=mergeProducts([{id:20,name:"Current",price:200,stock:2}]);renderProductDetail()');
        assert.ok(p.w.document.querySelector('.loading-state'));
        p.w.fetch=async()=>{throw Error('offline');};
        await p.run('loadProductsFromApi()');
        for(const id of [20,40,80,90]) assert.equal(p.run(`getProduct(${id}).id`),String(id));
        assert.equal(p.run('getProduct(20).name'),'Current');
        assert.equal(p.w.document.querySelector('.detail-info h1').textContent,'Local');
    } finally {p.w.close();}
});

test('opaque IDs remain distinct and cache migration leaves cart and user data intact',async()=>{
    const ids=['01','1','cm123abc','123e4567-e89b-12d3-a456-426614174000','sku/part?x="quoted"'];
    const p=page();
    try {
        const api=ids.map(id=>({id,name:id,price:100,stock:5}));
        p.w.localStorage.setItem('products',JSON.stringify([{id:1234567890123,name:'Old random cache',price:1}]));
        const oldCart=JSON.stringify([{id:1,quantity:2}]);
        p.w.localStorage.setItem('web2_cart',oldCart);
        p.w.localStorage.setItem('user','preserved');
        p.w.fetch=async()=>Response.json(api);
        await p.run('loadProductsFromApi()');
        assert.equal(p.w.localStorage.getItem('web2_cart'),oldCart);
        assert.equal(p.w.localStorage.getItem('user'),'preserved');
        assert.deepEqual(JSON.parse(p.w.localStorage.getItem('products')).map(p=>p.id),ids);
        p.run('getCurrentUser=()=>({id:"test-user"});setupGlobalActions()');
        for(const id of ids) {
            assert.equal(p.run(`getProduct(${JSON.stringify(id)}).id`),id);
            p.dom.reconfigure({url:`http://localhost/product.html?id=${encodeURIComponent(id)}`});
            p.run('renderProductDetail();saveCart([])');
            assert.equal(p.w.document.querySelector('.detail-info h1').textContent,id);
            p.w.document.querySelector('[data-add-to-cart]').click();
            assert.equal(p.run('getCart()[0].id'),id);
            p.run(`changeCartQuantity(${JSON.stringify(id)},1)`);
            assert.equal(p.run('getCart()[0].quantity'),2);
            p.run(`removeCartItem(${JSON.stringify(id)})`);
            assert.equal(p.run('getCart().length'),0);
        }
        assert.equal(p.run('normalizeProduct({name:"No ID",price:100})'),null);
        assert.equal(p.run('getProduct(1).id'),'1');
        assert.equal(p.run('getProduct("01").id'),'01');
    } finally {p.w.close();}
});

test('catalog omissions use single-product API; only JSON 404 means not found',async()=>{
    for(const outcome of ['found','404','500','html']) {
        const p=page('product.html','?id=omitted');
        try {
            p.w.fetch=async url=>{
                if(String(url).endsWith('/api/products')) return Response.json([{id:'listed',name:'Listed',price:100,stock:3}]);
                if(outcome==='found')return Response.json({id:'omitted',name:'Recovered from backend',price:100,stock:3});
                if(outcome==='html')return new Response('<html>Wrong server</html>',{status:404,headers:{'Content-Type':'text/html'}});
                return Response.json({error:'Server response'},{status:Number(outcome)});
            };
            await p.run('loadProductsFromApi()');
            const text=p.w.document.getElementById('productDetail').textContent;
            if(outcome==='found')assert.equal(p.w.document.querySelector('.detail-info h1').textContent,'Recovered from backend');
            else if(outcome==='404')assert.match(text,/این محصول در دسترس نیست/);
            else {assert.match(text,/اطلاعات محصول فعلاً قابل دریافت نیست/);assert.doesNotMatch(text,/این محصول در دسترس نیست/);}
        } finally {p.w.close();}
    }
});

test('cache sync migrates unambiguous cart identities and preserves unresolved items',async()=>{
    const p=page('index.html','');
    try {
        p.w.localStorage.setItem('gaming_store_products',JSON.stringify([{id:999,name:'Same product',brand:'Brand',price:100,stock:3}]));
        p.w.localStorage.setItem('web2_cart',JSON.stringify([{id:999,quantity:2},{id:'unknown',quantity:1}]));
        p.w.fetch=async()=>Response.json([{id:'real-id',name:'Same product',brand:'Brand',price:100,stock:3}]);
        await p.run('loadProductsFromApi()');
        assert.equal(JSON.parse(p.w.localStorage.getItem('web2_cart'))[0].id,'real-id');
        assert.equal(p.run('getCart()[0].id'),'real-id');
        assert.equal(JSON.parse(p.w.localStorage.getItem('web2_cart_unresolved'))[0].id,'unknown');
        assert.equal(JSON.parse(p.w.localStorage.getItem('gaming_store_products_unresolved'))[0].id,'999');
    }finally{p.w.close();}
});

test('an old cached detail ID migrates only after backend 404 and canonical verification',async()=>{
    const p=page('product.html','?id=999');
    try {
        const real={id:'real-id',name:'Same product',brand:'Brand',price:100,stock:3};
        p.w.localStorage.setItem('gaming_store_products',JSON.stringify([{...real,id:999}]));
        const calls=[];
        p.w.fetch=async url=>{
            calls.push(String(url));
            if(String(url).endsWith('/api/products'))return Response.json([real]);
            if(String(url).endsWith('/999'))return Response.json({error:'Not found'},{status:404});
            return Response.json(real);
        };
        await p.run('loadProductsFromApi()');
        assert.equal(new URL(p.w.location.href).searchParams.get('id'),'real-id');
        assert.equal(p.w.document.querySelector('.detail-info h1').textContent,'Same product');
        assert.ok(calls.some(url=>url.endsWith('/999')));
        assert.ok(calls.some(url=>url.endsWith('/real-id')));
    }finally{p.w.close();}
});

test('central API configuration routes all API requests and preserves credential/CSRF scope',async()=>{
    const p=page(),calls=[];
    try {
        p.dom.reconfigure({url:'http://127.0.0.1:5500/product.html?id=20'});
        p.w.Headers=Headers;
        p.w.fetch=async(url,options)=>{calls.push({url,options});return Response.json({user:null,csrfToken:'test-csrf'});};
        vm.runInContext(fs.readFileSync(path.join(root,'js/api-config.js'),'utf8'),p.dom.getInternalVMContext());
        vm.runInContext(fs.readFileSync(path.join(root,'js/session.js'),'utf8'),p.dom.getInternalVMContext());
        await p.w.Web2.ready;
        assert.equal(p.w.Web2Config.API_BASE_URL,'http://127.0.0.1:3000');
        await p.w.Web2.request('/api/contact',{method:'POST',body:'{}'});
        const request=calls.at(-1);
        assert.equal(request.url,'http://127.0.0.1:3000/api/contact');
        assert.equal(request.options.credentials,'include');
        assert.equal(request.options.headers.get('X-CSRF-Token'),'test-csrf');
        await p.w.fetch('https://example.invalid/api/external');
        assert.equal(calls.at(-1).options.headers,undefined);
        assert.equal(calls.at(-1).url,'https://example.invalid/api/external');
    } finally {p.w.close();}
});
test('API snapshot wins over stale storage, concurrent reloads and empty catalogs',async()=>{
    const p=page(),api=[{id:1,name:'API product',price:900,stock:7}];
    try {
        p.w.localStorage.setItem('gaming_store_products',JSON.stringify([{id:1,name:'stale',price:1,stock:1},{id:999,name:'ghost',price:1}]));
        let calls=0;
        p.w.fetch=async()=>{calls++;return {ok:true,json:async()=>api};};
        await Promise.all([p.run('loadProductsFromApi()'),p.run('loadProductsFromApi()')]);
        assert.equal(calls,1);
        assert.equal(p.run('getProduct(1).name'),'API product');
        assert.equal(p.run('getProduct(999)'),undefined);
        p.run('setupStorageSync();');
        p.w.localStorage.setItem('gaming_store_products','[]');
        await p.w.dispatchEvent(new p.w.StorageEvent('storage',{key:'gaming_store_products'}));
        await p.run('loadProductsFromApi()');
        assert.equal(p.run('getProduct(1).price'),900);
        p.w.fetch=async()=>{throw Error('offline');};
        p.w.localStorage.setItem('gaming_store_products_fallback','[]');
        await p.run('loadProductsFromApi()');
        assert.equal(p.run('getProduct(1).stock'),7);
        assert.equal(p.run('normalizeProduct({name:"missing ID"})'),null);
        for(const id of [null,'',0,-1,1.5,'broken'])assert.equal(p.run(`getProduct(${JSON.stringify(id)})`),undefined);
        p.w.fetch=async url=>String(url).endsWith('/api/products')?Response.json([]):Response.json({error:'Product not found'},{status:404});
        await p.run('loadProductsFromApi()');
        assert.equal(p.run('getProducts().length'),0);
        p.run('renderProductDetail()');
        assert.match(p.w.document.getElementById('productDetail').textContent,/این محصول در دسترس نیست/);
        assert.deepEqual(p.errors,[]);
    } finally {p.w.close();}
});
test('offline cache preserves IDs; an uncached product is not falsely reported as deleted',async()=>{
    const p=page('product.html','?id=999');
    try {
        p.w.localStorage.setItem('gaming_store_products_fallback',JSON.stringify([{id:1,name:'cached',price:100,stock:2}]));
        p.w.fetch=async()=>{throw Error('offline');};
        await p.run('loadProductsFromApi()');
        p.run('renderProductDetail()');
        assert.match(p.w.document.getElementById('productDetail').textContent,/اطلاعات محصول فعلاً قابل دریافت نیست/);
        assert.equal(p.run('getProduct(1).id'),'1');
        p.dom.reconfigure({url:'http://localhost/product.html?id=1'});
        p.run('renderProductDetail()');
        assert.equal(p.w.document.querySelector('.detail-info h1').textContent,'cached');
    } finally {p.w.close();}
});
test('startup waits for API before exposing stale cards or normalizing a saved cart',async()=>{
    for(const file of ['index.html','product.html','checkout.html']) {
        const p=page(file);
        try {
            let resolve;
            p.w.fetch=()=>new Promise(r=>{resolve=r;});
            p.w.localStorage.setItem('gaming_store_products',JSON.stringify([{id:1,name:'OLD',price:1,stock:1}]));
            p.w.localStorage.setItem('web2_cart',JSON.stringify([{id:1,quantity:2}]));
            const pending=p.run('initializeStore.initialized=false;initializeStore()');
            assert.equal(p.run('products.length'),0);
            if(file==='product.html') {
                p.run('renderProductDetail()');
                assert.ok(p.w.document.querySelector('#productDetail .loading-state'));
                assert.ok(!p.w.document.querySelector('#productDetail .not-found-state'));
            }
            assert.equal(JSON.parse(p.w.localStorage.getItem('web2_cart'))[0].quantity,2);
            assert.ok(!p.w.document.querySelector('.product-card-link'));
            resolve({ok:true,json:async()=>[{id:1,name:'API product',price:100,stock:5}]});
            await pending;
            assert.equal(p.run('getProduct(1).name'),'API product');
            assert.equal(p.run('getCart()[0].quantity'),2);
            assert.equal(p.run('getCartTotals().subtotal'),200);
            assert.deepEqual(p.errors,[]);
        } finally {p.w.close();}
    }
});
test('unresolved catalog cannot erase the customer cart during admin startup',()=>{
    const p=page('admin.html','');
    try {
        const saved=JSON.stringify([{id:1,quantity:2}]);
        p.w.localStorage.setItem('web2_cart',saved);
        p.run('refreshCartUI()');
        assert.equal(p.w.localStorage.getItem('web2_cart'),saved);
    } finally {p.w.close();}
});
test('all database products: API, home/search/category links, detail, cart and persistent admin ID',async()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-products-')),database=path.join(temp,'test.sqlite');
    const seedPath=path.join(temp,'seed.json'),seed=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8'));
    const opaqueIds=['cm123abc-stable','123e4567-e89b-12d3-a456-426614174000'];
    seed.products.push(...opaqueIds.map((id,index)=>({...seed.products[0],id,name:`Opaque ID product ${index}`,stock:10})));
    fs.writeFileSync(seedPath,JSON.stringify(seed));
    const port=29000+Math.floor(Math.random()*1000),base=`http://localhost:${port}`,windows=[];
    let child;
    async function start(){
        child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DATABASE_PATH:database,SEED_DATA_PATH:seedPath,ADMIN_PASSWORD:'test-products-password-2026',APP_ORIGIN:base,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
        await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(Error('startup timeout')),15000);
            child.once('exit',code=>{clearTimeout(timer);reject(Error('startup '+code));});
            child.stdout.on('data',d=>{if(String(d).includes('Server is running')){clearTimeout(timer);resolve();}});
            child.stderr.on('data',()=>{});
        });
    }
    async function stop(){if(child&&child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill();await ended;}child=null;}
    let cookie='',csrf='';
    async function request(url,method='GET',body){
        const r=await fetch(base+url,{method,headers:{Origin:base,Cookie:cookie,...(csrf?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
        if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
        const data=r.status===204?null:await r.json();if(data?.csrfToken)csrf=data.csrfToken;
        assert.ok(r.ok,`${method} ${url}: ${r.status}`);return data;
    }
    try {
        await start();
        const catalog=await request('/api/products');
        assert.equal(catalog.length,71);
        assert.equal(catalog[0].id,'1');
        assert.ok(catalog.every(p=>typeof p.id==='string'));
        console.log(`Real API first ID: ${JSON.stringify(catalog[0].id)}; direct URL: ${base}/product.html?id=${catalog[0].id}`);
        const liveOrigin='http://127.0.0.1:5500';
        const preflight=await fetch(base+'/api/auth/login',{method:'OPTIONS',headers:{Origin:liveOrigin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-csrf-token'}});
        assert.equal(preflight.status,204);
        assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),liveOrigin);
        assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),'true');
        const blocked=await fetch(base+'/api/products',{headers:{Origin:'https://example.invalid'}});
        assert.equal(blocked.headers.get('Access-Control-Allow-Origin'),null);
        for(const id of ['1','2','3','8','10','20','40','60',...opaqueIds]){
            assert.equal((await fetch(`${base}/product.html?id=${encodeURIComponent(id)}`)).status,200);
            const direct=page('product.html',`?id=${id}`);windows.push(direct.w);
            direct.dom.reconfigure({url:`${liveOrigin}/product.html?id=${id}`});
            vm.runInContext(fs.readFileSync(path.join(root,'js/api-config.js'),'utf8').replace('DEVELOPMENT_API_PORT = 3000',`DEVELOPMENT_API_PORT = ${port}`),direct.dom.getInternalVMContext());
            direct.w.fetch=async(url,options)=>{
                assert.equal(new URL(url).port,String(port));
                return fetch(url,{...options,headers:{...options.headers,Origin:liveOrigin}});
            };
            await direct.run('initializeStore.initialized=false;initializeStore()');
            assert.equal(direct.w.document.querySelector('.detail-info h1').textContent,catalog.find(p=>p.id===String(id)).name);
            assert.equal(direct.run('productsLoading'),false);
            assert.equal(direct.run('productsLoaded'),true);
            assert.equal(direct.run('productsError'),null);
        }
        const home=page('index.html',''),detail=page(),cart=page('cart.html','');windows.push(home.w,detail.w,cart.w);
        for(const p of [home,detail,cart]){
            p.w.fetch=async(url,options)=>fetch(new URL(url,base),options);
            // Deliberately seed every page with stale data to exercise API priority.
            p.w.localStorage.setItem('gaming_store_products',JSON.stringify([{id:1,name:'OLD',price:1,stock:1},{id:999999,name:'ghost',price:1,stock:1}]));
            await p.run('loadProductsFromApi()');
            p.run('getCurrentUser=()=>({id:"test-user",name:"Test"});');
        }
        home.run('renderHomeDiscovery();renderProducts();');
        const links=[...home.w.document.querySelectorAll('#productGrid .product-card-link')];
        assert.equal(links.length,catalog.length);
        for(const product of catalog){
            const serverProduct=await request('/api/products/'+product.id);
            assert.equal(serverProduct.name,product.name);assert.equal(serverProduct.price,product.price);assert.equal(serverProduct.stock,product.stock);
            const link=links.find(a=>new URL(a.href).searchParams.get('id')===String(product.id));assert.ok(link);
            detail.dom.reconfigure({url:link.href});detail.run('renderProductDetail()');
            assert.equal(detail.w.document.querySelector('.detail-info h1').textContent,product.name);
            assert.equal(detail.run(`getProduct(${JSON.stringify(product.id)}).price`),product.price);
            assert.match(detail.w.document.querySelector('.detail-stock-badge').textContent,new RegExp(detail.run(`formatNumber(${product.stock})`)));
            assert.ok(detail.w.document.querySelector('.detail-price').textContent.includes(detail.run(`formatPrice(getUnitPrice(getProduct(${JSON.stringify(product.id)})))`)));
            home.w.document.getElementById('productSearch').value=product.name;
            home.run('renderProducts()');
            assert.ok([...home.w.document.querySelectorAll('#productGrid .product-card-link')].some(a=>a.href===link.href));
            home.w.document.getElementById('productSearch').value='';home.w.document.getElementById('categoryFilter').value=product.category;home.run('renderProducts()');
            assert.ok([...home.w.document.querySelectorAll('#productGrid .product-card-link')].some(a=>a.href===link.href));
            home.w.document.getElementById('categoryFilter').value='all';
            detail.run(`saveCart([]);setupGlobalActions();`);
            detail.w.document.querySelector('[data-add-to-cart]').click();
            assert.equal(detail.run('getCart()[0].id'),product.id);
            cart.w.localStorage.setItem('web2_cart',detail.w.localStorage.getItem('web2_cart'));cart.run('renderCart()');
            assert.ok(cart.w.document.querySelector(`a[href="product.html?id=${product.id}"]`));
            assert.equal(cart.run('getCartTotals().subtotal'),detail.run(`getUnitPrice(getProduct(${JSON.stringify(product.id)}))`));
            if (['1','2','3','8','10','20','40','60',...opaqueIds].includes(product.id)) {
                for (const file of ['cart.html','checkout.html']) {
                    const refresh=page(file,''); windows.push(refresh.w);
                    refresh.w.localStorage.setItem('web2_cart',detail.w.localStorage.getItem('web2_cart'));
                    refresh.w.fetch=async(url,options)=>fetch(new URL(url,base),options);
                    await refresh.run('initializeStore.initialized=false;initializeStore()');
                    assert.equal(refresh.run('getCart()[0].id'),product.id);
                    assert.equal(refresh.run('getCartTotals().subtotal'),detail.run('getCartTotals().subtotal'));
                }
            }
        }
        detail.dom.reconfigure({url:'http://localhost/product.html?id=999999'});await detail.run('renderProductDetail()');
        assert.match(detail.w.document.getElementById('productDetail').textContent,/این محصول در دسترس نیست/);
        for(const p of [home,detail,cart])assert.deepEqual(p.errors,[]);
        await request('/api/auth/register','POST',{name:'Stable ID Test',email:'stable@example.invalid',phone:'09123456789',password:'Stable-Test-Password-2026'});
        const lines=['1','2','3','8','10','20','40','60',...opaqueIds].map(id=>({id,quantity:1}));
        const quote=await request('/api/checkout/quote','POST',{items:lines});
        assert.deepEqual(quote.items.map(p=>p.id),lines.map(p=>p.id));
        const orderBody={items:lines,recipientName:'Stable ID Test',recipientPhone:'09123456789',recipientAddress:'Test address for stable product identities',isAgreed:true};
        const orderResponse=await fetch(base+'/api/checkout',{method:'POST',headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json','Idempotency-Key':'stable-product-id-order-2026'},body:JSON.stringify(orderBody)});
        assert.equal(orderResponse.status,201);
        const {order}=await orderResponse.json();
        assert.deepEqual(order.items.map(p=>p.id),lines.map(p=>p.id));
        const savedOrder=await request('/api/orders/'+order.id);
        assert.deepEqual(savedOrder.items.map(p=>p.id),lines.map(p=>p.id));
        await request('/api/users/me/wishlist/'+opaqueIds[1],'PUT',{});
        assert.ok((await request('/api/users/me/wishlist')).some(row=>row.productId===opaqueIds[1]));
        await request('/api/users/me/wishlist/'+opaqueIds[1],'DELETE',{});
        await request('/api/admin/login','POST',{username:'admin',password:'test-products-password-2026'});
        const opaqueEdited=await request('/api/admin/products/'+opaqueIds[1],'PUT',{price:234000});
        assert.equal(opaqueEdited.id,opaqueIds[1]);
        const created=await request('/api/admin/products','POST',{id:999999,name:'Persistent Test Product',price:123000,stock:12,category:'Test'});
        assert.notEqual(created.id,'999999','ID is allocated by the database-backed server sequence');
        const edited=await request('/api/admin/products/'+created.id,'PUT',{price:234000,stock:8});assert.equal(edited.id,created.id);
        await stop();await start();cookie='';csrf='';
        const after=await request('/api/products/'+created.id);assert.equal(after.id,created.id);assert.equal(after.price,234000);assert.equal(after.stock,8);
        const reloaded=await request('/api/products');
        assert.deepEqual(reloaded.filter(p=>p.id!==created.id).map(p=>[p.id,p.name]),catalog.map(p=>[p.id,p.name]));
        await detail.run('loadProductsFromApi()');detail.dom.reconfigure({url:`http://localhost/product.html?id=${created.id}`});detail.run('renderProductDetail()');
        assert.equal(detail.w.document.querySelector('.detail-info h1').textContent,created.name);
        await stop();
        // A real stopped server, not only a mocked fetch failure.
        await detail.run('loadProductsFromApi()');
        assert.equal(detail.run(`getProduct(${JSON.stringify(created.id)}).name`),created.name);
        assert.ok(detail.run('productsError !== null'));
        const offline=page('product.html','?id=60');windows.push(offline.w);
        offline.w.localStorage.setItem('gaming_store_products_fallback','[]');
        offline.w.fetch=async(url,options)=>fetch(new URL(url,base),options);
        await offline.run('initializeStore.initialized=false;initializeStore()');
        assert.equal(offline.w.document.querySelector('.detail-info h1').textContent,offline.run('getProduct(60).name'));
        console.log(`Verified ${catalog.length} products including UUID/string IDs, 10 direct refreshes, cart/checkout refresh, wishlist and persisted order IDs.`);
    } finally {for(const w of windows)w.close();await stop();fs.rmSync(temp,{recursive:true,force:true});}
});
