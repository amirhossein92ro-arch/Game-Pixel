'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..');
test('real HTTP commerce flow, security, transactions and restart persistence',async t=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-commerce-'));
    const database=path.join(temp,'test.sqlite');
    const port=19000+Math.floor(Math.random()*1000),base=`http://localhost:${port}`;
    let child;
    async function start(){
        child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DATABASE_PATH:database,SEED_DATA_PATH:path.join(root,'data.json'),ADMIN_PASSWORD:'test-admin-password-only',APP_ORIGIN:base,PAYMENT_MODE:'test',NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
        await new Promise((resolve,reject)=>{
            const timeout=setTimeout(()=>reject(Error('Server startup timed out')),15000);
            child.once('exit',code=>{clearTimeout(timeout);reject(Error(`Server exited: ${code}`));});
            child.stderr.on('data',data=>{if(!String(data).includes('ExperimentalWarning')&&!String(data).includes('trace-warnings'))process.stderr.write(data);});
            child.stdout.on('data',data=>{if(String(data).includes('Server is running')){clearTimeout(timeout);resolve();}});
        });
    }
    async function stop(){if(child && child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}}
    const client=()=>({cookie:'',csrf:'',async request(url,method='GET',body,extra={}){
        const headers={...(this.cookie?{Cookie:this.cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(this.csrf?{'X-CSRF-Token':this.csrf}:{}),...extra};
        const response=await fetch(base+url,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
        const cookies=response.headers.getSetCookie();if(cookies.length)this.cookie=cookies.map(c=>c.split(';')[0]).join('; ');
        const content=await response.text();let data;try{data=JSON.parse(content);}catch{data=content;}
        if(data?.csrfToken)this.csrf=data.csrfToken;
        return {status:response.status,data,headers:response.headers};
    }});
    try {
        await start();
        await t.test('frontend session client registers, reloads, logs out and logs in via real API',async()=>{
            const vm=require('node:vm');
            let cookie='';
            function page(){
                const context=vm.createContext({URL,Headers,Event,localStorage:{removeItem(){}},
                    location:{href:base+'/profile.html',origin:base},addEventListener(){},dispatchEvent(){},
                    fetch:async(url,options={})=>{
                        const headers=new Headers(options.headers);
                        headers.set('Origin',base);
                        if(cookie)headers.set('Cookie',cookie);
                        const response=await fetch(base+url,{...options,headers});
                        const cookies=response.headers.getSetCookie();
                        if(cookies.length)cookie=cookies.map(c=>c.split(';')[0]).join('; ');
                        assert.match(response.headers.get('content-type')||'',/application\/json|^$/);
                        return response;
                    }});
                context.window=context;
                vm.runInContext(fs.readFileSync(path.join(root,'js/session.js'),'utf8'),context);
                return context.Web2;
            }
            const fields={name:'تست مسیر فرانت',phone:'09120000002',email:'frontend-auth@example.invalid',password:'test-frontend-password-2026'};
            let api=page();await api.ready;
            const user=await api.authenticate('register',fields);assert.equal(user.role,'user');
            assert.ok(cookie.startsWith('web2_user='));
            api=page();await api.ready;assert.equal(api.user.id,user.id);assert.ok(api.csrfToken);
            await assert.rejects(api.request('/api/admin/stats'),/ورود مدیر/);
            await api.logout();assert.equal(api.user,null);
            api=page();await api.ready;assert.equal(api.user,null);
            assert.equal((await api.authenticate('login',fields)).id,user.id);
            const db=new DatabaseSync(database);
            const account=db.prepare('SELECT * FROM accounts WHERE email=?').get(fields.email);
            assert.equal(account.id,user.id);assert.match(account.password_hash,/^\$2b\$12\$/);
            assert.ok(!JSON.stringify(account).includes(fields.password));db.close();
            await api.logout();
        });
        const anonymous=client(),user=client(),other=client(),admin=client();
        await t.test('public assets and API protect private data and admin',async()=>{
            const products=await anonymous.request('/api/products');assert.equal(products.status,200);assert.equal(products.data.length,69);
            for(const p of products.data)for(const k of ['image','status','createdAt','updatedAt'])assert.ok(p[k]);
            for(const route of ['/api/admin/products','/api/admin/stats','/api/admin/orders','/api/admin/users','/api/admin/discounts'])assert.equal((await anonymous.request(route)).status,401);
            for(const route of ['/data.json','/var/web2.sqlite','/.env','/lib/commerce.cjs','/.git/config'])assert.equal((await anonymous.request(route)).status,404);
            for(const route of ['/','/product.html?id=10','/cart.html','/checkout.html','/profile.html','/admin-login','/js/session.js'])assert.equal((await anonymous.request(route)).status,200);
            assert.equal((await anonymous.request('/admin.html')).status,404);
            assert.ok(products.headers.get('content-security-policy'));
        });
        const fields={name:'کاربر تست',email:'tester@example.invalid',phone:'09120000000',password:'test-user-password-only'};
        await t.test('register, hash, session, profile and CSRF',async()=>{
            assert.equal((await user.request('/api/auth/register','POST',{...fields,password:'1234'})).status,400);
            const r=await user.request('/api/auth/register','POST',fields);assert.equal(r.status,201);assert.ok(r.headers.get('set-cookie').includes('HttpOnly'));assert.ok(r.headers.get('set-cookie').includes('SameSite=Strict'));
            assert.equal((await anonymous.request('/api/auth/register','POST',fields)).status,409);
            assert.equal((await anonymous.request('/api/auth/login','POST',{email:fields.email,password:'wrong'})).status,401);
            assert.equal((await user.request('/api/users/me','PUT',{name:'تست'},{'X-CSRF-Token':'wrong'})).status,403);
            assert.equal((await user.request('/api/users/me','PUT',{name:'تست'},{Origin:'https://attacker.invalid'})).status,403);
            const changed=await user.request('/api/users/me','PUT',{name:'تست ویرایش',addresses:[{name:'گیرنده تست',phone:fields.phone,address:'نشانی آزمایشی شماره یک'}],role:'admin'});
            assert.equal(changed.status,200);assert.equal(changed.data.role,'user');assert.equal(changed.data.addresses.length,1);
            assert.equal((await user.request('/api/admin/stats')).status,403);
            const inspect=new DatabaseSync(database);const account=inspect.prepare('SELECT password_hash FROM accounts WHERE email=?').get(fields.email);assert.notEqual(account.password_hash,fields.password);assert.match(account.password_hash,/^\$2/);inspect.close();
        });
        let product,order;
        await t.test('admin cookie, full product CRUD and discount management',async()=>{
            assert.equal((await admin.request('/api/admin/login','POST',{username:'admin',password:'bad'})).status,401);
            assert.equal((await admin.request('/api/admin/login','POST',{username:'admin',password:'test-admin-password-only'})).status,200);
            product=(await admin.request('/api/admin/products','POST',{name:'محصول تست تراکنش',brand:'TEST',category:'کیبورد گیمینگ',price:100000,stock:3,description:'توضیح محصول فقط برای تست',shortDescription:'تست',features:['یک','دو','سه','چهار','پنج'],image:'img/product-placeholder.svg',rating:4.5,reviews:0,guarantee:'آزمایشی',status:'active'})).data;
            assert.ok(product.id);assert.equal(product.stock,3);
            assert.equal((await admin.request(`/api/admin/products/${product.id}`,'PUT',{price:-1})).status,400);
            assert.equal((await admin.request('/api/admin/discounts','POST',{code:'ONCE',type:'fixed',value:10000,active:true,maxUses:1})).status,201);
            assert.equal((await admin.request('/api/admin/discounts','POST',{code:'EXPIRED',type:'percent',value:10,active:true,expiresAt:'2000-01-01'})).status,201);
            const inactive=await admin.request(`/api/admin/products/${product.id}`,'PUT',{status:'inactive'});assert.equal(inactive.status,200);
            assert.equal((await anonymous.request(`/api/products/${product.id}`)).status,404);
            assert.equal((await admin.request(`/api/admin/products/${product.id}`,'PUT',{status:'active'})).status,200);
        });
        await t.test('admin namespace rejects forged, expired and revoked sessions on every route spelling',async()=>{
            const paths=['/api/admin/products','/API/ADMIN/products/','/api/admin/orders','/api/admin/users','/api/admin/stats','/api/admin/session/','/API/ADMIN/SESSION','/api/admin/unknown'];
            for(const url of paths){
                assert.equal((await anonymous.request(url)).status,401,url);
                assert.equal((await user.request(url)).status,403,'customer '+url);
                assert.equal((await anonymous.request(url,'GET',undefined,{Cookie:'web2_admin=forged-token'})).status,401,'forged '+url);
            }
            for(const url of ['/api/admin/session/','/API/ADMIN/SESSION'])assert.equal((await admin.request(url)).status,200,url);
            for(const method of ['POST','PUT','PATCH','DELETE']){
                assert.equal((await anonymous.request('/API/ADMIN/products/',method,{})).status,401,method);
                assert.equal((await user.request('/api/products'+(method==='POST'?'':'/'+product.id),method,{})).status,method==='PATCH'?404:403,'legacy '+method);
                assert.equal((await admin.request('/API/ADMIN/products/',method,{}, {'X-CSRF-Token':'forged'})).status,403,'csrf '+method);
            }
            const expiredToken='e'.repeat(64),crypto=require('node:crypto'),inspect=new DatabaseSync(database);
            inspect.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update(expiredToken).digest('hex'),'bootstrap-admin','admin','expired-csrf',Date.now()-1);
            inspect.close();
            assert.equal((await anonymous.request('/api/admin/session','GET',undefined,{Cookie:'web2_admin='+expiredToken})).status,401);
            const transient=client();
            await transient.request('/api/admin/login','POST',{username:'admin',password:'test-admin-password-only'});
            const oldCookie=transient.cookie;
            assert.equal((await transient.request('/api/admin/logout','POST',{})).status,204);
            assert.equal((await anonymous.request('/api/admin/products','GET',undefined,{Cookie:oldCookie})).status,401);
            assert.equal((await admin.request('/api/admin/unknown')).status,403,'unknown permissions fail closed even for SUPER_ADMIN');
            // A customer cookie must not interfere with CSRF validation for admin URL variants.
            const both=await admin.request('/API/ADMIN/products/'+product.id+'/', 'PUT',{stock:3},{Cookie:admin.cookie+'; '+user.cookie});
            assert.equal(both.status,200);
            for(const url of ['/api/admin/products','/API/ADMIN/SESSION'])assert.equal((await admin.request(url)).headers.get('cache-control'),'no-store');
            let throttled=false;
            for(let i=0;i<31;i++){
                const url=i%2?'/API/ADMIN/LOGIN/':'/api/admin/login';
                const result=await anonymous.request(url,'POST',{});
                assert.ok([401,429].includes(result.status));
                if(result.status===429){throttled=true;assert.ok(Number(result.headers.get('retry-after'))>0);}
            }
            assert.equal(throttled,true,'login route variants share a rate limit');
        });
        const payload={items:[{id:product.id,quantity:2}],recipientName:'گیرنده تست',recipientPhone:fields.phone,recipientAddress:'نشانی تست سفارش شماره یک',isAgreed:true,discountCode:'WEB2',total:1,price:1};
        await t.test('server quotes prices, rejects stock/duplicates/card data, idempotency and ownership',async()=>{
            const q=await user.request('/api/checkout/quote','POST',payload);assert.equal(q.status,200);assert.equal(q.data.subtotal,200000);assert.equal(q.data.discount,20000);assert.equal(q.data.total,180000);
            for(const items of [[{id:product.id,quantity:0}],[{id:product.id,quantity:-1}],[{id:product.id,quantity:4}],[{id:product.id,quantity:1.5}],[{id:product.id,quantity:'1'}],[{id:product.id,quantity:2},{id:product.id,quantity:2}]])assert.equal((await user.request('/api/checkout/quote','POST',{...payload,items})).status,409);
            assert.equal((await user.request('/api/checkout','POST',{...payload,cardNumber:'test-only'},{'Idempotency-Key':'test-card-rejection-0001'})).status,400);
            assert.equal((await user.request('/api/checkout/quote','POST',{...payload,discountCode:'EXPIRED'})).status,400);
            const r=await user.request('/api/checkout','POST',payload,{'Idempotency-Key':'test-order-request-0001'});assert.equal(r.status,201);order=r.data.order;
            assert.equal(order.total,180000);assert.equal(order.paymentStatus,'test');assert.equal(order.status,'pending');assert.ok(order.userId);assert.ok(order.code);
            assert.ok(!('cardNumber' in order));assert.ok(!('expiryDate' in order));
            const repeat=await user.request('/api/checkout','POST',payload,{'Idempotency-Key':'test-order-request-0001'});assert.equal(repeat.status,200);assert.equal(repeat.data.order.id,order.id);
            assert.equal((await user.request('/api/checkout','POST',{...payload,recipientAddress:'نشانی تست متفاوت دیگر'},{'Idempotency-Key':'test-order-request-0001'})).status,409);
            assert.equal((await anonymous.request('/api/products/'+product.id)).data.stock,1);
            await other.request('/api/auth/register','POST',{...fields,email:'other@example.invalid',phone:'09120000001'});
            assert.equal((await other.request('/api/orders/'+order.id)).status,404);assert.equal((await other.request('/api/orders')).data.length,0);
            assert.equal((await user.request('/api/orders')).data.length,1);
        });
        await t.test('parallel stock requests only allow one purchase; cancellation restores once',async()=>{
            const body={...payload,items:[{id:product.id,quantity:1}],discountCode:'ONCE'};
            const results=await Promise.all([user.request('/api/checkout','POST',body,{'Idempotency-Key':'parallel-request-first-0001'}),other.request('/api/checkout','POST',body,{'Idempotency-Key':'parallel-request-second-0002'})]);
            assert.equal(results.filter(r=>r.status===201).length,1);assert.equal((await anonymous.request('/api/products/'+product.id)).data.stock,0);
            assert.equal((await admin.request('/api/admin/discounts')).data.find(d=>d.code==='ONCE').uses,1);
            assert.equal((await admin.request('/api/admin/orders/'+order.id,'PUT',{status:'paid'})).status,409);
            assert.equal((await admin.request('/api/admin/orders/'+order.id,'PUT',{status:'cancelled'})).status,200);
            assert.equal((await anonymous.request('/api/products/'+product.id)).data.stock,2);
            assert.equal((await admin.request('/api/admin/orders/'+order.id,'PUT',{status:'cancelled'})).status,200);
            assert.equal((await anonymous.request('/api/products/'+product.id)).data.stock,2);
            assert.equal((await admin.request('/api/admin/orders/'+order.id,'PUT',{status:'shipped'})).status,409);
            const stats=await admin.request('/api/admin/stats');assert.equal(stats.status,200);assert.equal(stats.data.totalSalesToday,0);
        });
        await t.test('sessions/orders survive restart, user ban and logout are enforced',async()=>{
            await stop();await start();
            const restored=await user.request('/api/auth/session');
            assert.equal(restored.data.user.email,fields.email);assert.ok(restored.data.csrfToken);
            assert.equal((await user.request('/api/orders/'+order.id)).status,200);
            const account=(await user.request('/api/users/me')).data;
            assert.equal((await admin.request('/api/admin/users/'+account.id,'PUT',{role:'user',banned:true,confirm:true})).status,200);
            assert.equal((await user.request('/api/orders')).status,401);
            await admin.request('/api/admin/users/'+account.id,'PUT',{role:'user',banned:false});
            assert.equal((await user.request('/api/auth/logout','POST',{})).status,401,'disabled accounts lose old sessions even after re-enabling');
            assert.equal((await user.request('/api/orders')).status,401);
            assert.equal((await user.request('/api/auth/login','POST',{email:fields.email,password:fields.password})).status,200);
            assert.equal((await user.request('/api/contact','POST',{name:'تست',email:fields.email,subject:'آزمایشی',message:'پیام آزمایشی فقط برای تست'})).status,201);
            assert.ok((await admin.request('/api/admin/messages')).data.length);
            assert.equal((await admin.request('/api/admin/products/'+product.id,'DELETE',{})).status,204);
            assert.equal((await anonymous.request('/api/products/'+product.id)).status,404);
            assert.equal((await user.request('/api/orders/'+order.id)).status,200);
        });
    } finally {await stop();fs.rmSync(temp,{recursive:true,force:true});}
});
