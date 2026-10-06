'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..');
test('account API lifecycle, administrator integration and isolation of two users',async t=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-account-')),database=path.join(temp,'account.sqlite');
    const seedFile=path.join(temp,'seed.json'),seed=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8'));
    seed.orders=[...(seed.orders||[]),{id:'legacy-account-test-order',code:'LEGACY-TEST',items:[],status:'processing',paymentStatus:'unknown',total:0}];
    fs.writeFileSync(seedFile,JSON.stringify(seed));
    const port=21000+Math.floor(Math.random()*1000),base=`http://localhost:${port}`;
    let server;
    async function start(){
        server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),APP_ORIGIN:base,DATABASE_PATH:database,SEED_DATA_PATH:seedFile,ADMIN_PASSWORD:'account-test-admin-2026',NODE_ENV:'test',PAYMENT_MODE:'test'},stdio:['ignore','pipe','pipe']});
        await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(Error('Startup timeout')),15000);
            server.once('exit',code=>{clearTimeout(timer);reject(Error('Server exit '+code));});
            server.stdout.on('data',data=>{if(String(data).includes('Server is running')){clearTimeout(timer);resolve();}});
            server.stderr.on('data',()=>{});
        });
    }
    async function stop(){if(server?.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}}
    function client(){return {cookie:'',csrf:'',async request(url,method='GET',body){
        const headers={Origin:base,...(this.cookie?{Cookie:this.cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(this.csrf?{'X-CSRF-Token':this.csrf}:{})};
        if(url==='/api/checkout')headers['Idempotency-Key']='account-test-order-idempotency-01';
        const response=await fetch(base+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
        const cookies=response.headers.getSetCookie();if(cookies.length)this.cookie=cookies.map(c=>c.split(';')[0]).join('; ');
        const data=response.status===204?null:await response.json();if(data?.csrfToken)this.csrf=data.csrfToken;
        return {status:response.status,data};
    }};}
    const a=client(),b=client(),admin=client(),anonymous=client(),otherSession=client();
    const fields={name:'کاربر آلفا',email:'alpha-account@example.invalid',phone:'09120001111',password:'account-alpha-password-2026'};
    let userA,userB,address,ticket,order,productId,notificationId;
    try{
        await start();
        await t.test('register/login and all private routes require real sessions',async()=>{
            userA=(await a.request('/api/auth/register','POST',fields)).data.user;
            userB=(await b.request('/api/auth/register','POST',{...fields,name:'کاربر بتا',email:'beta-account@example.invalid',phone:'09120002222'})).data.user;
            assert.ok(userA.id);assert.notEqual(userA.id,userB.id);
            for(const route of ['/api/account/dashboard','/api/users/me/addresses','/api/users/me/wishlist','/api/users/me/sessions','/api/users/me/notifications','/api/tickets'])assert.equal((await anonymous.request(route)).status,401);
            assert.equal((await a.request('/api/auth/logout','POST',{})).status,204);
            assert.equal((await a.request('/api/auth/login','POST',fields)).status,200);
            assert.equal((await admin.request('/api/admin/login','POST',{username:'admin',password:'account-test-admin-2026'})).status,200);
            assert.equal((await a.request('/api/admin/tickets')).status,401);
        });
        await t.test('profile validates fields and cannot change owner or privileges',async()=>{
            assert.equal((await a.request('/api/users/me','PUT',{firstName:'ا'})).status,400);
            assert.equal((await a.request('/api/users/me','PUT',{email:'new@example.invalid'})).status,403);
            const result=await a.request('/api/users/me','PUT',{firstName:'آرش',lastName:'گیمر',displayName:'Alpha Player',avatar:'robot',userId:userB.id,id:userB.id,role:'admin',password_hash:'bad'});
            assert.equal(result.status,200);assert.equal(result.data.name,'آرش گیمر');assert.equal(result.data.displayName,'Alpha Player');assert.equal(result.data.id,userA.id);assert.equal(result.data.role,'user');
            assert.equal((await b.request('/api/users/me')).data.name,'کاربر بتا');
            assert.equal((await a.request('/api/users/me','PUT',{avatar:'https://attacker.invalid'})).status,400);
        });
        await t.test('address book CRUD, default and owner checks',async()=>{
            const legacy=await b.request('/api/users/me','PUT',{addresses:[{name:'گیرنده قدیمی',phone:'09120002222',address:'نشانی قدیمی بدون فیلدهای جدید'}]});
            assert.equal(legacy.status,200);
            assert.equal((await b.request('/api/users/me/addresses/'+legacy.data.addresses[0].id,'PUT',{isDefault:true})).status,200);
            const data={title:'خانه',name:'گیرنده تست',phone:fields.phone,province:'تهران',city:'تهران',address:'نشانی آزمایشی خیابان یک پلاک دو',postalCode:'1234567890',userId:userB.id};
            assert.equal((await a.request('/api/users/me/addresses','POST',{...data,postalCode:'123'})).status,400);
            address=(await a.request('/api/users/me/addresses','POST',data)).data;assert.equal(address.isDefault,true);
            const second=(await a.request('/api/users/me/addresses','POST',{...data,title:'محل کار',isDefault:true})).data;
            let rows=(await a.request('/api/users/me/addresses')).data;assert.equal(rows.filter(a=>a.isDefault).length,1);assert.equal(rows.find(a=>a.isDefault).id,second.id);
            assert.equal((await b.request('/api/users/me/addresses/'+address.id,'PUT',{...data,title:'دسترسی غیرمجاز'})).status,404);
            assert.equal((await b.request('/api/users/me/addresses/'+address.id,'DELETE',{})).status,404);
            assert.equal((await b.request('/api/users/me','PUT',{addresses:[address]})).status,404);
            assert.equal((await a.request('/api/users/me/addresses/'+address.id,'PUT',{title:'خانه جدید',isDefault:true})).status,200);
            await a.request('/api/users/me/addresses/'+second.id,'DELETE',{});
            rows=(await a.request('/api/users/me/addresses')).data;assert.equal(rows.length,1);assert.equal(rows[0].title,'خانه جدید');
        });
        await t.test('wishlist is persistent and per user',async()=>{
            const products=(await anonymous.request('/api/products')).data;productId=String(products.find(p=>p.stock>2).id);
            assert.equal((await a.request('/api/users/me/wishlist/'+productId,'PUT',{userId:userB.id})).status,200);
            await a.request('/api/users/me/wishlist/'+productId,'PUT',{});
            assert.equal((await a.request('/api/users/me/wishlist')).data.length,1);
            assert.equal((await b.request('/api/users/me/wishlist')).data.length,0);
            await b.request('/api/users/me/wishlist/'+productId,'DELETE',{});
            assert.equal((await a.request('/api/users/me/wishlist')).data.length,1);
            assert.equal((await a.request('/api/users/me/wishlist/not-a-product','PUT',{})).status,404);
        });
        await t.test('support conversations, admin response, notifications and IDOR protections',async()=>{
            ticket=(await a.request('/api/tickets','POST',{subject:'پیگیری سفارش',category:'order',message:'متن پیام آزمایشی برای پشتیبانی',userId:userB.id,status:'closed'})).data;
            assert.equal(ticket.userId,userA.id);assert.equal(ticket.status,'open');
            assert.equal((await b.request('/api/tickets')).data.length,0);
            assert.equal((await b.request('/api/tickets/'+ticket.id)).status,404);
            assert.equal((await b.request('/api/tickets/'+ticket.id+'/messages','POST',{message:'پیام غیرمجاز'})).status,404);
            assert.equal((await a.request('/api/admin/tickets/'+ticket.id,'PUT',{status:'closed'})).status,401);
            assert.equal((await admin.request('/api/admin/tickets')).data.length,1);
            const answer=await admin.request('/api/admin/tickets/'+ticket.id,'PUT',{status:'answered',message:'پاسخ مدیر به درخواست تست شما'});assert.equal(answer.status,200);
            assert.equal((await a.request('/api/tickets/'+ticket.id)).data.messages[1].author,'admin');
            const notifications=(await a.request('/api/users/me/notifications')).data;
            assert.equal(notifications.unread,1);notificationId=notifications.items[0].id;
            assert.equal((await b.request('/api/users/me/notifications/'+notificationId+'/read','PUT',{})).status,404);
            assert.equal((await b.request('/api/users/me/notifications')).data.unread,0);
            await a.request('/api/users/me/notifications/'+notificationId+'/read','PUT',{});
            assert.equal((await a.request('/api/users/me/notifications')).data.unread,0);
            await a.request('/api/tickets/'+ticket.id+'/messages','POST',{message:'پیام پیگیری جدید مشتری'});
            assert.equal((await admin.request('/api/admin/tickets/'+ticket.id)).data.status,'open');
            await admin.request('/api/admin/tickets/'+ticket.id,'PUT',{status:'closed'});
            assert.equal((await a.request('/api/tickets/'+ticket.id+'/messages','POST',{message:'درخواست بسته است'})).status,409);
            assert.equal((await a.request('/api/tickets','POST',{subject:'موضوع',category:'invalid',message:'تست اعتبارسنجی'})).status,400);
            assert.equal((await admin.request('/api/admin/notifications','POST',{userId:userA.id,title:'پیام فروشگاه',message:'پیام واقعی از مدیر برای حساب تست'})).status,201);
            assert.equal((await a.request('/api/admin/notifications','POST',{userId:userB.id,title:'غیرمجاز',message:'پیام غیرمجاز'})).status,401);
        });
        await t.test('orders and details, admin status update and event notifications',async()=>{
            assert.equal((await admin.request('/api/admin/orders/legacy-account-test-order','PUT',{status:'shipped'})).status,200);
            assert.equal((await a.request('/api/orders/legacy-account-test-order')).status,404);
            const body={items:[{id:Number(productId),quantity:1}],recipientName:'گیرنده تست',recipientPhone:fields.phone,recipientAddress:'نشانی آزمایشی سفارش خیابان تست',isAgreed:true,userId:userB.id};
            order=(await a.request('/api/checkout','POST',body)).data.order;assert.equal(order.userId,userA.id);
            const count=(await a.request('/api/users/me/notifications')).data.items.length;
            await a.request('/api/checkout','POST',body);assert.equal((await a.request('/api/users/me/notifications')).data.items.length,count);
            assert.equal((await b.request('/api/orders/'+order.id)).status,404);
            assert.equal((await b.request('/api/orders')).data.length,0);
            assert.equal((await b.request('/api/admin/orders/'+order.id,'PUT',{status:'shipped'})).status,401);
            await admin.request('/api/admin/orders/'+order.id,'PUT',{status:'shipped'});
            assert.equal((await a.request('/api/orders/'+order.id)).data.status,'shipped');
            let stats=(await a.request('/api/account/dashboard')).data.stats;assert.equal(stats.orders,1);assert.equal(stats.pending,0);
            await admin.request('/api/admin/orders/'+order.id,'PUT',{status:'delivered'});
            stats=(await a.request('/api/account/dashboard')).data.stats;assert.equal(stats.completed,1);assert.equal(stats.pending,0);
            assert.equal((await a.request('/api/orders/'+order.id)).data.items.length,1);
            await a.request('/api/users/me/notifications/read','PUT',{});assert.equal((await a.request('/api/users/me/notifications')).data.unread,0);
        });
        await t.test('all account records and session survive restart',async()=>{
            await stop();await start();
            assert.equal((await a.request('/api/auth/session')).data.user.id,userA.id);
            assert.equal((await a.request('/api/users/me/addresses')).data.length,1);
            assert.equal((await a.request('/api/users/me/wishlist')).data.length,1);
            assert.equal((await a.request('/api/tickets/'+ticket.id)).data.messages.length,3);
            assert.equal((await a.request('/api/orders/'+order.id)).data.status,'delivered');
        });
        await t.test('password hash, rotation, session privacy and logout/login again',async()=>{
            await otherSession.request('/api/auth/login','POST',fields);
            const active=(await a.request('/api/users/me/sessions')).data;assert.equal(active.length,2);assert.equal(active.filter(s=>s.current).length,1);
            assert.ok(active.every(s=>!s.hash&&!s.csrf&&!s.token&&!s.principal));
            const newPassword='new-account-alpha-password-2026';
            assert.equal((await a.request('/api/users/me/password','PUT',{currentPassword:'wrong',newPassword,confirmPassword:newPassword})).status,403);
            assert.equal((await a.request('/api/users/me/password','PUT',{currentPassword:fields.password,newPassword,confirmPassword:'different'})).status,400);
            assert.equal((await a.request('/api/users/me/password','PUT',{currentPassword:fields.password,newPassword,confirmPassword:newPassword})).status,200);
            assert.equal((await otherSession.request('/api/account/dashboard')).status,401);
            assert.equal((await a.request('/api/users/me/sessions')).data.length,1);
            const inspect=new DatabaseSync(database),row=inspect.prepare('SELECT * FROM accounts WHERE id=?').get(userA.id);
            assert.match(row.password_hash,/^\$2b\$12\$/);assert.ok(!row.payload.includes(newPassword));assert.ok(!row.payload.includes(fields.password));inspect.close();
            await a.request('/api/auth/logout','POST',{});assert.equal((await a.request('/api/account/dashboard')).status,401);
            assert.equal((await a.request('/api/auth/login','POST',fields)).status,401);
            assert.equal((await a.request('/api/auth/login','POST',{email:fields.email,password:newPassword})).status,200);
            assert.equal((await a.request('/api/tickets')).data.length,1);
        });
    }finally{await stop();if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()))throw Error('Unsafe temporary cleanup');fs.rmSync(temp,{recursive:true,force:true});}
});
