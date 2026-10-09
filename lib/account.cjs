'use strict';
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
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
    const {db, transaction, list} = store;
    const {requireUser, requireAdmin, route, createSession} = security;
    const uid = req => req.session.user.id;
    function saveUser(user) {
        const linked=db.prepare('SELECT username FROM admin_accounts WHERE id=?').get(user.id);
        if(linked && linked.username!==user.email){
            if(db.prepare('SELECT id FROM admin_accounts WHERE username=? AND id<>?').get(user.email,user.id)) throw fail(409,'نام کاربری مدیریت تکراری است.');
            db.prepare('UPDATE admin_accounts SET username=?,updated_at=? WHERE id=?').run(user.email,date(),user.id);
            db.prepare("DELETE FROM sessions WHERE principal=? AND kind='admin'").run(user.id);
        }
        db.prepare('UPDATE accounts SET payload=? WHERE id=?').run(JSON.stringify(user), user.id);
        store.replace('users', list('users').map(u => u.id === user.id ? user : u));
    }
    function notify(userId, type, title, message, resourceId = null) {
        if (typeof userId !== 'string' || !userId) return;
        if (!db.prepare('SELECT id FROM accounts WHERE id=?').get(userId)) return;
        db.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,?,?,NULL)')
            .run(crypto.randomUUID(), userId, type, title, message, resourceId, date());
    }
    // Queries always derive ownership from the authenticated session, never a submitted userId.
    const ownOrders = id => list('orders').filter(o => o.userId === id).reverse();
    router.get('/account/dashboard', requireUser, route((req,res) => {
        const orders = ownOrders(uid(req));
        res.json({user:req.session.user,stats:{orders:orders.length,
            pending:orders.filter(o => o.status === 'pending').length,
            completed:orders.filter(o => o.status === 'delivered').length,
            wishlist:db.prepare('SELECT count(*) AS n FROM wishlist WHERE user_id=?').get(uid(req)).n,
            unread:db.prepare('SELECT count(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL').get(uid(req)).n},
            recentOrders:orders.slice(0,3)});
    }));
    router.get('/users/me/addresses', requireUser, route((req,res) => res.json(req.session.user.addresses || [])));
    router.post('/users/me/addresses', requireUser, route((req,res) => {
        const a = addressInput(req.body, crypto.randomUUID());
        const rows = req.session.user.addresses || [];
        if (rows.length >= 10) throw fail(400, 'حداکثر ۱۰ آدرس قابل ثبت است.');
        if (!rows.length) a.isDefault = true;
        const addresses = [...rows.map(r => a.isDefault ? {...r,isDefault:false} : r), a];
        transaction(() => saveUser({...req.session.user,addresses}));res.status(201).json(a);
    }));
    router.put('/users/me/addresses/:id', requireUser, route((req,res) => {
        const rows = req.session.user.addresses || [], old = rows.find(a => a.id === req.params.id);
        if (!old) throw fail(404, 'آدرس پیدا نشد.');
        const onlyDefault = Object.keys(req.body).length === 1 && Object.hasOwn(req.body,'isDefault');
        const a = addressInput({...old,...req.body},old.id,!onlyDefault);
        if (old.isDefault && !a.isDefault && !rows.some(r => r.id !== a.id && r.isDefault)) a.isDefault = true;
        const addresses = rows.map(r => r.id === a.id ? a : a.isDefault ? {...r,isDefault:false} : r);
        transaction(() => saveUser({...req.session.user,addresses}));res.json(a);
    }));
    router.delete('/users/me/addresses/:id', requireUser, route((req,res) => {
        const rows = req.session.user.addresses || [];
        if (!rows.some(a => a.id === req.params.id)) throw fail(404, 'آدرس پیدا نشد.');
        const addresses = rows.filter(a => a.id !== req.params.id);
        if (addresses.length && !addresses.some(a => a.isDefault)) addresses[0] = {...addresses[0],isDefault:true};
        transaction(() => saveUser({...req.session.user,addresses}));res.status(204).end();
    }));
    router.get('/users/me/wishlist', requireUser, route((req,res) => {
        const products = list('products');
        res.json(db.prepare('SELECT product_id,created_at FROM wishlist WHERE user_id=? ORDER BY created_at DESC').all(uid(req)).map(r => {
            const product = products.find(p => String(p.id) === r.product_id && p.status !== 'inactive');
            return {productId:r.product_id,createdAt:r.created_at,product:product || null};
        }));
    }));
    router.put('/users/me/wishlist/:id', requireUser, route((req,res) => {
        if (!list('products').some(p => String(p.id) === req.params.id && p.status !== 'inactive')) throw fail(404, 'محصول پیدا نشد.');
        if (db.prepare('SELECT count(*) AS n FROM wishlist WHERE user_id=?').get(uid(req)).n >= 200
            && !db.prepare('SELECT 1 FROM wishlist WHERE user_id=? AND product_id=?').get(uid(req),req.params.id)) throw fail(400, 'حداکثر ۲۰۰ علاقه‌مندی قابل ثبت است.');
        db.prepare('INSERT OR IGNORE INTO wishlist VALUES(?,?,?)').run(uid(req),req.params.id,date());res.json({productId:req.params.id});
    }));
    router.delete('/users/me/wishlist/:id', requireUser, route((req,res) => {
        db.prepare('DELETE FROM wishlist WHERE user_id=? AND product_id=?').run(uid(req),req.params.id);res.status(204).end();
    }));
    router.put('/users/me/password', requireUser, route(async(req,res) => {
        const {currentPassword,newPassword,confirmPassword} = req.body;
        if (typeof currentPassword !== 'string' || Buffer.byteLength(currentPassword) > 72
            || typeof newPassword !== 'string' || newPassword.length < 12 || Buffer.byteLength(newPassword) > 72
            || newPassword !== confirmPassword || newPassword === currentPassword) throw fail(400, 'رمز جدید باید متفاوت، حداقل ۱۲ کاراکتر، حداکثر ۷۲ بایت و با تکرار آن یکسان باشد.');
        const account = db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(uid(req));
        if (!await bcrypt.compare(currentPassword,account.password_hash)) throw fail(403, 'رمز عبور فعلی اشتباه است.');
        const passwordHash = await bcrypt.hash(newPassword,12);
        // Concurrent password changes cannot overwrite a password verified against an old hash.
        const csrfToken = transaction(() => {
            const result = db.prepare('UPDATE accounts SET password_hash=? WHERE id=? AND password_hash=?').run(passwordHash,uid(req),account.password_hash);
            if (!result.changes) throw fail(409, 'رمز قبلاً تغییر کرده است؛ دوباره وارد شوید.');
            db.prepare('UPDATE admin_accounts SET password_hash=?,updated_at=? WHERE id=?').run(passwordHash,date(),uid(req));
            db.prepare('DELETE FROM sessions WHERE principal=?').run(uid(req));
            notify(uid(req),'security','رمز عبور تغییر کرد','رمز شما تغییر کرد و نشست‌های قبلی پایان یافتند.');
            return createSession(res,uid(req),'user',req);
        });
        res.json({message:'رمز عبور تغییر کرد. سایر نشست‌ها بسته شدند.',csrfToken});
    }));
    router.get('/users/me/sessions', requireUser, route((req,res) => {
        res.json(db.prepare("SELECT s.hash,s.expires,d.created_at,d.device FROM sessions s LEFT JOIN session_details d ON d.session_hash=s.hash WHERE s.principal=? AND s.kind='user' AND s.expires>? ORDER BY s.expires DESC").all(uid(req),Date.now())
            .map(s => ({current:s.hash === req.session.hash,createdAt:s.created_at || null,expiresAt:new Date(s.expires).toISOString(),device:s.device || 'مرورگر'})));
    }));
    router.get('/users/me/notifications', requireUser, route((req,res) => {
        const rows = db.prepare('SELECT id,type,title,message,resource_id AS resourceId,created_at AS createdAt,read_at AS readAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(uid(req));
        res.json({items:rows,unread:db.prepare('SELECT count(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL').get(uid(req)).n});
    }));
    router.put('/users/me/notifications/read', requireUser, route((req,res) => {
        db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(date(),uid(req));res.json({unread:0});
    }));
    router.put('/users/me/notifications/:id/read', requireUser, route((req,res) => {
        const result = db.prepare('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?').run(date(),req.params.id,uid(req));
        if (!result.changes) throw fail(404, 'اعلان پیدا نشد.');res.json({read:true});
    }));
    const categories = ['order','payment','product','account','other'];
    const tickets = id => db.prepare('SELECT id,subject,category,status,created_at AS createdAt,updated_at AS updatedAt FROM tickets WHERE user_id=? ORDER BY updated_at DESC').all(id);
    function ticket(id, userId) {
        const row = userId ? db.prepare('SELECT * FROM tickets WHERE id=? AND user_id=?').get(id,userId) : db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
        if (!row) throw fail(404, 'درخواست پشتیبانی پیدا نشد.');
        return {id:row.id,userId:row.user_id,subject:row.subject,category:row.category,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,
            messages:db.prepare('SELECT id,author,message,created_at AS createdAt FROM ticket_messages WHERE ticket_id=? ORDER BY rowid').all(id)};
    }
    function message(ticketId, author, body) {
        db.prepare('INSERT INTO ticket_messages VALUES(?,?,?,?,?)').run(crypto.randomUUID(),ticketId,author,field(body,'متن پیام',5,4000),date());
    }
    router.get('/tickets', requireUser, route((req,res) => res.json(tickets(uid(req)))));
    router.post('/tickets', requireUser, route((req,res) => {
        const subject = field(req.body.subject,'موضوع',3,150),category = req.body.category;
        if (!categories.includes(category)) throw fail(400, 'دسته‌بندی نامعتبر است.');
        const id = crypto.randomUUID();
        transaction(() => {
            db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?,?,?)').run(id,uid(req),subject,category,'open',date(),date());
            message(id,'user',req.body.message);
        });res.status(201).json(ticket(id,uid(req)));
    }));
    router.get('/tickets/:id', requireUser, route((req,res) => res.json(ticket(req.params.id,uid(req)))));
    router.post('/tickets/:id/messages', requireUser, route((req,res) => {
        const row = ticket(req.params.id,uid(req));
        if (row.status === 'closed') throw fail(409, 'این درخواست بسته شده است؛ درخواست جدید ثبت کنید.');
        if (row.messages.length >= 100) throw fail(400, 'حداکثر تعداد پیام‌ها ثبت شده است.');
        transaction(() => {message(row.id,'user',req.body.message);db.prepare("UPDATE tickets SET status='open',updated_at=? WHERE id=?").run(date(),row.id);});
        res.status(201).json(ticket(row.id,uid(req)));
    }));
    router.get('/admin/tickets', requireAdmin, route((req,res) => {
        res.json(db.prepare('SELECT t.id,t.subject,t.category,t.status,t.created_at AS createdAt,t.updated_at AS updatedAt,a.email,a.payload FROM tickets t JOIN accounts a ON a.id=t.user_id ORDER BY t.updated_at DESC')
            .all().map(({payload,...row}) => ({...row,name:JSON.parse(payload).name})));
    }));
    router.get('/admin/tickets/:id', requireAdmin, route((req,res) => res.json(ticket(req.params.id))));
    router.put('/admin/tickets/:id', requireAdmin, route((req,res) => {
        const row = ticket(req.params.id),body = req.body;
        if (!['open','answered','closed'].includes(body.status)) throw fail(400, 'وضعیت تیکت نامعتبر است.');
        if (body.status === 'answered' && !body.message && !row.messages.some(m => m.author === 'admin')) throw fail(400, 'برای پاسخ‌داده‌شده ابتدا پاسخ ثبت کنید.');
        if (row.messages.length >= 100 && body.message) throw fail(400, 'حداکثر تعداد پیام‌ها ثبت شده است.');
        transaction(() => {
            if (body.message) message(row.id,'admin',body.message);
            db.prepare('UPDATE tickets SET status=?,updated_at=? WHERE id=?').run(body.status,date(),row.id);
            if (body.message || row.status !== body.status) notify(row.userId,'ticket','پشتیبانی درخواست شما را بررسی کرد',row.subject,row.id);
        });res.json(ticket(row.id));
    }));
    router.post('/admin/notifications', requireAdmin, route((req,res) => {
        const id = field(req.body.userId,'شناسه کاربر',1,100);
        if (!db.prepare('SELECT 1 FROM accounts WHERE id=?').get(id)) throw fail(404, 'حساب پیدا نشد.');
        notify(id,'store',field(req.body.title,'عنوان',3,100),field(req.body.message,'پیام',5,1000));res.status(201).json({sent:true});
    }));
    router.get('/admin/notification-recipients', requireAdmin, route((req,res) => {
        res.json(db.prepare('SELECT id,email,payload FROM accounts ORDER BY rowid DESC').all().map(r => ({id:r.id,email:r.email,name:JSON.parse(r.payload).name})));
    }));
    return {notify,saveUser};
}
module.exports = {installAccount,profileFields,addressInput,field};
