'use strict';
const bcrypt = require('bcrypt');
const {field} = require('./account.cjs');
const fail = (status, message) => Object.assign(new Error(message), {status});
const now = () => new Date().toISOString();
function installUserManagement(router, store, {requireAdmin, route, adminSecurity}) {
    const {db, list, transaction} = store;
    const customer = id => db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
    const administrator = id => db.prepare('SELECT * FROM admin_accounts WHERE id=?').get(id);
    function find(id, context) {
        const account = context ? context.accounts.get(id) : customer(id), admin = context ? context.admins.get(id) : administrator(id);
        if (!account && !admin) throw fail(404, "کاربر پیدا نشد.");
        return {account, admin};
    }
    function record(id, context) {
        const {account, admin} = find(id,context), payload = account ? JSON.parse(account.payload) : {};
        const legacy = context ? context.users.get(id) : list('users').find(u => String(u.id) === id);
        const orders = context ? context.orders.get(id) || [] : list('orders').filter(o => String(o.userId) === id);
        const banned = !!(payload.banned || legacy?.banned || (admin && !admin.active));
        return {id, name: payload.name || admin?.username || '', username: admin?.username || '',
            email: account?.email || '', phone: account?.phone || '', role: admin?.role || 'user',
            status: banned ? 'disabled' : 'active', banned, kind: account ? 'customer' : 'admin',
            joinDate: payload.joinDate || admin?.created_at || null,
            lastLogin: [payload.lastLogin,admin?.last_login].filter(Boolean).sort().at(-1) || null,
            orderCount: orders.length, totalSpent: orders.filter(o => o.paymentStatus === 'paid').reduce((sum,o) => sum + (Number(o.total) || 0), 0)};
    }
    function all() {
        const context = {
            accounts: new Map(db.prepare('SELECT * FROM accounts').all().map(r => [r.id,r])),
            admins: new Map(db.prepare('SELECT * FROM admin_accounts').all().map(r => [r.id,r])),
            users: new Map(list('users').map(u => [String(u.id),u])), orders: new Map()
        };
        for (const order of list('orders')) {const id=String(order.userId);if (!context.orders.has(id)) context.orders.set(id,[]);context.orders.get(id).push(order);}
        return [...new Set([...context.accounts.keys(),...context.admins.keys()])].map(id => record(id,context));
    }
    function allowed(req, target) {
        // Recheck after asynchronous password hashing so revoked in-flight sessions cannot commit changes.
        const actor = administrator(req.admin.id);
        if (!actor?.active || !db.prepare("SELECT hash FROM sessions WHERE hash=? AND kind='admin' AND expires>?").get(req.adminSession.hash,Date.now())) throw fail(401,'نشست مدیریت منقضی شده است.');
        req.admin = adminSecurity.publicAdmin(actor);
        if (!['SUPER_ADMIN','ADMIN'].includes(req.admin.role)) throw fail(403, "مجوز مدیریت حساب را ندارید.");
        if (target.admin && req.admin.role !== 'SUPER_ADMIN') throw fail(403, "فقط مدیر ارشد می‌تواند حساب مدیران را تغییر دهد.");
    }
    function confirm(req, target, dangerous = false) {
        if (dangerous && req.body.confirm !== true) throw fail(400, "این عملیات نیازمند تأیید است.");
        if (dangerous && target.admin && req.body.adminConfirm !== true) throw fail(400, "تأیید اضافه برای حساب مدیر لازم است.");
    }
    function lastSuper(target, losesAccess) {
        if (target.admin?.role === 'SUPER_ADMIN' && target.admin.active && losesAccess &&
            db.prepare("SELECT count(*) n FROM admin_accounts WHERE role='SUPER_ADMIN' AND active=1").get().n <= 1)
            throw fail(409, "آخرین مدیر ارشد فعال را نمی‌توان حذف، غیرفعال یا تنزل داد.");
    }
    function revoke(id) {
        const result = db.prepare('DELETE FROM sessions WHERE principal=?').run(id);
        db.prepare('DELETE FROM password_reset_challenges WHERE user_id=?').run(id);
        return Number(result.changes);
    }
    function audit(req, action, id, details = {}) {
        adminSecurity.audit(req.admin, action, 'user', id, details); req.auditRecorded = true;
    }
    function save(account, changes) {
        if (!account) return;
        const payload = {...JSON.parse(account.payload), ...changes, updatedAt: now()};
        db.prepare('UPDATE accounts SET email=?,phone=?,payload=? WHERE id=?').run(payload.email || account.email, payload.phone || account.phone, JSON.stringify(payload), account.id);
        const users = list('users'), index = users.findIndex(u => String(u.id) === account.id);
        if (index < 0) users.push(payload); else users[index] = payload;
        store.replace('users', users);
    }
    // Authenticate before counting requests; cap password hashing and mutation attempts per administrator.
    const rates = new Map();
    function limit(req, res, next) {
        const time = Date.now(), key = req.admin.id;
        for (const [id,r] of rates) if (r.until <= time) rates.delete(id);
        const r = rates.get(key) || {until: time + 60000, count: 0, resets: 0};
        r.count++; if (req.path.endsWith('/reset-password')) r.resets++; rates.set(key,r);
        if (r.count > 60 || r.resets > 10) {res.setHeader('Retry-After', String(Math.ceil((r.until-time)/1000))); return next(fail(429, "درخواست‌های مدیریت زیاد است؛ کمی بعد تلاش کنید."));}
        next();
    }
    function input(req, keys) {
        if (Object.keys(req.body).some(k => !keys.includes(k))) throw fail(400, "فیلد ارسال‌شده مجاز نیست.");
    }
    router.get('/admin/users', requireAdmin, route((req,res) => {
        const q = field(req.query.q ?? '', "جستجو", 0, 120).toLocaleLowerCase('fa');
        const role = req.query.role || '', status = req.query.status || '', sort = req.query.sort || 'newest';
        if (!['','user','ADMIN','SUPER_ADMIN','ORDER_MANAGER','PRODUCT_MANAGER','SUPPORT'].includes(role) || !['','active','disabled'].includes(status) || !['newest','oldest','name'].includes(sort)) throw fail(400,"فیلتر نامعتبر است.");
        const page = Number(req.query.page || 1), pageSize = Number(req.query.pageSize || 20);
        if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw fail(400,"صفحه نامعتبر است.");
        let rows = all().filter(u => (!q || [u.name,u.email,u.phone,u.username].some(v => v.toLocaleLowerCase('fa').includes(q))) && (!role || u.role === role) && (!status || u.status === status));
        rows.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name,'fa') || a.id.localeCompare(b.id) : (sort === 'oldest' ? 1 : -1) * String(a.joinDate || '').localeCompare(String(b.joinDate || '')) || a.id.localeCompare(b.id));
        // Preserve the existing unparameterized API array for older dashboard consumers.
        if (!Object.keys(req.query).length) return res.json(rows);
        res.json({items: rows.slice((page-1)*pageSize,page*pageSize), total: rows.length, page, pageSize, pages: Math.ceil(rows.length/pageSize)});
    }));
    router.get('/admin/users/:id', requireAdmin, route((req,res) => res.json(record(req.params.id))));
    router.get('/admin/users/:id/orders', requireAdmin, route((req,res) => {
        find(req.params.id);
        if (!adminSecurity.can(req.admin,'orders.read')) throw fail(403,"مجوز مشاهده سفارش‌ها را ندارید.");
        res.json(list('orders').filter(o => String(o.userId) === req.params.id));
    }));
    router.patch('/admin/users/:id', requireAdmin, limit, route((req,res) => {
        input(req,['name','email','phone','username']);
        if (!Object.keys(req.body).length) throw fail(400,"اطلاعات ویرایش لازم است.");
        transaction(() => {
            const target = find(req.params.id); allowed(req,target);
            if (target.account) {
                const changes = {};
                if (req.body.username !== undefined) throw fail(400,"نام کاربری مشتری همان ایمیل است.");
                if (req.body.name !== undefined) changes.name = field(req.body.name,"نام",2,100);
                if (req.body.email !== undefined) {changes.email = field(req.body.email,"ایمیل",5,200).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.email)) throw fail(400,"ایمیل نامعتبر است.");}
                if (req.body.phone !== undefined) {changes.phone = field(req.body.phone,"موبایل",11,11); if (!/^09\d{9}$/.test(changes.phone)) throw fail(400,"موبایل نامعتبر است.");}
                if (db.prepare('SELECT id FROM accounts WHERE (email=? OR phone=?) AND id<>?').get(changes.email || target.account.email,changes.phone || target.account.phone,req.params.id)) throw fail(409,"ایمیل یا موبایل تکراری است.");
                if (target.admin && changes.email) {
                    if (db.prepare('SELECT id FROM admin_accounts WHERE username=? AND id<>?').get(changes.email,req.params.id)) throw fail(409,"نام کاربری مدیریت تکراری است.");
                    db.prepare('UPDATE admin_accounts SET username=?,updated_at=? WHERE id=?').run(changes.email,now(),req.params.id);
                }
                save(target.account,changes);
                if (changes.email || changes.phone) revoke(req.params.id);
            } else {
                if (Object.keys(req.body).some(k => k !== 'username')) throw fail(400,"برای این حساب فقط نام کاربری قابل ویرایش است.");
                const username = field(req.body.username,"نام کاربری",3,80);
                if (!/^[A-Za-z0-9_.-]+$/.test(username)) throw fail(400,"نام کاربری نامعتبر است.");
                if (db.prepare('SELECT id FROM admin_accounts WHERE username=? AND id<>?').get(username,req.params.id)) throw fail(409,"نام کاربری تکراری است.");
                db.prepare('UPDATE admin_accounts SET username=?,updated_at=? WHERE id=?').run(username,now(),req.params.id); revoke(req.params.id);
            }
            audit(req,'USER_UPDATED',req.params.id,{fields:Object.keys(req.body)});
        }); res.json(record(req.params.id));
    }));
    function changeRole(req,res) {
        input(req,['role','confirm','adminConfirm']);
        const roleMap = {USER:'user',admin:'ADMIN',user:'user',SUPER_ADMIN:'SUPER_ADMIN',ADMIN:'ADMIN'};
        const role = typeof req.body.role === 'string' && Object.hasOwn(roleMap,req.body.role) ? roleMap[req.body.role] : null;
        if (!role) throw fail(400,"نقش نامعتبر است.");
        transaction(() => {
            const target = find(req.params.id); allowed(req,target);
            if (req.admin.role !== 'SUPER_ADMIN') throw fail(403,"تغییر نقش فقط برای مدیر ارشد مجاز است.");
            const previous = target.admin?.role || 'user';
            confirm(req,target,!!target.admin && role !== previous); lastSuper(target,role !== 'SUPER_ADMIN');
            if (role === 'user') {
                if (!target.account) throw fail(409,"حساب مستقل مدیریت را فقط می‌توان به نقش مدیر تغییر داد یا غیرفعال کرد.");
                db.prepare('DELETE FROM admin_accounts WHERE id=?').run(req.params.id);
            } else if (target.admin) db.prepare('UPDATE admin_accounts SET role=?,updated_at=? WHERE id=?').run(role,now(),req.params.id);
            else {
                if (db.prepare('SELECT id FROM admin_accounts WHERE username=?').get(target.account.email)) throw fail(409,"نام کاربری مدیریت تکراری است.");
                const at = now();
                db.prepare('INSERT INTO admin_accounts(id,username,password_hash,role,active,totp_required,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)').run(req.params.id,target.account.email,target.account.password_hash,role,record(req.params.id).banned ? 0 : 1,at,at);
            }
            save(target.account,{role:role === 'user' ? 'user' : 'admin'});
            revoke(req.params.id); audit(req,'USER_ROLE_CHANGED',req.params.id,{previousRole:previous,role});
        }); res.json(record(req.params.id));
    }
    function changeStatus(req,res) {
        input(req,['status','confirm','adminConfirm']);
        if (!['active','disabled'].includes(req.body.status)) throw fail(400,"وضعیت نامعتبر است.");
        transaction(() => {
            const target = find(req.params.id); allowed(req,target); const disabled = req.body.status === 'disabled';
            confirm(req,target,disabled); lastSuper(target,disabled);
            if (target.admin) db.prepare('UPDATE admin_accounts SET active=?,updated_at=? WHERE id=?').run(disabled ? 0 : 1,now(),req.params.id);
            save(target.account,{banned:disabled}); if (disabled) revoke(req.params.id);
            audit(req,disabled ? 'USER_DISABLED' : 'USER_ENABLED',req.params.id);
        }); res.json(record(req.params.id));
    }
    router.patch('/admin/users/:id/role',requireAdmin,limit,route(changeRole));
    router.patch('/admin/users/:id/status',requireAdmin,limit,route(changeStatus));
    // Legacy mutation path receives exactly the same security checks.
    router.put('/admin/users/:id',requireAdmin,limit,route((req,res) => {
        input(req,['role','banned','confirm','adminConfirm']);
        if (req.body.role !== undefined && req.body.banned !== undefined) {
            const current = record(req.params.id), nextRole = req.body.role === 'admin' ? 'ADMIN' : req.body.role;
            if (nextRole !== current.role) {if (req.body.banned !== current.banned) throw fail(400,"نقش و وضعیت را جداگانه تغییر دهید."); delete req.body.banned; return changeRole(req,res);}
            delete req.body.role;
        }
        if (req.body.banned !== undefined) {if (typeof req.body.banned !== 'boolean') throw fail(400,"وضعیت نامعتبر است.");req.body.status = req.body.banned ? 'disabled' : 'active';delete req.body.banned;return changeStatus(req,res);}
        return changeRole(req,res);
    }));
    router.post('/admin/users/:id/reset-password',requireAdmin,limit,route(async(req,res) => {
        input(req,['password','confirm','adminConfirm']);
        const target = find(req.params.id); allowed(req,target); confirm(req,target,true);
        const password = req.body.password;
        if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 72 || !/[A-Za-z\u0600-\u06ff]/.test(password) || !/\d/.test(password) || !/[^\p{L}\p{N}\s]/u.test(password)) throw fail(400,"رمز موقت باید حداقل ۱۲ کاراکتر، شامل حرف، عدد و نماد و حداکثر ۷۲ بایت باشد.");
        const passwordHash = await bcrypt.hash(password,12);
        transaction(() => {
            const current = find(req.params.id); allowed(req,current); confirm(req,current,true);
            if (current.account) db.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(passwordHash,req.params.id);
            if (current.admin) db.prepare('UPDATE admin_accounts SET password_hash=?,updated_at=?,session_version=session_version+1 WHERE id=?').run(passwordHash,now(),req.params.id);
            if(current.account)save(customer(req.params.id),{sessionVersion:(Number(JSON.parse(current.account.payload).sessionVersion)||0)+1});
            revoke(req.params.id); audit(req,'USER_PASSWORD_RESET',req.params.id);
        }); res.json({ok:true});
    }));
    router.post('/admin/users/:id/logout-all',requireAdmin,limit,route((req,res) => {
        input(req,['confirm','adminConfirm']);
        transaction(() => {const target = find(req.params.id);allowed(req,target);confirm(req,target,true);const revoked = revoke(req.params.id);audit(req,'USER_FORCE_LOGOUT',req.params.id,{revoked});}); res.json({ok:true});
    }));
    router.delete('/admin/users/:id',requireAdmin,limit,route((req,res) => {
        input(req,['confirm','adminConfirm']);
        transaction(() => {
            const target = find(req.params.id);allowed(req,target);
            if (req.admin.role !== 'SUPER_ADMIN') throw fail(403,'حذف حساب فقط برای مدیر ارشد مجاز است.');
            if (req.params.id === req.admin.id) throw fail(409,'حذف حساب مدیریت فعلی مجاز نیست.');
            confirm(req,target,true);lastSuper(target,true);revoke(req.params.id);
            store.replace('orders',list('orders').map(o => String(o.userId) === req.params.id ? {...o,userDeleted:true} : o));
            db.prepare('DELETE FROM tickets WHERE user_id=?').run(req.params.id);
            db.prepare('DELETE FROM accounts WHERE id=?').run(req.params.id);
            db.prepare('DELETE FROM admin_accounts WHERE id=?').run(req.params.id);
            store.replace('users',list('users').filter(u => String(u.id) !== req.params.id));
            audit(req,'USER_DELETED',req.params.id,{ordersRetained:true});
        }); res.status(204).end();
    }));
}
module.exports = {installUserManagement};
