'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto'),vm=require('node:vm');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),digest=value=>crypto.createHash('sha256').update(value).digest('hex');
async function launch(t,extra={}) {
    const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-boundaries-')),database=path.join(temp,'test.sqlite'),base='http://127.0.0.1:'+port;
    const child=spawn(process.execPath,['server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:base,ALLOWED_ORIGINS:'',TRUST_PROXY:'',ADMIN_USERNAME:'admin',ADMIN_PASSWORD:'Unique audit admin 2026!',ADMIN_TOTP_SECRET:'',DATABASE_PATH:database,SEED_DATA_PATH:path.join(root,'data.json'),SMS_PROVIDER:'mock',CAPTCHA_TEST_MODE:'true',PAYMENT_MODE:'test',...extra},stdio:['ignore','pipe','pipe']});
    t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()))throw Error('Unsafe test cleanup.');fs.rmSync(temp,{recursive:true,force:true});});
    await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Startup timeout.')),15000);child.stderr.on('data',data=>output+=data);child.once('exit',code=>{clearTimeout(timer);reject(Error('Startup failed '+code+': '+output));});child.stdout.on('data',data=>{if(String(data).includes('Server is running')){clearTimeout(timer);resolve();}});});
    function client(){return {cookie:'',csrf:'',async call(url,method='GET',body,headers={}){
        const response=await fetch(base+url,{method,redirect:'manual',headers:{Origin:extra.APP_ORIGIN||base,...(this.cookie?{Cookie:this.cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':this.csrf}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
        const cookies=response.headers.getSetCookie();if(cookies.length)this.cookie=cookies.map(value=>value.split(';')[0]).join('; ');
        const raw=response.status===204?'':await response.text();const data=/application\/json/.test(response.headers.get('Content-Type')||'')?JSON.parse(raw):raw;
        if(data?.csrfToken)this.csrf=data.csrfToken;return {response,status:response.status,data,raw};
    }};}
    return {base,database,client};
}
test('complete HTTP authorization, input, recovery and session boundaries',async t=>{
    let inspect;t.after(()=>inspect?.close());
    const env=await launch(t),guest=env.client(),a=env.client(),b=env.client(),superAdmin=env.client(),admin=env.client();
    const password='Unique customer phrase 2026!',aFields={name:'<img src=x onerror="alert(1)"> Buyer',email:'boundary-a@example.invalid',phone:'09121119001',password,captchaToken:'test-valid-captcha'},bFields={...aFields,name:'Second Buyer',email:'boundary-b@example.invalid',phone:'09121119002'};
    inspect=new DatabaseSync(env.database);let adminId,order,product;
    await t.test('health response reveals status only',async()=>{
        const health=await guest.call('/api/health');
        assert.equal(health.status,200);
        assert.deepEqual(health.data,{status:'ok'});
    });
    await t.test('guest and USER cannot access admin namespaces or protected documents',async()=>{
        assert.equal((await a.call('/api/auth/register','POST',aFields)).status,201);assert.equal((await b.call('/api/auth/register','POST',bFields)).status,201);
        for(const route of ['/api/admin/stats','/API/ADMIN/users','/api/admin/users/','/api/admin/settings','/api/admin/orders','/api/admin/permissions','/api/admin/audit','/api/admin/unknown']){assert.equal((await guest.call(route)).status,401,route);assert.equal((await a.call(route)).status,403,route);}
        assert.equal((await guest.call('/admin')).status,302);assert.equal((await a.call('/admin')).status,403);
        for(const route of ['/admin.html','/admin.htm','/admin/index.html','/%61dmin.html'])assert.equal((await guest.call(route)).status,404);
        assert.equal((await guest.call('/js/admin-users.js')).status,302);
    });
    await t.test('role checks are server-side and protect the final SUPER_ADMIN',async()=>{
        assert.equal((await superAdmin.call('/api/admin/login','POST',{username:'admin',password:'Unique audit admin 2026!'})).status,200);
        const created=await superAdmin.call('/api/admin/admins','POST',{username:'ordinary-admin',password:'Unique secondary admin 2026!',role:'ADMIN'});assert.equal(created.status,201);adminId=created.data.id;
        assert.equal((await admin.call('/api/admin/login','POST',{username:'ordinary-admin',password:'Unique secondary admin 2026!'})).status,200);
        for(const [suffix,method,body]of [['/status','PATCH',{status:'disabled',confirm:true,adminConfirm:true}],['/role','PATCH',{role:'ADMIN',confirm:true,adminConfirm:true}],['/reset-password','POST',{password:'New security password 2026!',confirm:true,adminConfirm:true}],['','DELETE',{confirm:true,adminConfirm:true}]])assert.equal((await admin.call('/api/admin/users/bootstrap-admin'+suffix,method,body)).status,403);
        assert.equal((await admin.call('/api/admin/settings','PUT',{maintenance:true})).status,403);
        for(const body of [{role:'ADMIN',confirm:true,adminConfirm:true},{active:false,confirm:true,adminConfirm:true}])assert.equal((await superAdmin.call('/api/admin/admins/bootstrap-admin','PUT',body)).status,409);
        assert.equal((await superAdmin.call('/api/admin/users/bootstrap-admin','DELETE',{confirm:true,adminConfirm:true})).status,409);
        assert.equal((await superAdmin.call('/api/admin/users/'+aFields.email+'/role','PATCH',{role:'INVALID'})).status,400);
    });
    await t.test('every authenticated mutation rejects absent or invalid CSRF',async()=>{
        for(const [client,route,method,body]of [[a,'/api/users/me','PUT',{name:'Updated Buyer'}],[a,'/api/auth/logout','POST',{}],[a,'/api/tickets','POST',{subject:'Security check',category:'other',message:'Safe test message'}],[superAdmin,'/api/admin/settings','PUT',{maintenance:false}],[superAdmin,'/api/admin/logout','POST',{}]]){
            for(const token of ['', 'invalid'])assert.equal((await client.call(route,method,body,{'X-CSRF-Token':token})).status,403,route);
        }
        assert.equal((await a.call('/api/users/me','PUT',{name:'Updated Buyer'},{'X-CSRF-Token':b.csrf})).status,403);
    });
    await t.test('mass assignment, nested pollution, queries and malformed bodies fail safely',async()=>{
        for(const body of [{role:'SUPER_ADMIN'},{isAdmin:true},{passwordHash:'stolen'},{sessionVersion:0},{ownerId:'other'},{addresses:[{role:'SUPER_ADMIN'}]}])assert.equal((await a.call('/api/users/me','PUT',body)).status,400);
        for(const route of ['/api/admin/users?q[$ne]=x','/api/products?search[$regex]=.*','/api/products?tag=a&tag=b'])assert.equal((await superAdmin.call(route)).status,400);
        for(const [body,status]of [['{bad',400],['{"constructor":{"prototype":{"role":"ADMIN"}}}',400],[JSON.stringify({name:'x'.repeat(1048577)}),413]]){
            const result=await guest.call('/api/auth/register','POST',body);assert.equal(result.status,status);assert.doesNotMatch(result.raw,/SyntaxError|stack|node_modules|password_hash|H:\\/);assert.equal(result.response.headers.get('Cache-Control'),'no-store');
        }
        assert.equal((await superAdmin.call('/api/admin/admins','POST',{username:'invalid-admin',password:'Unique secondary admin 2026!',role:'ADMIN',totp_required:false})).status,400);
        assert.equal((await superAdmin.call('/api/admin/posts','POST',{title:'Test title',content:'Test content',status:'invalid'})).status,400);
        assert.equal((await superAdmin.call('/api/admin/products/bulk','POST',{ids:['1'],action:'activate',passwordHash:'x'})).status,400);
    });
    await t.test('orders use server prices, positive integer quantities, stock and one-use checkout keys',async()=>{
        product=(await guest.call('/api/products')).data.find(p=>p.stock>=2&&p.status!=='inactive');assert.ok(product);
        const items=[{id:product.id,quantity:1}],quote=(await a.call('/api/checkout/quote','POST',{items})).data;
        assert.equal(quote.items[0].price,Math.round(product.price*(100-Number(product.discount||0))/100));
        for(const body of [{items,total:0},{items:[{...items[0],price:0}]},{items,discountCodes:['WEB2','WEB2']}])assert.equal((await a.call('/api/checkout/quote','POST',body)).status,400);
        for(const quantity of [-1,0,1.5,product.stock+1])assert.equal((await a.call('/api/checkout/quote','POST',{items:[{id:product.id,quantity}]})).status,409);
        assert.equal((await a.call('/api/checkout/quote','POST',{items:[...items,...items]})).status,409);
        const body={items,recipientName:'Boundary Buyer',recipientPhone:aFields.phone,recipientAddress:'A complete address for testing',isAgreed:true},key=crypto.randomUUID();
        const placed=await a.call('/api/checkout','POST',body,{'Idempotency-Key':key});assert.equal(placed.status,201);order=placed.data.order;assert.equal(order.total,quote.total);
        const replay=await a.call('/api/checkout','POST',body,{'Idempotency-Key':key});assert.equal(replay.status,200);assert.equal(replay.data.order.id,order.id);
        assert.equal((await b.call('/api/orders/'+order.id)).status,404);assert.equal((await b.call('/api/orders')).data.some(o=>o.id===order.id),false);
        assert.equal((await a.call('/api/products/'+product.id,'PUT',{price:1})).status,403);
    });
    await t.test('private tickets, addresses and notifications enforce ownership',async()=>{
        const ticket=(await a.call('/api/tickets','POST',{subject:'<script>alert(1)</script>',category:'other',message:'<img src=x onerror="alert(1)"> private message'})).data;
        assert.equal((await b.call('/api/tickets/'+ticket.id)).status,404);assert.equal((await b.call('/api/tickets/'+ticket.id+'/messages','POST',{message:'A forged support message'})).status,404);
        const address=(await a.call('/api/users/me/addresses','POST',{title:'Home',name:'Buyer',phone:aFields.phone,province:'Test',city:'Test',address:'A complete address for testing'})).data;
        assert.equal((await b.call('/api/users/me/addresses/'+address.id,'DELETE',{})).status,404);
        const notification=(await a.call('/api/users/me/notifications')).data.items[0];assert.ok(notification);
        assert.equal((await b.call('/api/users/me/notifications/'+notification.id+'/read','PUT',{})).status,404);
    });
    await t.test('changed identity kills existing sessions and grants bound to the old phone',async()=>{
        const account=inspect.prepare('SELECT * FROM accounts WHERE email=?').get(aFields.email),oldCookie=a.cookie,id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex');
        const grant=()=>inspect.prepare('INSERT INTO password_reset_challenges VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,account.id,digest(aFields.phone),'consumed',Date.now()+60000,5,digest(token),Date.now()+60000,null,Date.now());
        grant();const oldCsrf=a.csrf,changed=await a.call('/api/users/me','PUT',{phone:'09121119991',currentPassword:password});assert.equal(changed.status,200);assert.ok(changed.data.csrfToken);assert.notEqual(oldCookie,a.cookie);
        assert.equal((await a.call('/api/users/me','GET',undefined,{Cookie:oldCookie})).status,401);
        assert.equal((await a.call('/api/auth/logout','POST',{}, {'X-CSRF-Token':oldCsrf})).status,403);
        assert.equal(inspect.prepare('SELECT count(*) n FROM password_reset_challenges WHERE user_id=?').get(account.id).n,0);
        grant();const reset=await a.call('/api/auth/forgot-password/reset','POST',{challengeId:id,resetToken:token,password:'New recovery phrase 2026!',confirmPassword:'New recovery phrase 2026!',captchaToken:'test-valid-captcha'});assert.equal(reset.status,400);
        assert.equal(inspect.prepare('SELECT password_hash FROM accounts WHERE id=?').get(account.id).password_hash,account.password_hash);
    });
    await t.test('session versions reject stale cookies even if their rows remain',async()=>{
        const user=inspect.prepare('SELECT * FROM accounts WHERE email=?').get(bFields.email);const payload=JSON.parse(user.payload);payload.sessionVersion=(payload.sessionVersion||0)+1;inspect.prepare('UPDATE accounts SET payload=? WHERE id=?').run(JSON.stringify(payload),user.id);
        assert.equal((await b.call('/api/users/me')).status,401);
        assert.equal((await b.call('/api/auth/login','POST',{email:bFields.email,password,captchaToken:'test-valid-captcha'})).status,200);
        inspect.prepare('UPDATE admin_accounts SET session_version=session_version+1 WHERE id=?').run(adminId);assert.equal((await admin.call('/api/admin/session')).status,401);
    });
    await t.test('disabled accounts, password reset, logout and fixation leave no usable old session',async()=>{
        const user=inspect.prepare('SELECT id FROM accounts WHERE email=?').get(bFields.email);const old=b.cookie;
        assert.equal((await superAdmin.call('/api/admin/users/'+user.id+'/status','PATCH',{status:'disabled',confirm:true})).status,200);assert.equal((await b.call('/api/users/me')).status,401);
        assert.equal((await superAdmin.call('/api/admin/users/'+user.id+'/status','PATCH',{status:'active'})).status,200);
        assert.equal((await b.call('/api/auth/login','POST',{email:bFields.email,password,captchaToken:'test-valid-captcha'})).status,200);const beforeReset=b.cookie;
        assert.equal((await superAdmin.call('/api/admin/users/'+user.id+'/reset-password','POST',{password:'New!BoundaryPassword2026',confirm:true})).status,200);
        assert.equal((await b.call('/api/users/me','GET',undefined,{Cookie:beforeReset})).status,401);
        const fixed='web2_user='+crypto.randomBytes(32).toString('hex');b.cookie=fixed;
        assert.equal((await b.call('/api/auth/login','POST',{email:bFields.email,password:'New!BoundaryPassword2026',captchaToken:'test-valid-captcha'})).status,200);assert.notEqual(b.cookie,fixed);assert.notEqual(b.cookie,old);
        const cookie=b.cookie;assert.equal((await b.call('/api/auth/logout','POST',{})).status,204);assert.equal((await b.call('/api/users/me','GET',undefined,{Cookie:cookie})).status,401);
    });
    await t.test('private files, backup assets, maps, paths and response hashes cannot leak',async()=>{
        for(const route of ['/.env','/.git/config','/server.js','/package-lock.json','/data.json','/.backup-final/data.json','/.backup-before-demo/index.html','/var/web2.sqlite','/.server-stderr.log','/lib/admin-security.cjs','/backend/.env','/img/%2e%2e%2f.env','/css/%252e%252e%252f.env','/js/%5c..%5cserver.js','/js/admin-users.js.map'])assert.equal((await guest.call(route)).status,404,route);
        for(const route of ['/api/admin/users','/api/admin/admins','/api/admin/orders','/api/admin/audit','/api/products'])assert.doesNotMatch((await superAdmin.call(route)).raw,/password_?hash|\$2[aby]\$|verified_token_hash|otp_hash/i);
        const audit=(await superAdmin.call('/api/admin/audit')).raw;assert.doesNotMatch(audit,/Unique audit admin|BoundaryPassword|web2_user=|web2_admin=/);
    });
    await t.test('canonical login throttling returns 429 with Retry-After',async()=>{
        let result;for(let i=0;i<35;i++){result=await guest.call(i%2?'/API/AUTH/LOGIN/':'/api/auth/login','POST',{email:'invalid',password:'bad',captchaToken:'test-valid-captcha'});if(result.status===429)break;assert.equal(result.status,401);}
        assert.equal(result.status,429);assert.ok(Number(result.response.headers.get('Retry-After'))>0);
    });
});
test('parallel OTP guesses cannot exceed five comparisons; expired tokens cannot reset',async t=>{
    const env=await launch(t),client=env.client(),phone='09123334444';
    assert.equal((await client.call('/api/auth/register','POST',{name:'OTP Budget',email:'otp-budget@example.invalid',phone,password:'Unique OTP phrase 2026!',captchaToken:'test-valid-captcha'})).status,201);
    const sent=(await client.call('/api/auth/forgot-password/request','POST',{phone,captchaToken:'test-valid-captcha'})).data,wrong=sent.mockOtp==='000000'?'000001':'000000';
    await Promise.all(Array.from({length:8},()=>client.call('/api/auth/forgot-password/verify','POST',{challengeId:sent.challengeId,otp:wrong,captchaToken:'test-valid-captcha'})));
    const db=new DatabaseSync(env.database);try{const row=db.prepare('SELECT * FROM password_reset_challenges WHERE id=?').get(sent.challengeId);assert.equal(row.attempts,5);assert.equal(row.verified_token_hash,null);
        const token=crypto.randomBytes(32).toString('hex');db.prepare('UPDATE password_reset_challenges SET verified_token_hash=?,verified_expires_at=? WHERE id=?').run(digest(token),Date.now()-1,row.id);
        const result=await client.call('/api/auth/forgot-password/reset','POST',{challengeId:row.id,resetToken:token,password:'New unique OTP phrase 2026!',confirmPassword:'New unique OTP phrase 2026!',captchaToken:'test-valid-captcha'});assert.ok([400,409].includes(result.status));
    }finally{db.close();}
});
test('production cookies, headers and safe error responses behind HTTPS proxy',async t=>{
    const env=await launch(t,{NODE_ENV:'production',APP_ORIGIN:'https://shop.example.invalid',TRUST_PROXY:'loopback',HSTS_MAX_AGE:'300',TURNSTILE_SITE_KEY:'public-test-site',TURNSTILE_SECRET_KEY:'server-test-secret',SMS_PROVIDER:'generic',SMS_API_URL:'https://sms.example.invalid/send',SMS_API_KEY:'server-test-sms-key',CAPTCHA_TEST_MODE:'false'}),client=env.client();
    const login=await client.call('/api/admin/login','POST',{username:'admin',password:'Unique audit admin 2026!'},{'X-Forwarded-Proto':'https'});assert.equal(login.status,200);
    const cookie=login.response.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/; Secure/);
    for(const name of ['strict-transport-security','content-security-policy','x-content-type-options','referrer-policy','x-frame-options','permissions-policy'])assert.ok(login.response.headers.get(name),name);
    assert.equal(login.response.headers.get('Strict-Transport-Security'),'max-age=300');
    assert.doesNotMatch(login.response.headers.get('Content-Security-Policy'),/unsafe-eval|script-src[^;]*unsafe-inline/);
    const db=new DatabaseSync(env.database);db.prepare("INSERT OR REPLACE INTO settings VALUES('site-config','null')").run();db.close();
    const failure=await client.call('/api/site-settings');assert.equal(failure.status,500);assert.doesNotMatch(failure.raw,/stack|SyntaxError|JSON|node_modules|H:\\|server-test/);
});
test('untrusted product, profile and ticket text remains inert HTML',()=>{
    const dom=new JSDOM('<!doctype html><body><main id="output"></main></body>',{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
    try{vm.runInContext(fs.readFileSync(path.join(root,'script.js'),'utf8'),dom.getInternalVMContext());vm.runInContext('initializeStore.initialized=true;',dom.getInternalVMContext());
        const payload='<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>',product={id:'1',name:payload,brand:payload,tag:payload,category:payload,price:100,stock:1,rating:4,reviews:0,discount:0,description:payload,shortDescription:payload,features:[payload],icon:'fa-gamepad',accent:'#00d4ff',image:'javascript:alert(1)'};
        w.productFixture=product;w.document.getElementById('output').innerHTML=vm.runInContext('createProductCard(productFixture)',dom.getInternalVMContext());
        assert.equal(w.document.querySelectorAll('#output script,#output [onerror],#output [onload]').length,0);assert.ok(w.document.getElementById('output').textContent.includes(payload));assert.equal(w.document.querySelector('#output img').getAttribute('src').startsWith('javascript:'),false);
        vm.runInContext(fs.readFileSync(path.join(root,'js/profile.js'),'utf8'),dom.getInternalVMContext());w.document.getElementById('output').innerHTML=vm.runInContext('accountBadge("<img src=x onerror=alert(1)>")+profileEscape(productFixture.name)',dom.getInternalVMContext());assert.equal(w.document.querySelectorAll('#output script,#output [onerror]').length,0);
    }finally{w.close();}
});
