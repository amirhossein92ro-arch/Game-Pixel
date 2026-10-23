'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),vm=require('node:vm');
const {spawn}=require('node:child_process');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label='UI state'){for(let i=0;i<300;i++){if(await fn())return;await pause(20);}throw Error('Timed out: '+label);}

test('phase 10 shopping UX uses real sessions, server quotes and accessible local controls',async t=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-shopping-ux-'));
    const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    const base='http://127.0.0.1:'+port,password='Shopping-UX-test-password-2026!';
    const server=spawn(process.execPath,['server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:base,ALLOWED_ORIGINS:'',TRUST_PROXY:'',DATABASE_PATH:path.join(temp,'test.sqlite'),SEED_DATA_PATH:path.join(root,'data.json'),ADMIN_USERNAME:'ux-admin',ADMIN_PASSWORD:password,ADMIN_TOTP_SECRET:'',CAPTCHA_TEST_MODE:'true',SMS_PROVIDER:'mock',PAYMENT_MODE:'test'},stdio:['ignore','pipe','pipe']});
    const windows=[],errors=[],requests=[],sources=new Map();let gate=null;
    const client=()=>({cookie:'',csrf:'',async fetch(input,options={}){
        const url=new URL(typeof input==='string'?input:input.url,base),headers=new Headers(options.headers);headers.set('Origin',base);if(this.cookie)headers.set('Cookie',this.cookie);
        const method=(options.method||'GET').toUpperCase();requests.push({path:url.pathname,method,body:options.body});
        if(gate&&gate.path===url.pathname&&gate.method===method){gate.entered=true;await gate.promise;}
        const response=await fetch(url,{...options,headers});const cookies=response.headers.getSetCookie();if(cookies.length)this.cookie=cookies.map(c=>c.split(';')[0]).join('; ');return response;
    },async call(url,method='GET',body){const response=await this.fetch(url,{method,headers:{'Content-Type':'application/json',...(this.csrf?{'X-CSRF-Token':this.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=response.status===204?null:await response.json();if(data?.csrfToken)this.csrf=data.csrfToken;return {response,data};}});
    const buyer=client(),admin=client(),guest=client();
    function hold(path,method='POST'){let release;const promise=new Promise(resolve=>release=resolve);gate={path,method,promise,release,entered:false};return gate;}
    async function page(route,session=buyer){
        const response=await session.fetch(route);assert.equal(response.status,200,route);
        const console=new VirtualConsole();console.on('jsdomError',e=>{if(!/navigation/.test(e.message))errors.push(e.message);});
        const dom=new JSDOM(await response.text(),{url:base+route,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;windows.push(w);
        w.Headers=Headers;w.TextEncoder=TextEncoder;w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.fetch=session.fetch.bind(session);
        w.Element.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
        w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
        const scripts=[...w.document.querySelectorAll('script[src]')].map(tag=>tag.getAttribute('src')).filter(src=>!/^https?:/.test(src));
        for(const src of scripts){const filename=new URL(src,base+route).pathname.slice(1);if(!sources.has(filename))sources.set(filename,fs.readFileSync(path.join(root,filename),'utf8'));}
        for(const src of scripts){const filename=new URL(src,base+route).pathname.slice(1);vm.runInContext(sources.get(filename),dom.getInternalVMContext(),{filename});}
        const run=code=>vm.runInContext(code,dom.getInternalVMContext());
        await w.Web2.ready;await until(()=>run('productsLoaded')||w.document.body.dataset.page==='admin','catalog');await w.Web2Site?.ready;
        return {w,run,dom};
    }
    const submit=(w,form)=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    t.after(async()=>{gate?.release();for(const w of windows)w.close();if(server.exitCode===null&&server.signalCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}const resolved=fs.realpathSync(temp);if(path.dirname(resolved)!==fs.realpathSync(os.tmpdir())||!path.basename(resolved).startsWith('web2-shopping-ux-'))throw Error('Unsafe UX cleanup.');fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
    await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('UX server startup timeout')),20000);server.stdout.on('data',chunk=>{output+=chunk;if(output.includes('Server is running')){clearTimeout(timer);resolve();}});server.stderr.on('data',()=>{});server.once('exit',code=>{clearTimeout(timer);reject(Error('UX server exited '+code));});});
    assert.equal((await buyer.call('/api/auth/register','POST',{name:'خریدار رابط کاربری',phone:'09121117891',email:'shopping-ux@example.invalid',password,captchaToken:'test-valid-captcha'})).response.status,201);
    assert.equal((await admin.call('/api/admin/login','POST',{username:'ux-admin',password})).response.status,200);
    const settings=(await admin.call('/api/admin/settings')).data;assert.equal((await admin.call('/api/admin/settings','PUT',{...settings,shippingCost:25000,freeShippingThreshold:null})).response.status,200);
    assert.equal((await admin.call('/api/admin/discounts','POST',{code:'UX-CAP',type:'percent',value:50,maxDiscount:1000,active:true})).response.status,201);
    const limited=(await admin.call('/api/admin/products','POST',{name:'کیبورد تست موجودی محدود',price:120000,stock:2,category:'کیبورد گیمینگ',features:['اتصال سیمی'],status:'active'})).data;
    const unavailable=(await admin.call('/api/admin/products','POST',{name:'کیبورد تست ناموجود',price:110000,stock:0,category:'کیبورد گیمینگ',status:'active'})).data;
    const catalog=(await buyer.call('/api/products')).data,product=catalog.find(p=>p.stock>=3);

    await t.test('cards expose an honest stock label, category, feature and direct add action; double clicks add once',async()=>{
        const p=await page('/products'),{w,run}=p;await until(()=>w.document.querySelector('#productGrid .card-add-button'));
        assert.equal(w.document.querySelectorAll('.product-rating,.detail-rating').length,0);
        const button=[...w.document.querySelectorAll('.card-add-button')].find(b=>b.dataset.addToCart===String(product.id));
        assert.ok(button);assert.equal(button.closest('a'),null);assert.ok(button.closest('article').querySelector('.product-category').textContent);
        const limitedCard=[...w.document.querySelectorAll('#productGrid article')].find(row=>row.querySelector('[data-add-to-cart]')?.dataset.addToCart===String(limited.id));
        const unavailableCard=[...w.document.querySelectorAll('#productGrid article')].find(row=>row.querySelector('[data-add-to-cart]')?.dataset.addToCart===String(unavailable.id));
        assert.equal(limitedCard.querySelector('.stock-label').textContent,'موجودی محدود');assert.equal(unavailableCard.querySelector('.stock-label').textContent,'ناموجود');assert.equal(unavailableCard.querySelector('[data-add-to-cart]').disabled,true);
        button.click();button.click();assert.equal(run('getCart()[0].quantity'),1);assert.equal(w.document.querySelector('#cart-count').textContent,'۱');assert.ok(w.document.querySelector('.toast a[href="/cart.html"]'));
        run('products[0].stock=2;productsSource="cache"');assert.notEqual(run('getProductStock(products[0]).label'),'موجودی محدود');
        run('productsSource="api"');assert.equal(run('getProductStock(products[0]).label'),'موجودی محدود');run('products[0].stock=0');assert.equal(run('getProductStock(products[0]).label'),'ناموجود');
    });
    await t.test('Persian search, active filters, reset and no results stay local and preserve matching DOM',async()=>{
        const {w,run}=await page('/products'),input=w.document.getElementById('productSearch');
        assert.equal(run('normalizeSearchText("كِيبورد ۱۲۳")'),'کیبورد 123');
        const before=requests.filter(r=>r.path==='/api/products').length;
        input.value='كِيبورد';input.dispatchEvent(new w.Event('input',{bubbles:true}));await pause(220);
        assert.ok(w.document.querySelectorAll('#productGrid .product-card').length);assert.ok(w.document.querySelector('[data-clear-filter="productSearch"]'));
        const first=w.document.querySelector('#productGrid .product-card');run('renderProducts()');assert.equal(w.document.querySelector('#productGrid .product-card'),first);
        input.value='بدون هیچ محصول مطابق';input.dispatchEvent(new w.Event('input',{bubbles:true}));await pause(220);assert.ok(w.document.querySelector('[data-reset-filters]'));
        w.document.querySelector('[data-reset-filters]').click();assert.equal(input.value,'');assert.equal(w.document.activeElement,input);
        assert.equal(w.document.querySelectorAll('#productGrid .product-card').length,catalog.length);assert.equal(requests.filter(r=>r.path==='/api/products').length,before);
    });
    await t.test('cart quantity preserves its row/focus, shows actual shipping, removes cleanly and caps invalid quantities',async()=>{
        const {w,run}=await page('/cart.html');run(`saveCart([{id:${JSON.stringify(String(product.id))},quantity:1}])`);
        const row=w.document.querySelector('[data-cart-row]'),increase=row.querySelector('[data-cart-action="increase"]');increase.focus();increase.click();
        assert.equal(w.document.querySelector('[data-cart-row]'),row);assert.equal(w.document.activeElement,increase);assert.equal(run('getCart()[0].quantity'),2);
        assert.equal(w.document.getElementById('cartShipping').textContent,run('formatPrice(25000)'));
        row.querySelector('[data-cart-action="decrease"]').click();assert.equal(run('getCart()[0].quantity'),1);assert.equal(row.querySelector('[data-cart-action="decrease"]').disabled,true);
        assert.equal(run('normalizeCart([{id:products[0].id,quantity:-1}]).length'),0);
        const oldStock=run('products[0].stock');run('products[0].stock=1000');assert.equal(run('normalizeCart([{id:products[0].id,quantity:1000}])[0].quantity'),99);run('products[0].stock='+oldStock);
        row.querySelector('[data-cart-action="remove"]').click();assert.equal(run('getCart().length'),0);assert.equal(w.document.getElementById('emptyCart').hidden,false);assert.ok(w.document.querySelector('#emptyCart a'));
        run(`saveCart([{id:${JSON.stringify(String(product.id))},quantity:1}])`);assert.ok(w.document.querySelector('[data-cart-row]'),'same cart can be refilled');
    });
    let checkout;
    await t.test('coupon errors stay inline, a pending check cannot submit twice, and checkout fields have adjacent Persian errors',async()=>{
        checkout=await page('/checkout.html');const {w,run}=checkout;run(`saveCart([{id:${JSON.stringify(String(product.id))},quantity:1}])`);
        const form=w.document.getElementById('discountForm');w.document.getElementById('discountCode').value='MISSING-CODE';
        const pending=hold('/api/checkout/quote'),before=requests.filter(r=>r.path==='/api/checkout/quote').length;submit(w,form);submit(w,form);await until(()=>pending.entered);
        assert.equal(form.querySelector('button').disabled,true);pending.release();gate=null;await until(()=>!form.dataset.busy);
        assert.equal(requests.filter(r=>r.path==='/api/checkout/quote').length,before+1);assert.match(w.document.getElementById('discountHint').textContent,/[\u0600-\u06ff]/);assert.equal(w.document.getElementById('discountCode').getAttribute('aria-invalid'),'true');
        w.document.getElementById('discountCode').value='UX-CAP';submit(w,form);await until(()=>!form.dataset.busy);assert.equal(run('getCartTotals().discount'),1000,'server coupon cap is displayed exactly');
        w.document.querySelector('[data-checkout-next="1"]').click();await until(()=>!w.document.querySelector('[data-checkout-step="2"]').hidden);
        w.document.getElementById('customerName').value='';w.document.querySelector('[data-checkout-next="2"]').click();await until(()=>w.document.getElementById('customerNameError'));
        assert.equal(w.document.getElementById('customerName').getAttribute('aria-invalid'),'true');assert.ok(w.document.getElementById('customerName').getAttribute('aria-describedby').includes('customerNameError'));
    });
    await t.test('real checkout accepts only allowed fields, verifies all costs and prevents duplicate submission',async()=>{
        const {w,run}=checkout;
        for(const [id,value]of Object.entries({customerName:'گیرنده',customerLastName:'آزمایشی',customerPhone:'۰۹۱۲۱۱۱۷۸۹۱',customerProvince:'تهران',customerCity:'تهران',customerPostalCode:'۱۲۳۴۵۶۷۸۹۰',customerAddress:'تهران خیابان آزمایش پلاک ۱۲ واحد ۳',shippingMethod:'standard'})){const input=w.document.getElementById(id);input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));}
        w.document.getElementById('acceptDemo').checked=true;w.document.getElementById('discountCode').value='';submit(w,w.document.getElementById('discountForm'));await until(()=>!w.document.getElementById('discountForm').dataset.busy);
        w.document.querySelector('[data-checkout-next="2"]').click();await until(()=>!w.document.querySelector('[data-checkout-step="3"]').hidden);w.document.querySelector('[data-checkout-next="3"]').click();await until(()=>!w.document.querySelector('[data-checkout-step="4"]').hidden);
        const pending=hold('/api/checkout'),before=requests.filter(r=>r.path==='/api/checkout'&&r.method==='POST').length,form=w.document.getElementById('checkoutForm');submit(w,form);submit(w,form);await until(()=>pending.entered);
        assert.equal(form.getAttribute('aria-busy'),'true');assert.equal(w.document.getElementById('payButton').disabled,true);assert.ok(w.document.getElementById('paymentAmount'),'final price remains visible while submitting');
        pending.release();gate=null;await until(()=>!w.document.getElementById('paymentSuccess').hidden,'order receipt');
        const placed=requests.filter(r=>r.path==='/api/checkout'&&r.method==='POST');assert.equal(placed.length,before+1);const payload=JSON.parse(placed.at(-1).body);for(const key of ['userName','userEmail','userPhone','total','price','cardNumber'])assert.equal(key in payload,false);
        const orders=(await buyer.call('/api/orders')).data;assert.equal(orders.length,1);assert.equal((await buyer.call('/api/orders/'+orders[0].id)).data.shippingCost,25000);assert.equal(run('getCart().length'),0);
    });
    await t.test('expired checkout sessions keep the cart and show a safe sign-in message',async()=>{
        assert.equal((await buyer.call('/api/auth/logout','POST',{})).response.status,204);
        const {w,run}=checkout;w.document.getElementById('paymentSuccess').hidden=true;run(`saveCart([{id:${JSON.stringify(String(product.id))},quantity:1}])`);
        const form=w.document.getElementById('checkoutForm');submit(w,form);await until(()=>!form.dataset.submitting);
        assert.match(w.document.getElementById('checkoutPaymentError').textContent,/نشست.*پایان/);assert.equal(run('getCart().length'),1);
    });
    await t.test('login failures are safe Persian text, register/loading state is clear and return URLs cannot escape the store',async()=>{
        const {w,run}=await page('/profile.html',guest);await until(()=>w.document.getElementById('profileAuth'));await until(()=>!w.document.querySelector('#profileAuth [type="submit"]').disabled);
        const form=w.document.getElementById('profileAuth');form.elements.email.value='missing-user@example.invalid';form.elements.password.value=password;
        const pending=hold('/api/auth/login');submit(w,form);submit(w,form);await until(()=>pending.entered);assert.match(form.querySelector('[type="submit"]').textContent,/در حال ورود/);pending.release();gate=null;await until(()=>!form.hasAttribute('aria-busy'));
        assert.match(w.document.getElementById('profileNotice').textContent,/ایمیل|رمز/);assert.equal(w.document.querySelectorAll('#profileNotice script,#profileNotice img').length,0);
        assert.equal(w.Web2.errorMessage(500,{error:'SQLITE private credentials <script>secret</script>'},'/api/auth/register').includes('SQLITE'),false);
        for(const value of ['https://evil.invalid/','//evil.invalid/','/admin','/profile.html','/categories/../admin']){w.history.replaceState({},'',base+'/profile.html?returnTo='+encodeURIComponent(value));assert.equal(run('accountReturnPath()'),'');}
        w.history.replaceState({},'',base+'/profile.html?returnTo=%2Fcheckout.html');assert.equal(run('accountReturnPath()'),'/checkout.html');
        const mode=w.document.getElementById('profileAuthMode');mode.value='register';mode.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(form.querySelector('[type="submit"]').textContent,'ساخت حساب');
        await until(()=>!form.querySelector('[type="submit"]').disabled);
        for(const [key,value]of Object.entries({name:'ثبت‌نام تکراری',phone:'09121117891',email:'shopping-ux@example.invalid',password}))form.elements.namedItem(key).value=value;
        submit(w,form);await until(()=>!form.hasAttribute('aria-busy'));assert.match(w.document.getElementById('profileNotice').textContent,/[\u0600-\u06ff]/);assert.equal(w.document.querySelectorAll('#profileNotice img,#profileNotice script').length,0);

    });
    await t.test('product deletion and account disable/role changes cannot mutate before confirmation',async()=>{
        const secondary=(await admin.call('/api/admin/admins','POST',{username:'ux-secondary',password,role:'SUPER_ADMIN'})).data;
        const {w}=await page('/admin',admin);await until(()=>w.Web2Admin?.principal&&w.document.querySelector('[data-delete-product]'));
        const before=requests.filter(r=>r.method==='DELETE').length,button=w.document.querySelector('[data-delete-product]');button.click();await until(()=>w.document.querySelector('.admin-confirm[open]'));
        assert.equal(requests.filter(r=>r.method==='DELETE').length,before);w.document.querySelector('.admin-confirm .secondary-button').click();await until(()=>!w.document.querySelector('.admin-confirm'));assert.equal(requests.filter(r=>r.method==='DELETE').length,before);
        w.document.querySelector('[data-admin-tab="users"]').click();await until(()=>w.document.querySelector('[data-um-action="status"]'));w.document.querySelector('[data-um-action="status"]').click();await until(()=>w.document.querySelector('.admin-confirm[open]'));assert.match(w.document.querySelector('.admin-confirm').textContent,/غیرفعال|فعال/);w.document.querySelector('.admin-confirm .secondary-button').click();
        w.document.querySelector('[data-um-action="delete"]').click();await until(()=>w.document.querySelector('.admin-confirm[open]'));assert.equal(requests.filter(r=>r.method==='DELETE').length,before);w.document.querySelector('.admin-confirm .secondary-button').click();
        w.document.querySelector('[data-admin-tab="orders"]').click();await until(()=>w.document.querySelector('[data-order-status]'));
        const order=w.document.querySelector('[data-order-status]'),orderPath='/api/admin/orders/'+order.dataset.orderStatus,beforeCancel=requests.filter(r=>r.path===orderPath&&r.method==='PUT').length;
        order.value='cancelled';order.dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>w.document.querySelector('.admin-confirm[open]'));assert.match(w.document.querySelector('.admin-confirm').textContent,/لغو|موجودی/);assert.equal(requests.filter(r=>r.path===orderPath&&r.method==='PUT').length,beforeCancel);w.document.querySelector('.admin-confirm .secondary-button').click();
        w.document.querySelector('[data-admin-tab="admins"]').click();await until(()=>[...w.document.querySelectorAll('[data-admin-role]')].some(el=>el.dataset.adminRole===String(secondary.id)));
        const role=[...w.document.querySelectorAll('[data-admin-role]')].find(el=>el.dataset.adminRole===String(secondary.id)),rolePath='/api/admin/admins/'+secondary.id,beforeDemote=requests.filter(r=>r.path===rolePath&&r.method==='PUT').length;
        role.value='ADMIN';role.dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>w.document.querySelector('.admin-confirm[open]'));assert.equal(requests.filter(r=>r.path===rolePath&&r.method==='PUT').length,beforeDemote);w.document.querySelector('.admin-confirm .secondary-button').click();
    });
    assert.deepEqual(errors,[]);
});
