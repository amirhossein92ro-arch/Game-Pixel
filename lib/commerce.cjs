'use strict';
const crypto=require('node:crypto');
const bcrypt=require('bcrypt');
const express=require('express');
const {getPaymentProvider}=require('./payment.cjs');
const {installAccount,profileFields,addressInput,field}=require('./account.cjs');
const {createAdminSecurity,validateBootstrapPassword}=require('./admin-security.cjs');
const {installManagement}=require('./management.cjs');
const {readSettings,shippingFor}=require('./site.cjs');
const {analytics}=require('./analytics.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const text=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const error=(status,message)=>Object.assign(new Error(message),{status});
function installCommerce(app,store) {
    const {db,transaction,list}=store;
    const production=process.env.NODE_ENV==='production';
    // Explicit loopback allowlist for separate development frontend ports only.
    const developmentOrigins = production ? [] : (process.env.DEV_FRONTEND_ORIGINS ?? 'http://localhost:5500,http://127.0.0.1:5500').split(',').map(v=>v.trim()).filter(Boolean);
    for (const origin of developmentOrigins) {
        const url = new URL(origin);
        if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname) || url.origin !== origin) throw Error('DEV_FRONTEND_ORIGINS must contain loopback origins only');
    }
    app.use('/api', require('cors')({
        origin(origin, callback) { callback(null, developmentOrigins.includes(origin)); },
        credentials: true,
        methods: ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],
        allowedHeaders: ['Content-Type','X-CSRF-Token','Idempotency-Key'],
    }));
    validateBootstrapPassword(process.env);
    if(production && (!process.env.APP_ORIGIN?.startsWith('https://') || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length<12))throw Error('Production requires HTTPS APP_ORIGIN and ADMIN_PASSWORD (12+ characters).');
    const adminSecurity=createAdminSecurity(store);
    const now=()=>new Date().toISOString();
    const publicUser=row=>{
        const u=JSON.parse(row.payload);
        const legacy=list('users').find(p=>String(p.id)===String(row.id));
        return {...u,id:row.id,email:row.email,phone:row.phone,role:legacy?.role||u.role||'user',banned:legacy?.banned||false};
    };
    function session(req,kind='user') {
        const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`web2_${kind}=`));
        if(!cookie)return null;
        const token=cookie.slice(cookie.indexOf('=')+1);
        const s=db.prepare('SELECT * FROM sessions WHERE hash=? AND kind=? AND expires>?').get(hash(token),kind,Date.now());
        if(!s)return null;
        if(kind==='user') {const row=db.prepare('SELECT * FROM accounts WHERE id=?').get(s.principal);if(!row)return null;s.user=publicUser(row);if(s.user.banned)return null;}
        if(kind==='admin'){const row=db.prepare('SELECT * FROM admin_accounts WHERE id=? AND active=1').get(s.principal);if(!row)return null;s.admin=adminSecurity.publicAdmin(row);}
        return s;
    }
    function createSession(res,principal,kind,req) {
        db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
        const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(hash(token),principal,kind,csrf,Date.now()+8*3600000);
        const ua=String(req?.headers['user-agent']||'');
        const device=/Edg\//.test(ua)?'Microsoft Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'مرورگر';
        db.prepare('INSERT INTO session_details VALUES(?,?,?)').run(hash(token),now(),device+(/Mobile|Android|iPhone/.test(ua)?' · موبایل':' · رایانه'));
        res.cookie(`web2_${kind}`,token,{httpOnly:true,secure:production,sameSite:'strict',path:'/',maxAge:8*3600000});
        return csrf;
    }
    function requireUser(req,res,next){req.session=session(req);if(!req.session)return next(error(401,'ابتدا وارد حساب کاربری شوید.'));next();}
    function requireAdmin(req,res,next){try{req.adminSession=session(req,'admin');if(!req.adminSession)return next(error(401,'ورود مدیر لازم است.'));req.admin=req.adminSession.admin;adminSecurity.authorize(req.admin,req.originalUrl.split('?')[0],req.method);
        if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers['x-csrf-token']!==req.adminSession.csrf)throw error(403,'اعتبار امنیتی درخواست نامعتبر است.');
        if(!req.auditHook && !['GET','HEAD','OPTIONS'].includes(req.method)){req.auditHook=true;const original=res.json.bind(res);res.json=value=>{if(res.statusCode<400&&!req.auditRecorded){const path=req.originalUrl.split('?')[0],resource=path.includes('/products')?'PRODUCT':path.includes('/orders')?'ORDER_STATUS':path.includes('/discounts')?'DISCOUNT':path.includes('/users')?'CUSTOMER':path.includes('/tickets')?'TICKET':'ADMIN';adminSecurity.audit(req.admin,resource+'_'+({POST:'CREATED',PUT:'UPDATED',DELETE:'DELETED'}[req.method]||req.method), resource.toLowerCase(),req.params.id||value?.id||'');req.auditRecorded=true;}return original(value);};}next();}catch(e){next(e);}}
    const rates=new Map();
    app.use((req,res,next)=>{
        res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
        if(production)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
        // Inline styles remain supported for the existing gaming UI; script sources are constrained.
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
        if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
        if(req.path.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method)) {
            const expected=process.env.APP_ORIGIN||`${req.protocol}://${req.get('host')}`;
            if(req.headers.origin && req.headers.origin!==expected && !developmentOrigins.includes(req.headers.origin))return next(error(403,'مبدأ درخواست مجاز نیست.'));
            if(req.headers['sec-fetch-site']==='cross-site')return next(error(403,'درخواست بین‌سایتی مجاز نیست.'));
            if(!req.is('application/json'))return next(error(415,'درخواست باید JSON باشد.'));
            if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))return next(error(400,'بدنه درخواست باید یک شیء JSON معتبر باشد.'));
            const kind=req.path.startsWith('/api/admin/')?'admin':'user';
            const s=session(req,kind);
            if(s&&req.headers['x-csrf-token']!==s.csrf)return next(error(403,'اعتبار امنیتی درخواست منقضی شده است؛ صفحه را تازه کنید.'));
            if(req.body && ['cardNumber','cvv','cvv2','expiryDate'].some(k=>k in req.body))return next(error(400,'اطلاعات کارت بانکی را ارسال نکنید.'));
        }
        if(/^\/api\/(auth|admin\/login|checkout|contact|tickets|users\/me\/password)/.test(req.path)) {
            const key=`${req.ip}:${req.path}`;const time=Date.now();
            if(rates.size>10000)for(const [k,v]of rates)if(v.until<time)rates.delete(k);
            if(rates.size>=10000&&!rates.has(key))return next(error(429,'درخواست‌ها زیاد است؛ بعداً تلاش کنید.'));
            const r=rates.get(key)||{count:0,until:time+60000};
            if(r.until<time){r.count=0;r.until=time+60000;}r.count++;rates.set(key,r);
            if(r.count>30){res.setHeader('Retry-After','60');return next(error(429,'درخواست‌ها زیاد است؛ یک دقیقه بعد دوباره تلاش کنید.'));}
        }
        next();
    });
    const router=express.Router();
    const route=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res,next)).catch(next);
    installManagement(router,store,{requireAdmin,route,adminSecurity});
    router.use('/checkout',(req,res,next)=>readSettings(store).maintenance?next(error(503,'فروشگاه در حال به‌روزرسانی است؛ کمی بعد تلاش کنید.')):next());
    const accountFeatures=installAccount(router,store,{requireUser,requireAdmin,route,createSession});
    function credentials(body,register=false) {
        const email=field(body.email,'ایمیل',5,200).toLowerCase(),password=typeof body.password==='string'?body.password:'';
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||Buffer.byteLength(password)>72||password.length<(register?12:1))throw error(400,'ایمیل معتبر و رمز عبور حداقل ۱۲ کاراکتری لازم است.');
        return {email,password};
    }
    router.post('/auth/register',route(async(req,res)=>{
        const {email,password}=credentials(req.body,true),name=field(req.body.name,'نام',2,100),phone=field(req.body.phone,'شماره موبایل',11,11);
        if(name.length<2||!/^09\d{9}$/.test(phone))throw error(400,'نام و شماره موبایل معتبر وارد کنید.');
        if(db.prepare('SELECT id FROM accounts WHERE email=? OR phone=?').get(email,phone))throw error(409,'این حساب قبلاً ثبت شده است.');
        const passwordHash=await bcrypt.hash(password,12),id=crypto.randomUUID();
        const user={id,name,firstName:name,lastName:'',displayName:name,avatar:'gamepad',email,phone,role:'user',addresses:[],joinDate:now()};
        transaction(()=>{if(db.prepare('SELECT id FROM accounts WHERE email=? OR phone=?').get(email,phone))throw error(409,'این حساب قبلاً ثبت شده است.');db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?)').run(id,email,phone,passwordHash,JSON.stringify(user));store.replace('users',[...list('users'),user]);});
        res.status(201).json({user,csrfToken:createSession(res,id,'user',req)});
    }));
    router.post('/auth/login',route(async(req,res)=>{
        const {email,password}=credentials(req.body);
        const row=db.prepare('SELECT * FROM accounts WHERE email=?').get(email);
        const valid=await bcrypt.compare(password,row?.password_hash||'$2b$12$uJbYKWiNFXiFSNTybLV2y.fUPnWxXVdOKtpTgCO.oZRNgL4FKae1i');
        if(!row||!valid||publicUser(row).banned)throw error(401,'ایمیل یا رمز عبور اشتباه است.');
        res.json({user:publicUser(row),csrfToken:createSession(res,row.id,'user',req)});
    }));
    router.get('/auth/session',route((req,res)=>{const s=session(req);res.json({user:s?.user||null,csrfToken:s?.csrf||null});}));
    router.post('/auth/logout',requireUser,route((req,res)=>{db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session.hash);res.clearCookie('web2_user',{path:'/'});res.status(204).end();}));
    router.get('/users/me',requireUser,route((req,res)=>res.json(req.session.user)));
    router.put('/users/me',requireUser,route(async(req,res)=>{
        const user=req.session.user,profile=profileFields(req.body,user);
        const email=field(req.body.email ?? user.email,'ایمیل',5,200).toLowerCase(),phone=field(req.body.phone ?? user.phone,'شماره موبایل',11,11);
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^09\d{9}$/.test(phone))throw error(400,'ایمیل یا شماره موبایل نامعتبر است.');
        if(email!==user.email||phone!==user.phone) {
            const account=db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(user.id);
            if(!await bcrypt.compare(String(req.body.currentPassword||''),account.password_hash))throw error(403,'برای تغییر ایمیل یا موبایل، رمز عبور فعلی را وارد کنید.');
            if(db.prepare('SELECT id FROM accounts WHERE (email=? OR phone=?) AND id<>?').get(email,phone,user.id))throw error(409,'ایمیل یا شماره موبایل قبلاً استفاده شده است.');
        }
        if(req.body.addresses!==undefined&&(!Array.isArray(req.body.addresses)||req.body.addresses.length>10))throw error(400,'فهرست آدرس‌ها نامعتبر است.');
        const addresses=Array.isArray(req.body.addresses)?req.body.addresses.map(a=>{
            if(a?.id&&!user.addresses?.some(old=>old.id===a.id))throw error(404,'آدرس پیدا نشد.');
            return addressInput(a,a.id||crypto.randomUUID(),false);
        }):undefined;
        if(addresses&&new Set(addresses.map(a=>a.id)).size!==addresses.length)throw error(400,'آدرس تکراری است.');
        if(addresses?.length){const defaultId=(addresses.find(a=>a.isDefault)||addresses[0]).id;addresses.forEach(a=>a.isDefault=a.id===defaultId);}
        const updated=transaction(()=>{
            const latest=publicUser(db.prepare('SELECT * FROM accounts WHERE id=?').get(user.id));
            const updated={...latest,...profile,email,phone,addresses:addresses??latest.addresses??[],updatedAt:now()};
            db.prepare('UPDATE accounts SET email=?,phone=? WHERE id=?').run(email,phone,user.id);
            accountFeatures.saveUser(updated);return updated;
        });res.json(updated);
    }));
    router.get('/orders',requireUser,route((req,res)=>res.json(list('orders').filter(o=>o.userId===req.session.user.id))));
    router.get('/orders/:id',requireUser,route((req,res)=>{const o=list('orders').find(o=>String(o.id)===req.params.id&&o.userId===req.session.user.id);if(!o)throw error(404,'سفارش پیدا نشد.');res.json(o);}));
    router.post('/admin/login',route(async(req,res)=>{
        if(!db.prepare('SELECT id FROM admin_accounts WHERE active=1').get())throw error(503,'حساب مدیریت هنوز روی سرور تنظیم نشده است.');
        const admin=await adminSecurity.login(req.body,req.ip);
        res.json({...admin,csrfToken:createSession(res,admin.id,'admin',req)});
    }));
    router.get('/admin/session',requireAdmin,route((req,res)=>res.json({...req.admin,csrfToken:req.adminSession.csrf})));
    router.post('/admin/logout',requireAdmin,route((req,res)=>{db.prepare('DELETE FROM sessions WHERE hash=?').run(req.adminSession.hash);res.clearCookie('web2_admin',{path:'/'});res.status(204).end();}));
    const statuses=['pending','paid','processing','shipped','delivered','cancelled'];
    router.get('/admin/orders',requireAdmin,route((req,res)=>res.json(list('orders'))));
    router.get('/admin/orders/:id',requireAdmin,route((req,res)=>{const o=list('orders').find(o=>String(o.id)===req.params.id);if(!o)throw error(404,'سفارش پیدا نشد.');res.json(o);}));
    router.put('/admin/orders/:id',requireAdmin,route((req,res)=>{
        if(!statuses.includes(req.body.status))throw error(400,'وضعیت سفارش نامعتبر است.');
        const order=transaction(()=>{
            const orders=list('orders'),o=orders.find(o=>String(o.id)===req.params.id);if(!o)throw error(404,'سفارش پیدا نشد.');
            if(o.status==='cancelled'&&req.body.status!=='cancelled')throw error(409,'سفارش لغوشده قابل بازگشایی نیست.');
            if(req.body.status==='paid'&&o.paymentStatus!=='paid')throw error(409,'پرداخت واقعی برای این سفارش تأیید نشده است.');
            if(req.body.status==='cancelled'&&o.status!=='cancelled') {
                if(o.paymentStatus==='paid')throw error(503,'لغو سفارش پرداخت‌شده نیازمند فرآیند بازپرداخت تأییدشده است.');
                if(o.status==='delivered')throw error(409,'سفارش تحویل‌شده از این مسیر قابل لغو نیست.');
                store.replace('products',list('products').map(p=>({...p,stock:p.stock+(o.items.find(i=>String(i.id)===String(p.id))?.quantity||0)})));
            }
            if(o.status!==req.body.status){const label={pending:'در انتظار',paid:'پرداخت‌شده',processing:'در حال آماده‌سازی',shipped:'ارسال‌شده',delivered:'تحویل‌شده',cancelled:'لغوشده'};accountFeatures.notify(o.userId,'order',req.body.status==='shipped'?'سفارش شما ارسال شد':'وضعیت سفارش تغییر کرد',`سفارش ${o.code} به وضعیت «${label[req.body.status]}» تغییر کرد.`,o.id);}
            if(o.status!==req.body.status){adminSecurity.audit(req.admin,'ORDER_STATUS_CHANGED','order',o.id,{previous:o.status,status:req.body.status});req.auditRecorded=true;}
            o.status=req.body.status;o.updatedAt=now();o.note=text(req.body.note,1000);store.replace('orders',orders);return o;
        });res.json(order);
    }));
    router.post('/admin/orders',requireAdmin,route(()=>{throw error(405,'سفارش باید از مسیر Checkout ثبت شود.');}));
    router.delete('/admin/orders/:id',requireAdmin,route(()=>{throw error(405,'سفارش را لغو کنید؛ سوابق مالی حذف نمی‌شوند.');}));
    router.get('/admin/users',requireAdmin,route((req,res)=>res.json(list('users').map(({id,name,email,phone,role,banned,joinDate})=>({id,name,email,phone,role,banned,joinDate})))));
    router.put('/admin/users/:id',requireAdmin,route((req,res)=>{
        const users=list('users'),u=users.find(u=>String(u.id)===req.params.id);if(!u)throw error(404,'کاربر پیدا نشد.');
        if(req.body.role&&!['user','admin'].includes(req.body.role))throw error(400,'نقش نامعتبر است.');
        if(req.body.role&&req.body.role!==u.role&&!adminSecurity.can(req.admin,'admins.manage'))throw error(403,'تغییر نقش فقط برای مدیر ارشد مجاز است.');
        if(req.body.banned!==undefined&&typeof req.body.banned!=='boolean')throw error(400,'وضعیت حساب نامعتبر است.');
        const previousRole=u.role;u.role=req.body.role||u.role;u.banned=req.body.banned??u.banned??false;u.updatedAt=now();store.transaction(()=>{store.replace('users',users);adminSecurity.audit(req.admin,previousRole!==u.role?'USER_ROLE_CHANGED':'CUSTOMER_STATUS_CHANGED','user',u.id,{role:u.role,banned:u.banned});req.auditRecorded=true;});res.json({id:u.id,name:u.name,email:u.email,phone:u.phone,role:u.role,banned:u.banned,joinDate:u.joinDate});
    }));
    router.post('/admin/users',requireAdmin,route(()=>{throw error(405,'حساب کاربر از مسیر ثبت‌نام ایجاد می‌شود.');}));
    router.delete('/admin/users/:id',requireAdmin,route(()=>{throw error(405,'حساب را مسدود کنید؛ سوابق سفارش حفظ می‌شوند.');}));
    function discountFor(code,subtotal) {
        if(!code)return {discount:0,discountCode:''};
        const d=list('discounts').find(d=>d.code===code.toUpperCase());
        if(!d||!d.active||(d.startsAt&&Date.parse(d.startsAt)>Date.now())||(d.expiresAt&&Date.parse(d.expiresAt)<=Date.now())||(d.maxUses!=null&&d.uses>=d.maxUses)||subtotal<(d.minPurchase||0))throw error(400,'کد تخفیف معتبر یا قابل استفاده نیست.');
        return {discount:Math.min(subtotal,d.type==='percent'?Math.round(subtotal*d.value/100):d.value),discountCode:d.code,discountId:d.id,discountType:d.type,discountValue:d.value};
    }
    function quote(items,code) {
        if(!Array.isArray(items)||!items.length||items.length>200)throw error(400,'اقلام سبد نامعتبر است.');
        const products=list('products'),ids=new Set();
        const lines=items.map(i=>{
            const p=products.find(p=>String(p.id)===String(i?.id));const q=i?.quantity;
            if(!p||p.status==='inactive'||ids.has(String(p.id))||!Number.isSafeInteger(q)||q<1||q>p.stock||!Number.isSafeInteger(p.price)||p.price<=0||!Number.isSafeInteger(q*p.price))throw error(409,'محصول ناموجود است یا تعداد و قیمت معتبر نیست؛ سبد را بررسی کنید.');
            const percent=Number.isFinite(Number(p.discount))?Math.min(99,Math.max(0,Number(p.discount))):0;
            const price=Math.round(p.price*(100-percent)/100);
            if(!Number.isSafeInteger(price)||price<1)throw error(409,'قیمت نهایی محصول معتبر نیست.');
            ids.add(String(p.id));return {id:p.id,name:p.name,price,unitPrice:price,quantity:q,lineTotal:q*price};
        });
        const subtotal=lines.reduce((sum,i)=>sum+i.lineTotal,0);
        if(!Number.isSafeInteger(subtotal))throw error(400,'مبلغ سفارش نامعتبر است.');
        const discount=discountFor(text(code,50),subtotal);
        const shippingCost=shippingFor(store,subtotal-discount.discount);
        return {items:lines,subtotal,...discount,shippingCost,total:subtotal-discount.discount+shippingCost};
    }
    router.post('/checkout/quote',requireUser,route((req,res)=>res.json(quote(req.body.items,req.body.discountCode))));
    router.post('/checkout',requireUser,route((req,res)=>{
        const key=text(req.headers['idempotency-key'],100);if(!/^[a-zA-Z0-9-]{16,100}$/.test(key))throw error(400,'شناسه درخواست سفارش لازم است.');
        const b=req.body,user=req.session.user;
        const recipientName=text(b.recipientName,100),recipientPhone=text(b.recipientPhone,20),recipientAddress=text(b.recipientAddress,1000);
        if(recipientName.length<2||!/^09\d{9}$/.test(recipientPhone)||recipientAddress.length<10||b.isAgreed!==true)throw error(400,'نام، شماره موبایل، آدرس و پذیرش شرایط لازم است.');
        const requestHash=hash(JSON.stringify({items:b.items,discountCode:b.discountCode||'',recipientName,recipientPhone,recipientAddress}));
        const result=transaction(()=>{
            const existing=db.prepare('SELECT * FROM idempotency WHERE user_id=? AND key=?').get(user.id,key);
            if(existing){if(existing.request_hash!==requestHash)throw error(409,'این شناسه برای سفارش دیگری استفاده شده است.');return {order:list('orders').find(o=>String(o.id)===existing.order_id),replayed:true};}
            const totals=quote(b.items,b.discountCode),id=crypto.randomUUID(),code=`W2-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
            const order={...totals,id,code,userId:user.id,userName:user.name,userEmail:user.email,userPhone:user.phone,recipientName,recipientPhone,recipientAddress,status:'pending',createdAt:now(),updatedAt:now(),isAgreed:true};
            const payment=getPaymentProvider().createPayment(order);Object.assign(order,payment,{paymentMethod:payment.provider});
            const insert=db.prepare('INSERT INTO orders VALUES(?,?)');insert.run(id,JSON.stringify(order));
            for(const i of order.items)db.prepare('INSERT INTO order_items VALUES(?,?,?,?)').run(id,String(i.id),i.quantity,i.price);
            store.replace('products',list('products').map(p=>({...p,stock:p.stock-(order.items.find(i=>String(i.id)===String(p.id))?.quantity||0),updatedAt:now()})));
            if(totals.discountId)store.replace('discounts',list('discounts').map(d=>d.id===totals.discountId?{...d,uses:d.uses+1}:d));
            db.prepare('INSERT INTO idempotency VALUES(?,?,?,?)').run(user.id,key,id,requestHash);
            accountFeatures.notify(user.id,'order','سفارش شما ثبت شد',`سفارش ${code} با موفقیت ثبت شد.`,id);
            return {order};
        });res.status(result.replayed?200:201).json(result);
    }));
    router.get('/admin/discounts',requireAdmin,route((req,res)=>res.json(list('discounts'))));
    function saveDiscount(req,res) {
        const rows=list('discounts'),existing=req.params.id?rows.find(d=>String(d.id)===req.params.id):null;
        if(req.params.id&&!existing)throw error(404,'کد تخفیف پیدا نشد.');
        const b={...existing,...req.body},code=text(b.code,50).toUpperCase(),value=Number(b.value),type=b.type;
        if(!/^[A-Z0-9_-]{2,50}$/.test(code)||!['percent','fixed'].includes(type)||!Number.isSafeInteger(value)||value<=0||(type==='percent'&&value>100)||rows.some(d=>d.code===code&&d.id!==existing?.id))throw error(400,'اطلاعات کد تخفیف نامعتبر است.');
        const maxUses=b.maxUses==null||b.maxUses===''?null:Number(b.maxUses),expiresAt=b.expiresAt||null;
        if((maxUses!==null&&(!Number.isSafeInteger(maxUses)||maxUses<1))||(expiresAt&&!Number.isFinite(Date.parse(expiresAt))))throw error(400,'تاریخ انقضا یا محدودیت استفاده نامعتبر است.');
        const startsAt=b.startsAt||null,minPurchase=Number(b.minPurchase||0);
        if((startsAt&&!Number.isFinite(Date.parse(startsAt)))||(startsAt&&expiresAt&&Date.parse(startsAt)>=Date.parse(expiresAt))||!Number.isSafeInteger(minPurchase)||minPurchase<0||minPurchase>1e12||(b.active!==undefined&&typeof b.active!=='boolean'))throw error(400,'زمان یا حداقل خرید نامعتبر است.');
        const d={id:existing?.id||crypto.randomUUID(),code,type,value,active:b.active!==false,maxUses,startsAt,minPurchase,expiresAt,uses:existing?.uses||0,updatedAt:now()};
        transaction(()=>{store.replace('discounts',existing?rows.map(r=>r.id===d.id?d:r):[...rows,d]);adminSecurity.audit(req.admin,existing?'DISCOUNT_UPDATED':'DISCOUNT_CREATED','discount',d.id,{code:d.code,type:d.type});req.auditRecorded=true;});res.status(existing?200:201).json(d);
    }
    router.post('/admin/discounts',requireAdmin,route(saveDiscount));router.put('/admin/discounts/:id',requireAdmin,route(saveDiscount));
    router.post('/contact',route((req,res)=>{
        const b=req.body,name=text(b.name,100),email=text(b.email),subject=text(b.subject),message=text(b.message,3000);
        if(name.length<2||!email.includes('@')||message.length<5)throw error(400,'اطلاعات پیام را کامل کنید.');
        transaction(()=>store.replace('messages',[...list('messages'),{id:crypto.randomUUID(),name,email,subject,message,createdAt:now()}]));res.status(201).json({message:'پیام ثبت شد.'});
    }));
    router.get('/admin/messages',requireAdmin,route((req,res)=>res.json(list('messages'))));
    router.get('/health',route((req,res)=>res.json({status:'ok',paymentMode:getPaymentProvider().mode})));
    app.get('/robots.txt',route((req,res)=>res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /cart\nDisallow: /checkout\nDisallow: /profile\n')));
    app.get('/sitemap.xml',route((req,res)=>{
        const origin=(process.env.APP_ORIGIN||`${req.protocol}://${req.get('host')}`).replace(/\/$/,'');
        const xml=value=>String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
        const urls=[origin+'/',...list('products').filter(p=>p.status!=='inactive').map(p=>origin+'/product.html?id='+encodeURIComponent(p.id))];
        res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>'<url><loc>'+xml(url)+'</loc></url>').join('')+'</urlset>');
    }));
    app.use('/api',router);
    // Existing product/dashboard CRUD routes retain their behavior behind this guard.
    app.use('/api/admin',requireAdmin);
    return {requireAdmin,session,stats:admin=>analytics(store,admin).stats,adminSecurity};
}
module.exports={installCommerce};
