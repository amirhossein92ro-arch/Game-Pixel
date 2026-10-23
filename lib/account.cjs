'use strict';
const crypto = require('node:crypto');
const bcrypt = require('./passwords.cjs');
const {pageQuery,collectionPage,respond,orderSummary}=require('./listing.cjs');
const fail = (status, message) => Object.assign(new Error(message), {status});
const date = () => new Date().toISOString();
function field(value, label, min = 0, max = 100) {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
        throw fail(400, `${label} معتبر وارد کنید (بین ${min} و ${max} کاراکتر).`);
    return value.trim();
}
function addressInput(body, id, strict = true) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'اطلاعات آدرس نامعتبر است.');
    const phone = field(body.phone, 'شماره موبایل', 11, 11);
    if (!/^09\d{9}$/.test(phone)) throw fail(400, 'شماره موبایل باید ۱۱ رقم و با 09 شروع شود.');
    const postalCode = field(body.postalCode ?? '', 'کد پستی', 0, 10);
    if (postalCode && !/^\d{10}$/.test(postalCode)) throw fail(400, 'کد پستی باید ۱۰ رقم باشد.');
    if (body.isDefault !== undefined && typeof body.isDefault !== 'boolean') throw fail(400, 'وضعیت آدرس پیش‌فرض نامعتبر است.');
    return {id, title: field(body.title ?? (strict ? '' : 'آدرس'), 'عنوان', strict ? 2 : 0, 60),
        name: field(body.name, 'نام گیرنده', 2, 100), phone,
        province: field(body.province ?? '', 'استان', strict ? 2 : 0, 60),
        city: field(body.city ?? '', 'شهر', strict ? 2 : 0, 60),
        address: field(body.address, 'نشانی', 10, 1000), postalCode, isDefault: body.isDefault === true};
}
function profileFields(body, user) {
    const result = {};
    for (const key of ['firstName', 'lastName', 'displayName']) {
        if (body[key] !== undefined) result[key] = field(body[key], {firstName:'نام', lastName:'نام خانوادگی', displayName:'نام نمایشی'}[key], key === 'firstName' ? 2 : 0, key === 'displayName' ? 60 : 50);
    }
    result.name = result.firstName !== undefined || result.lastName !== undefined
        ? `${result.firstName ?? user.firstName ?? user.name} ${result.lastName ?? user.lastName ?? ''}`.trim()
        : field(body.name ?? user.name, 'نام', 2, 100);
    if (body.avatar !== undefined) {
        if (!['gamepad','astronaut','dragon','robot','bolt','headset'].includes(body.avatar)) throw fail(400, 'آواتار نامعتبر است.');
        result.avatar = body.avatar;
    }
    return result;
}
function installAccount(router, store, security) {
    const {transaction, list} = store;
    const {requireUser, requireAdmin, route, createSession, factors} = security;
    const factorLimit=require('./rate-limits.cjs').persistentLimit(store,{scope:'account-factor',limit:12,windowMs:15*60000});
    const uid = req => req.session.user.id;
    function currentUser(req){
        const row=store.access('account').findAccountsById(uid(req));
        const legacy=store.get('users',uid(req));
        if(!row||JSON.parse(row.payload).banned||legacy?.banned||req.session.principal_version!==(Number(JSON.parse(row.payload).sessionVersion)||0)||!store.access('account').findSessionsByHashAndExpires(req.session.hash,Date.now()))throw fail(401,'Session has expired.');
        return {...JSON.parse(row.payload),...legacy};
    }
    function saveUser(user) {
        return transaction(()=>{
        const stored=store.access('account').findAccountsById(user.id);if(stored)user={...user,sessionVersion:Number(JSON.parse(stored.payload).sessionVersion)||0};
        const linked=store.access('account').findAdminAccountsById(user.id);
        if(linked && linked.username!==user.email){
            if(store.access('account').findAdminAccountsByUsernameAndId(user.email,user.id)) throw fail(409,'نام کاربری مدیریت تکراری است.');
            store.access('account').updateAdminAccountsById(user.email,date(),user.id);
            store.access('account').deleteSessionsByPrincipalAndKindAndAdm(user.id);
        }
        store.access('account').updateAccountsById(JSON.stringify(user), user.id);
        store.put('users',user);return user;});
    }
    function notify(userId, type, title, message, resourceId = null) {
        if (typeof userId !== 'string' || !userId) return;
        if (!store.access('account').findAccountsById2(userId)) return;
        store.repositories.notifications.create({id:crypto.randomUUID(),userId,type,title,message,resourceId,createdAt:date()});
    }
    // Queries always derive ownership from the authenticated session, never a submitted userId.
    router.get('/account/dashboard', requireUser, route((req,res) => {
        const stats=store.access('account').countOrders(uid(req));
        const orders=store.search.ordersForUser({page:1,pageSize:3},uid(req),{recent:true}).items;
        res.json({user:req.session.user,stats:{...stats,
            wishlist:store.access('account').countWishlistByUserId(uid(req)).n,
            unread:store.access('account').countNotificationsByUserIdAndReadAt(uid(req)).n},recentOrders:orders.map(orderSummary)});
    }));
    router.get('/users/me/addresses', requireUser, route((req,res) => res.json(req.session.user.addresses || [])));
    router.post('/users/me/addresses', requireUser, route((req,res) => {
        const a = addressInput(req.body, crypto.randomUUID());
        transaction(()=>{const user=currentUser(req),rows = user.addresses || [];
        if (rows.length >= 10) throw fail(400, 'حداکثر ۱۰ آدرس قابل ثبت است.');
        if (!rows.length) a.isDefault = true;
        const addresses = [...rows.map(r => a.isDefault ? {...r,isDefault:false} : r), a];
        saveUser({...user,addresses});});res.status(201).json(a);
    }));
    router.put('/users/me/addresses/:id', requireUser, route((req,res) => {
        const a=transaction(()=>{const user=currentUser(req),rows = user.addresses || [], old = rows.find(a => a.id === req.params.id);
        if (!old) throw fail(404, 'آدرس پیدا نشد.');
        const onlyDefault = Object.keys(req.body).length === 1 && Object.hasOwn(req.body,'isDefault');
        const a = addressInput({...old,...req.body},old.id,!onlyDefault);
        if (old.isDefault && !a.isDefault && !rows.some(r => r.id !== a.id && r.isDefault)) a.isDefault = true;
        const addresses = rows.map(r => r.id === a.id ? a : a.isDefault ? {...r,isDefault:false} : r);
        saveUser({...user,addresses});return a;});res.json(a);
    }));
    router.delete('/users/me/addresses/:id', requireUser, route((req,res) => {
        transaction(()=>{const user=currentUser(req),rows = user.addresses || [];
        if (!rows.some(a => a.id === req.params.id)) throw fail(404, 'آدرس پیدا نشد.');
        const addresses = rows.filter(a => a.id !== req.params.id);
        if (addresses.length && !addresses.some(a => a.isDefault)) addresses[0] = {...addresses[0],isDefault:true};
        saveUser({...user,addresses});});res.status(204).end();
    }));
    router.get('/users/me/wishlist', requireUser, route((req,res) => {
        res.json(store.access('account').listWishlistByUserId(uid(req)).map(r => {
            const current=store.get('products',r.product_id),product=current&&current.status!=='inactive'&&!current.deletedAt?Object.fromEntries(['id','name','price','discount','stock','image','category','status'].filter(k=>Object.hasOwn(current,k)).map(k=>[k,current[k]])):null;
            return {productId:r.product_id,createdAt:r.created_at,product:product || null};
        }));
    }));
    router.put('/users/me/wishlist/:id', requireUser, route((req,res) => {
        transaction(()=>{
        const product=store.get('products',req.params.id);if (!product||product.status==='inactive'||product.deletedAt) throw fail(404, 'محصول پیدا نشد.');
        if (store.access('account').countWishlistByUserId(uid(req)).n >= 200
            && !store.access('account').findWishlistByUserIdAndProductId(uid(req),req.params.id)) throw fail(400, 'حداکثر ۲۰۰ علاقه‌مندی قابل ثبت است.');
        store.access('account').createWishlist(uid(req),req.params.id,date());});res.json({productId:req.params.id});
    }));
    router.delete('/users/me/wishlist/:id', requireUser, route((req,res) => {
        store.access('account').deleteWishlistByUserIdAndProductId(uid(req),req.params.id);res.status(204).end();
    }));
    router.put('/users/me/password', requireUser, route(async(req,res) => {
        const {currentPassword,newPassword,confirmPassword} = req.body;
        if (typeof currentPassword !== 'string' || Buffer.byteLength(currentPassword) > 72
            || typeof newPassword !== 'string' || newPassword.length < 12 || Buffer.byteLength(newPassword) > 72
            || newPassword !== confirmPassword || newPassword === currentPassword) throw fail(400, 'رمز جدید باید متفاوت، حداقل ۱۲ کاراکتر، حداکثر ۷۲ بایت و با تکرار آن یکسان باشد.');
        const account = store.access('account').findAccountsById3(uid(req));
        if (!await bcrypt.compare(currentPassword,account.password_hash)) throw fail(403, 'رمز عبور فعلی اشتباه است.');
        require('./request-security.cjs').password(newPassword);
        const passwordHash = await bcrypt.hash(newPassword,12);
        // Concurrent password changes cannot overwrite a password verified against an old hash.
        const csrfToken = transaction(() => {
            const latest=store.access('account').findAccountsById(uid(req));
            if(!latest||JSON.parse(latest.payload).banned||req.session.principal_version!==(Number(JSON.parse(latest.payload).sessionVersion)||0)||!store.access('account').findSessionsByHashAndExpires2(req.session.hash,Date.now()))throw fail(401,'Session has expired.');
            const result = store.access('account').updateAccountsByIdAndPasswordHash(passwordHash,uid(req),account.password_hash);
            if (!result.changes) throw fail(409, 'رمز قبلاً تغییر کرده است؛ دوباره وارد شوید.');
            store.access('account').updateAdminAccountsById2(passwordHash,date(),uid(req));
            store.access('account').updatePasswordResetChallengesByUserIdAndUsedAt(Date.now(),uid(req));
            store.revokeSessions(uid(req));store.securityEvent('USER_PASSWORD_CHANGED',uid(req));
            notify(uid(req),'security','رمز عبور تغییر کرد','رمز شما تغییر کرد و نشست‌های قبلی پایان یافتند.');
            return createSession(res,uid(req),'user',req);
        });
        res.json({message:'رمز عبور تغییر کرد. سایر نشست‌ها بسته شدند.',csrfToken});
    }));
    router.get('/users/me/sessions', requireUser, route((req,res) => {
        res.json(store.access('account').listSessionsByPrincipalAndKindAndExpires(uid(req),Date.now())
            .map(s => ({id:s.public_id,current:s.hash === req.session.hash,createdAt:s.created_at || null,lastActivity:s.last_activity_at||null,expiresAt:new Date(s.expires).toISOString(),device:s.device || 'مرورگر',ip:s.ip&&/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s.ip)?s.ip.replace(/\.\d+$/,'.x'):null})));
    }));
    router.delete('/users/me/sessions/:id',requireUser,route((req,res)=>{
        const row=store.access('account').findSessionsByPrincipalAndKindAndPublicId(uid(req),req.params.id);
        if(!row)throw fail(404,'نشست پیدا نشد.');if(row.hash===req.session.hash)throw fail(409,'برای خروج از نشست فعلی از دکمه خروج استفاده کنید.');
        store.access('account').deleteSessionsByHash(row.hash);store.securityEvent('USER_SESSION_REVOKED',uid(req));notify(uid(req),'security','نشست بسته شد','یکی از نشست‌های حساب شما بسته شد.');res.status(204).end();
    }));
    router.post('/users/me/sessions/logout-others',requireUser,route((req,res)=>{
        const count=store.access('account').deleteSessionsByPrincipalAndKindAndHash(uid(req),req.session.hash).changes;
        store.securityEvent('USER_OTHER_SESSIONS_REVOKED',uid(req),{count});notify(uid(req),'security','خروج از دستگاه‌های دیگر','نشست‌های دیگر حساب شما بسته شدند.');res.json({revoked:count});
    }));
    router.get('/users/me/security',requireUser,route((req,res)=>res.json({twoFactor:factors.status(uid(req)),events:store.access('account').listAuditLogsByTargetTypeAndTargetIdAndActorRole(uid(req))})));
    function mutateFactors(req,verifiedPassword,work) {
        return transaction(()=>{
            currentUser(req);
            if(verifiedPassword&&store.access('account').findAccountsById3(uid(req))?.password_hash!==verifiedPassword)throw fail(409,'رمز عبور تغییر کرده است.');
            return work();
        });
    }
    router.post('/users/me/2fa/setup',requireUser,route(async(req,res)=>{
        factorLimit(uid(req));const verified=await factors.password(uid(req),req.body.currentPassword);
        const secret=mutateFactors(req,verified,()=>factors.start(uid(req)));
        res.json({secret,uri:`otpauth://totp/${encodeURIComponent('WEB 2:'+req.session.user.email)}?secret=${secret}&issuer=${encodeURIComponent('WEB 2')}&digits=6&period=30`});
    }));
    router.post('/users/me/2fa/confirm',requireUser,route((req,res)=>{
        factorLimit(uid(req));const recoveryCodes=mutateFactors(req,null,()=>{
            const codes=factors.confirm(uid(req),req.body.code);store.access('account').deleteSessionsByPrincipalAndKindAndHash(uid(req),req.session.hash);
            notify(uid(req),'security','تأیید دومرحله‌ای فعال شد','امنیت ورود حساب شما افزایش یافت. نشست‌های دیگر بسته شدند.');return codes;
        });res.json({recoveryCodes});
    }));
    router.post('/users/me/2fa/disable',requireUser,route(async(req,res)=>{
        factorLimit(uid(req));const verified=await factors.password(uid(req),req.body.currentPassword);
        mutateFactors(req,verified,()=>{factors.disable(uid(req),req.body.code);notify(uid(req),'security','تأیید دومرحله‌ای غیرفعال شد','تأیید دومرحله‌ای حساب شما غیرفعال شد.');});res.status(204).end();
    }));
    router.post('/users/me/2fa/recovery-codes',requireUser,route(async(req,res)=>{
        factorLimit(uid(req));const verified=await factors.password(uid(req),req.body.currentPassword);
        const recoveryCodes=mutateFactors(req,verified,()=>{const codes=factors.regenerate(uid(req),req.body.code);notify(uid(req),'security','کدهای بازیابی تازه شدند','کدهای بازیابی قبلی دیگر معتبر نیستند.');return codes;});res.json({recoveryCodes});
    }));
    router.get('/users/me/notifications', requireUser, route((req,res) => {
        const {page,pageSize,offset}=pageQuery(req.query,100),total=store.access('account').countNotificationsByUserId(uid(req)).n;
        const rows = store.access('account').listNotificationsByUserId(uid(req),pageSize,offset);
        res.json({items:rows,total,page,pageSize,pages:Math.ceil(total/pageSize),unread:store.access('account').countNotificationsByUserIdAndReadAt(uid(req)).n});
    }));
    router.put('/users/me/notifications/read', requireUser, route((req,res) => {
        store.access('account').updateNotificationsByUserIdAndReadAt(date(),uid(req));res.json({unread:0});
    }));
    router.put('/users/me/notifications/:id/read', requireUser, route((req,res) => {
        const result = store.access('account').updateNotificationsByIdAndUserId(date(),req.params.id,uid(req));
        if (!result.changes) throw fail(404, 'اعلان پیدا نشد.');res.json({read:true});
    }));
    const categories = ['order','payment','product','account','other'];
    const tickets = id => store.access('account').listTicketsByUserId(id);
    function ticket(id, userId) {
        const row = userId ? store.access('account').findTicketsByIdAndUserId(id,userId) : store.access('account').findTicketsById(id);
        if (!row) throw fail(404, 'درخواست پشتیبانی پیدا نشد.');
        return {id:row.id,userId:row.user_id,subject:row.subject,category:row.category,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,
            messages:store.access('account').listTicketMessagesByTicketId(id)};
    }
    function message(ticketId, author, body) {
        store.access('account').createTicketMessages(crypto.randomUUID(),ticketId,author,field(body,'متن پیام',5,4000),date());
    }
    router.get('/tickets', requireUser, route((req,res) => {const {page,pageSize,offset}=pageQuery(req.query,Object.keys(req.query).length?20:100),total=store.access('account').countTicketsByUserId(uid(req)).n,items=store.access('account').listTicketsByUserId2(uid(req),pageSize,offset);return respond(req,res,{items,total,page,pageSize});}));
    router.post('/tickets', requireUser, route((req,res) => {
        const subject = field(req.body.subject,'موضوع',3,150),category = req.body.category;
        if (!categories.includes(category)) throw fail(400, 'دسته‌بندی نامعتبر است.');
        const id = crypto.randomUUID();
        transaction(() => {
            store.access('account').createTickets(id,uid(req),subject,category,'open',date(),date());
            message(id,'user',req.body.message);
        });res.status(201).json(ticket(id,uid(req)));
    }));
    router.get('/tickets/:id', requireUser, route((req,res) => res.json(ticket(req.params.id,uid(req)))));
    router.post('/tickets/:id/messages', requireUser, route((req,res) => {
        const id=transaction(()=>{
        const row = ticket(req.params.id,uid(req));
        if (row.status === 'closed') throw fail(409, 'این درخواست بسته شده است؛ درخواست جدید ثبت کنید.');
        if (row.messages.length >= 100) throw fail(400, 'حداکثر تعداد پیام‌ها ثبت شده است.');
        message(row.id,'user',req.body.message);store.access('account').updateTicketsById(date(),row.id);return row.id;});
        res.status(201).json(ticket(id,uid(req)));
    }));
    router.get('/admin/tickets', requireAdmin, route((req,res) => {
        const {page,pageSize,offset}=pageQuery(req.query,Object.keys(req.query).length?20:100),status=String(req.query.status||'');if(!['','open','answered','closed'].includes(status))throw fail(400,'فیلتر نامعتبر است.');
        const total=store.access('account').countTicketsByStatus(status,status).n;
        const items=store.access('account').listTicketsByStatus(status,status,pageSize,offset);return respond(req,res,{items,total,page,pageSize});
    }));
    router.get('/admin/tickets/:id', requireAdmin, route((req,res) => res.json(ticket(req.params.id))));
    router.put('/admin/tickets/:id', requireAdmin, route((req,res) => {
        const id=transaction(()=>{
        const row = ticket(req.params.id),body = req.body;
        if (!['open','answered','closed'].includes(body.status)) throw fail(400, 'وضعیت تیکت نامعتبر است.');
        if (body.status === 'answered' && !body.message && !row.messages.some(m => m.author === 'admin')) throw fail(400, 'برای پاسخ‌داده‌شده ابتدا پاسخ ثبت کنید.');
        if (row.messages.length >= 100 && body.message) throw fail(400, 'حداکثر تعداد پیام‌ها ثبت شده است.');
            if (body.message) message(row.id,'admin',body.message);
            store.access('account').updateTicketsById2(body.status,date(),row.id);
            if (body.message || row.status !== body.status) notify(row.userId,'ticket','پشتیبانی درخواست شما را بررسی کرد',row.subject,row.id);
            return row.id;
        });res.json(ticket(id));
    }));
    router.post('/admin/notifications', requireAdmin, route((req,res) => {
        const id = field(req.body.userId,'شناسه کاربر',1,100);
        if (!store.access('account').findAccountsById4(id)) throw fail(404, 'حساب پیدا نشد.');
        notify(id,'store',field(req.body.title,'عنوان',3,100),field(req.body.message,'پیام',5,1000));res.status(201).json({sent:true});
    }));
    router.get('/admin/notification-recipients', requireAdmin, route((req,res) => {
        const {page,pageSize,offset}=pageQuery(req.query,Object.keys(req.query).length?20:100),q=field(req.query.q||'','جستجو',0,120).toLowerCase();
        const {items,total}=store.search.recipients(q,pageSize,offset);return respond(req,res,{items,total,page,pageSize});
    }));
    return {notify,saveUser};
}
module.exports = {installAccount,profileFields,addressInput,field};
