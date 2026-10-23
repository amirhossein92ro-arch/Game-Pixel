'use strict';
const bcrypt = require('./passwords.cjs');
const {field} = require('./account.cjs');
const {pageQuery,respond,collectionPage,orderSummary}=require('./listing.cjs');
const fail = (status, message) => Object.assign(new Error(message), {status});
const now = () => new Date().toISOString();
function installUserManagement(router, store, {requireAdmin, route, adminSecurity, requireRecentAdminAuthentication}) {
    const {list, transaction} = store;
    const customer = id => store.access('user-management').findAccountsById(id);
    const administrator = id => store.access('user-management').findAdminAccountsById(id);
    function find(id, context) {
        const account = context ? context.accounts.get(id) : customer(id), admin = context ? context.admins.get(id) : administrator(id);
        if (!account && !admin) throw fail(404, "کاربر پیدا نشد.");
        return {account, admin};
    }
    function record(id, context) {
        const {account, admin} = find(id,context), payload = account ? JSON.parse(account.payload) : {};
        const legacy = context ? context.users.get(id) : store.get('users',id);
        const totals = store.access('user-management').countOrders(id);
        const banned = !!(payload.banned || legacy?.banned || (admin && !admin.active));
        return {id, name: payload.name || admin?.username || '', username: admin?.username || '',
            email: account?.email || admin?.email || '', phone: account?.phone || '', role: admin?.role || 'user',
            status: banned ? 'disabled' : 'active', banned, kind: account ? 'customer' : 'admin',
            joinDate: payload.joinDate || admin?.created_at || null,
            lastLogin: [payload.lastLogin,admin?.last_login].filter(Boolean).sort().at(-1) || null,
            orderCount:totals.n,totalSpent:totals.total};
    }
    function allowed(req, target) {
        // Recheck after asynchronous password hashing so revoked in-flight sessions cannot commit changes.
        const actor = administrator(req.admin.id);
        if (!actor?.active || actor.session_version!==req.adminSession.principal_version || !store.access('user-management').findSessionsByHashAndKindAndAdm(req.adminSession.hash,Date.now())) throw fail(401,'نشست مدیریت منقضی شده است.');
        requireRecentAdminAuthentication(req);
        const auditIp=req.admin.auditIp;req.admin = adminSecurity.publicAdmin(actor);Object.defineProperty(req.admin,'auditIp',{value:auditIp});
        if (!['SUPER_ADMIN','ADMIN'].includes(req.admin.role)) throw fail(403, "مجوز مدیریت حساب را ندارید.");
        if (target.admin && req.admin.role !== 'SUPER_ADMIN') throw fail(403, "فقط مدیر ارشد می‌تواند حساب مدیران را تغییر دهد.");
    }
    function confirm(req, target, dangerous = false) {
        if (dangerous && req.body.confirm !== true) throw fail(400, "این عملیات نیازمند تأیید است.");
        if (dangerous && target.admin && req.body.adminConfirm !== true) throw fail(400, "تأیید اضافه برای حساب مدیر لازم است.");
    }
    function lastSuper(target, losesAccess) {
        if (target.admin?.role === 'SUPER_ADMIN' && target.admin.active && losesAccess &&
            store.access('user-management').countAdminAccountsByRoleAndSUPER_ADMAndActive().n <= 1)
            throw fail(409, "آخرین مدیر ارشد فعال را نمی‌توان حذف، غیرفعال یا تنزل داد.");
    }
    function revoke(id) {
        return store.revokeSessions(id);
    }
    function audit(req, action, id, details = {}) {
        adminSecurity.audit(req.admin, action, 'user', id, details); req.auditRecorded = true;
    }
    function save(account, changes) {
        if (!account) return;
        const payload = {...JSON.parse(account.payload), ...changes, updatedAt: now()};
        store.access('user-management').updateAccountsById(payload.email || account.email, payload.phone || account.phone, JSON.stringify(payload), account.id);
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
        const q=field(req.query.q??'','جستجو',0,120).toLocaleLowerCase('fa'),role=req.query.role||'',status=req.query.status||'',sort=req.query.sort||'newest';
        if(!['','user','ADMIN','SUPER_ADMIN','ORDER_MANAGER','PRODUCT_MANAGER','SUPPORT'].includes(role)||!['','active','disabled'].includes(status)||!['newest','oldest','name'].includes(sort))throw fail(400,'فیلتر نامعتبر است.');
        const {page,pageSize,offset}=pageQuery(req.query,Object.keys(req.query).length?20:100);
        const {items,total}=store.search.people({q,role,status,sort,page,pageSize,offset});
        return respond(req,res,{items,total,page,pageSize});
    }));
    router.get('/admin/users/:id', requireAdmin, route((req,res) => res.json(record(req.params.id))));
    router.get('/admin/users/:id/orders', requireAdmin, route((req,res) => {
        find(req.params.id);
        if (!adminSecurity.can(req.admin,'orders.read')) throw fail(403,"مجوز مشاهده سفارش‌ها را ندارید.");
        const result=store.search.ordersForUser(req.query,req.params.id);result.items=result.items.map(orderSummary);return respond(req,res,result);
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
                if (store.access('user-management').findAccountsByEmailAndPhoneAndId(changes.email || target.account.email,changes.phone || target.account.phone,req.params.id)) throw fail(409,"ایمیل یا موبایل تکراری است.");
                if (target.admin && changes.email) {
                    if (store.access('user-management').findAdminAccountsByUsernameAndId(changes.email,req.params.id)) throw fail(409,"نام کاربری مدیریت تکراری است.");
                    store.access('user-management').updateAdminAccountsById(changes.email,now(),req.params.id);
                }
                save(target.account,changes);
                if (changes.email || changes.phone) revoke(req.params.id);
            } else {
                if (Object.keys(req.body).some(k => !['username','email'].includes(k))) throw fail(400,"برای این حساب فقط نام کاربری و ایمیل قابل ویرایش است.");
                const username = req.body.username===undefined?target.admin.username:field(req.body.username,"نام کاربری",3,80);
                const email = req.body.email===undefined?target.admin.email:req.body.email===''?null:field(req.body.email,"ایمیل",5,200).toLowerCase();
                if (!/^[A-Za-z0-9_.-]+$/.test(username)) throw fail(400,"نام کاربری نامعتبر است.");
                if (email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400,"ایمیل نامعتبر است.");
                if (store.access('user-management').findAdminAccountsByUsernameAndId(username,req.params.id)) throw fail(409,"نام کاربری تکراری است.");
                if (email&&store.access('user-management').findAdminAccountsByEmailAndId(email,req.params.id)) throw fail(409,"ایمیل مدیر تکراری است.");
                store.access('user-management').updateAdminAccountsById2(username,email,now(),req.params.id); revoke(req.params.id);
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
            if (req.params.id === req.admin.id && role !== req.admin.role) throw fail(409,'نقش حساب مدیریت فعلی را از این نشست تغییر ندهید.');
            const previous = target.admin?.role || 'user';
            confirm(req,target,!!target.admin && role !== previous); lastSuper(target,role !== 'SUPER_ADMIN');
            if (role === 'user') {
                if (!target.account) throw fail(409,"حساب مستقل مدیریت را فقط می‌توان به نقش مدیر تغییر داد یا غیرفعال کرد.");
                store.access('user-management').deleteAdminAccountsById(req.params.id);
            } else if (target.admin) store.access('user-management').updateAdminAccountsById3(role,now(),req.params.id);
            else {
                if (store.access('user-management').findAdminAccountsByUsername(target.account.email)) throw fail(409,"نام کاربری مدیریت تکراری است.");
                const at = now();
                store.access('user-management').createAdminAccounts(req.params.id,target.account.email,target.account.password_hash,role,record(req.params.id).banned ? 0 : 1,at,at);
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
            if (disabled && req.params.id === req.admin.id) throw fail(409,'حساب مدیریت فعلی را نمی‌توان غیرفعال کرد.');
            confirm(req,target,disabled); lastSuper(target,disabled);
            if (target.admin) store.access('user-management').updateAdminAccountsById4(disabled ? 0 : 1,now(),req.params.id);
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
        require('./request-security.cjs').password(password);
        const passwordHash = await bcrypt.hash(password,12);
        transaction(() => {
            const current = find(req.params.id); allowed(req,current); confirm(req,current,true);
            if (current.account) store.access('user-management').updateAccountsById2(passwordHash,req.params.id);
            if (current.admin) store.access('user-management').updateAdminAccountsById5(passwordHash,now(),req.params.id);
            revoke(req.params.id); audit(req,'USER_PASSWORD_RESET',req.params.id);
        }); res.json({ok:true});
    }));
    router.post('/admin/users/:id/logout-all',requireAdmin,limit,route((req,res) => {
        input(req,['confirm','adminConfirm']);
        transaction(() => {const target = find(req.params.id);allowed(req,target);confirm(req,target,true);const revoked = revoke(req.params.id);audit(req,'USER_FORCE_LOGOUT',req.params.id,{revoked});}); res.json({ok:true});
    }));
    router.delete('/admin/users/:id',requireAdmin,limit,route((req,res) => {
        input(req,['confirm','adminConfirm','confirmationPhrase']);
        transaction(() => {
            const target = find(req.params.id);allowed(req,target);
            if (req.admin.role !== 'SUPER_ADMIN') throw fail(403,'حذف حساب فقط برای مدیر ارشد مجاز است.');
            if (req.params.id === req.admin.id) throw fail(409,'حذف حساب مدیریت فعلی مجاز نیست.');
            confirm(req,target,true);if(req.body.confirmationPhrase!=='DELETE')throw fail(400,'برای حذف حساب، عبارت DELETE را وارد کنید.');lastSuper(target,true);revoke(req.params.id);
            store.replace('orders',list('orders').map(o => String(o.userId) === req.params.id ? {...o,userDeleted:true} : o));
            store.access('user-management').deleteTicketsByUserId(req.params.id);
            store.access('user-management').deleteAccountsById(req.params.id);
            store.access('user-management').deleteAdminAccountsById(req.params.id);
            store.replace('users',list('users').filter(u => String(u.id) !== req.params.id));
            audit(req,'USER_DELETED',req.params.id,{ordersRetained:true});
        }); res.status(204).end();
    }));
}
module.exports = {installUserManagement};
