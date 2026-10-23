'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const vm=require('node:vm');
const {totp}=require('../lib/admin-security.cjs');
const root=path.join(__dirname,'..');
test('account and admin DOM flow uses real API, wishlist cart and safe logout',async()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-account-ui-'));
    const port=23000+Math.floor(Math.random()*1000),base=`http://localhost:${port}`;
    const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),APP_ORIGIN:base,DATABASE_PATH:path.join(temp,'ui.sqlite'),ADMIN_PASSWORD:'account-ui-admin-2026',ACCOUNT_TOTP_KEY:'a'.repeat(64),NODE_ENV:'test',PAYMENT_MODE:'test'},stdio:['ignore','pipe','pipe']});
    const windows=[],errors=[],requests=[];
    let cookie='',adminCookie='',adminCsrf='';
    async function until(fn){for(let i=0;i<350;i++){const result=fn();if(result)return result;await new Promise(r=>setTimeout(r,20));}throw Error('UI condition timed out: '+fn.toString()+'; errors: '+errors.join('; ')+'; admin list: '+windows.at(-1)?.document.getElementById('adminTicketList')?.textContent+'; toast: '+windows.at(-1)?.document.getElementById('toastContainer')?.textContent+'; ticket requests: '+JSON.stringify(requests.filter(r=>r.path==='/api/admin/tickets')));}
    function createPage(file,admin=false,query=''){
        const console=new VirtualConsole();console.on('jsdomError',e=>{if(!/navigation/.test(e.message))errors.push(e.message);});
        const dom=new JSDOM(fs.readFileSync(path.join(root,file),'utf8'),{url:base+'/'+file+query,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
        const w=dom.window;windows.push(w);w.Headers=Headers;w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.TextEncoder=TextEncoder;
        w.Element.prototype.scrollIntoView=function(){};
        w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
        w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
        w.fetch=async(input,options={})=>{
            const url=new URL(typeof input==='string'?input:input.url,base),headers=new Headers(options.headers);
            headers.set('Origin',base);const current=admin?adminCookie:cookie;if(current)headers.set('Cookie',current);
            const request={file,path:url.pathname,method:options.method||'GET'};requests.push(request);
            const response=await fetch(url,{...options,headers});request.status=response.status;
            if(response.status>=400&&url.pathname==='/api/admin/tickets')errors.push('Tickets API '+response.status+': '+await response.clone().text());
            const cookies=response.headers.getSetCookie();if(cookies.length){if(admin)adminCookie=cookies.map(c=>c.split(';')[0]).join('; ');else cookie=cookies.map(c=>c.split(';')[0]).join('; ');}
            return response;
        };
        w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
        for(const tag of w.document.querySelectorAll('script[src]')){const src=tag.getAttribute('src');if(!src.startsWith('https:')){const filePath=src.split(/[?#]/,1)[0];vm.runInContext(fs.readFileSync(path.join(root,filePath),'utf8'),dom.getInternalVMContext(),{filename:src});}}
        return w;
    }
    const fill=(w,id,values)=>{const form=w.document.getElementById(id);assert.ok(form,'form '+id);for(const [key,value]of Object.entries(values))form.elements.namedItem(key).value=value;return form;};
    const submit=(w,form)=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    const section=async(w,name)=>{w.document.querySelector(`.account-nav [data-account-section="${name}"]`).click();await until(()=>w.document.getElementById('accountSection')?.getAttribute('aria-busy')!=='true');};
    try{
        await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Startup timed out')),15000);server.once('exit',code=>{clearTimeout(timeout);reject(Error('Server exit '+code));});server.stdout.on('data',data=>{if(String(data).includes('Server is running')){clearTimeout(timeout);resolve();}});server.stderr.on('data',()=>{});});
        let w=createPage('profile.html');await until(()=>w.document.getElementById('profileAuth'));
        await until(()=>w.document.querySelector('[data-captcha-status]')?.textContent==='');
        assert.equal(w.document.querySelector('#profileAuth button[type="submit"]').disabled,false,'optional CAPTCHA must allow authentication');
        const mode=w.document.getElementById('profileAuthMode');mode.value='register';mode.dispatchEvent(new w.Event('change',{bubbles:true}));
        const fields={name:'کاربر تست UI',phone:'09120003333',email:'account-ui@example.invalid',password:'account-ui-password-2026'};
        const auth=fill(w,'profileAuth',fields);submit(w,auth);submit(w,auth);
        await until(()=>w.document.querySelector('.account-stats'));
        assert.equal(requests.filter(r=>r.path==='/api/auth/register').length,1,'double submit prevented');
        assert.equal(requests.filter(r=>r.file==='profile.html'&&r.path==='/api/account/dashboard').length,1,'dashboard request is not duplicated');
        assert.equal(w.document.querySelectorAll('.account-nav button').length,9);
        await section(w,'info');submit(w,fill(w,'profileEdit',{firstName:'آرش',lastName:'بازیکن',displayName:'Player UI',avatar:'dragon'}));
        await until(()=>w.document.querySelector('[data-account-name]')?.textContent==='Player UI');
        assert.equal((await w.Web2.request('/api/users/me')).name,'آرش بازیکن');
        await section(w,'addresses');submit(w,fill(w,'profileAddressForm',{title:'خانه',name:'گیرنده تست',phone:fields.phone,province:'تهران',city:'تهران',address:'آدرس کامل برای آزمایش رابط کاربری',postalCode:'1234567890'}));
        await until(()=>w.document.querySelector('.account-address-card'));
        w.document.querySelector('[data-account-action="edit-address"]').click();await until(()=>w.document.querySelector('#profileAddressForm [name="id"]').value);
        submit(w,fill(w,'profileAddressForm',{title:'خانه ویرایش‌شده'}));await until(()=>w.document.querySelector('.account-address-card strong')?.textContent.includes('ویرایش‌شده'));
        w.document.querySelector('[data-account-action="delete-address"]').click();await until(()=>w.document.getElementById('accountCancel'));w.document.getElementById('accountCancel').click();
        await until(()=>!w.document.getElementById('accountDialog').open);assert.equal((await w.Web2.request('/api/users/me/addresses')).length,1);
        const checkout=createPage('checkout.html');await until(()=>checkout.document.getElementById('savedAddress')?.value);
        assert.equal(checkout.document.getElementById('customerProvince').value,'تهران');
        assert.equal(checkout.document.getElementById('customerCity').value,'تهران');
        assert.equal(checkout.document.getElementById('customerPostalCode').value,'1234567890');
        assert.ok(checkout.document.getElementById('customerAddress').value.includes('آدرس کامل'));
        assert.equal(checkout.document.getElementById('customerName').value,'گیرنده');
        assert.equal(checkout.document.getElementById('customerLastName').value,'تست');
        // The wishlist heart in actual store markup saves in the authenticated account.
        const shop=createPage('index.html');await until(()=>shop.document.querySelector('[data-wishlist-product]'));
        const heart=shop.document.querySelector('[data-wishlist-product]'),productId=heart.dataset.wishlistProduct;
        heart.click();heart.click();await until(()=>heart.getAttribute('aria-pressed')==='true');
        assert.equal((await shop.Web2.request('/api/users/me/wishlist')).length,1);
        assert.equal(requests.filter(r=>r.file==='index.html'&&r.path==='/api/users/me/wishlist/'+productId&&r.method==='PUT').length,1);
        const detail=createPage('product.html',false,'?id='+productId);await until(()=>detail.document.querySelector('[data-wishlist-product]')?.getAttribute('aria-pressed')==='true');
        assert.equal(detail.document.querySelector('[data-wishlist-product]').dataset.wishlistProduct,productId);
        await section(w,'wishlist');const add=w.document.querySelector('.account-wish-card [data-add-to-cart]');assert.ok(add);add.click();
        assert.equal(JSON.parse(w.localStorage.getItem('web2_cart'))?.[0]?.id,String(productId));
        assert.equal(w.localStorage.getItem('gp_user'),null);assert.ok(!JSON.stringify({...w.localStorage}).includes(fields.password));
        await section(w,'orders');assert.ok(w.document.getElementById('accountSection').textContent.includes('هنوز سفارشی'));
        const order=(await w.Web2.request('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'account-ui-order-test-2026'},body:JSON.stringify({items:[{id:Number(productId),quantity:1}],recipientName:'گیرنده تست',recipientPhone:fields.phone,recipientAddress:'نشانی تست برای سفارش رابط کاربری',isAgreed:true})})).order;
        w.document.querySelector('[data-account-action="refresh"]').click();await until(()=>w.document.querySelector('[data-account-action="order"]'));
        w.document.querySelector('[data-account-action="order"]').click();await until(()=>w.document.querySelector('.account-table'));
        assert.ok(w.document.getElementById('accountDialogBody').textContent.includes(order.code));w.document.querySelector('[data-account-action="close-dialog"]').click();
        await section(w,'support');submit(w,fill(w,'accountTicketForm',{subject:'درخواست UI',category:'order',message:'پیام واقعی مشتری برای تست رابط کاربری <script>evil()</script>'}));
        await until(()=>w.document.getElementById('accountReplyForm'));assert.equal(w.document.querySelectorAll('#accountSection script').length,0);
        const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'account-ui-admin-2026'})});
        adminCookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');adminCsrf=(await login.json()).csrfToken;
        const aw=createPage('admin.html',true);await until(()=>aw.Web2.adminCsrf===adminCsrf&&aw.document.getElementById('adminDashboard').hidden===false);
        aw.document.querySelector('[data-admin-tab="support"]').click();await until(()=>aw.document.querySelector('[data-admin-ticket]'));
        aw.document.querySelector('[data-admin-ticket]').click();await until(()=>aw.document.getElementById('adminTicketReplyForm'));
        const reply=fill(aw,'adminTicketReplyForm',{message:'پاسخ مدیر برای تست رابط مشتری',status:'answered'});submit(aw,reply);
        await until(()=>aw.document.getElementById('adminTicketNotice')?.textContent.includes('به‌روز'));
        w.document.querySelector('[data-account-action="refresh"]').click();await until(()=>w.document.querySelector('.account-message.admin'));
        assert.ok(w.document.getElementById('accountSection').textContent.includes('پاسخ مدیر'));
        await section(w,'notifications');assert.ok(w.document.querySelector('[data-account-action="read-all"]'));w.document.querySelector('[data-account-action="read-all"]').click();await until(()=>w.document.getElementById('accountUnread').hidden);
        await section(w,'security');assert.ok(w.document.getElementById('accountPasswordForm'));assert.ok(!w.document.getElementById('accountSection').textContent.includes(adminCsrf));
        const themeBefore=w.document.body.classList.contains('light-theme');w.document.getElementById('themeBtn').click();assert.notEqual(w.document.body.classList.contains('light-theme'),themeBefore);
        w.document.querySelector('[data-account-action="logout"]').click();await until(()=>w.document.getElementById('profileAuth'));assert.equal(w.document.querySelector('.account-layout'),null);
        assert.equal((await fetch(base+'/api/account/dashboard',{headers:{Cookie:cookie}})).status,401);
        submit(w,fill(w,'profileAuth',{email:fields.email,password:fields.password}));await until(()=>w.document.querySelector('.account-stats'));
        assert.equal(w.document.querySelector('[data-account-name]').textContent,'Player UI');
        // Reconstructing the page restores the server session; it does not read a profile from storage.
        const restored=createPage('profile.html');await until(()=>restored.document.querySelector('.account-stats'));assert.equal(restored.document.querySelector('[data-account-name]').textContent,'Player UI');
        await section(restored,'security');
        assert.ok(restored.document.getElementById('accountStartTwoFactor'));
        submit(restored,fill(restored,'accountStartTwoFactor',{currentPassword:fields.password}));
        await until(()=>restored.document.getElementById('accountConfirmTwoFactor'));
        const secret=restored.document.querySelector('#accountFactorSetup code').textContent;
        submit(restored,fill(restored,'accountConfirmTwoFactor',{code:totp(secret)}));
        await until(()=>restored.document.getElementById('accountDialog')?.open);
        assert.equal(restored.document.querySelector('#accountFactorSetup code'),null,'setup secret disappears after confirmation');
        restored.document.querySelector('#accountDialog [data-account-action="close-dialog"]').click();
        restored.document.querySelector('[data-account-action="logout"]').click();await until(()=>restored.document.getElementById('profileAuth'));
        submit(restored,fill(restored,'profileAuth',{email:fields.email,password:fields.password}));
        await until(()=>restored.document.getElementById('accountTwoFactorLogin'));
        assert.equal(restored.Web2.user,null,'password alone does not authenticate');
        submit(restored,fill(restored,'accountTwoFactorLogin',{code:totp(secret,Date.now()+30000)}));
        await until(()=>restored.document.querySelector('.account-stats'));
        assert.deepEqual(errors,[]);
    }finally{
        windows.forEach(w=>w.close());if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}
        if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()))throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    }
});
