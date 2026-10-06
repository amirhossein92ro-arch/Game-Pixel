'use strict';
const crypto=require('node:crypto'),bcrypt=require('bcrypt');
const {field}=require('./account.cjs');
const {readSettings,validateSettings}=require('./site.cjs');
const {analytics}=require('./analytics.cjs');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function installManagement(router,store,security){
    const {db,list,transaction}=store,{requireAdmin,route,adminSecurity}=security;
    const audit=(req,action,type,id,details={})=>{adminSecurity.audit(req.admin,action,type,id,details);req.auditRecorded=true;};
    router.get('/site-settings',route((req,res)=>{
        const settings=readSettings(store),a=settings.announcement,time=Date.now();
        res.json({...settings,announcement:{...a,visible:a.enabled&&(!a.startsAt||Date.parse(a.startsAt)<=time)&&(!a.expiresAt||Date.parse(a.expiresAt)>time)}});
    }));
    router.get('/admin/analytics',requireAdmin,route((req,res)=>{
        const days=Number(req.query.days||30);if(![7,30,90].includes(days))throw fail(400,'بازه نمودار نامعتبر است.');res.json(analytics(store,req.admin,days));
    }));
    router.get('/admin/permissions',requireAdmin,route((req,res)=>res.json(adminSecurity.permissions)));
    router.get('/admin/admins',requireAdmin,route((req,res)=>res.json(db.prepare('SELECT * FROM admin_accounts ORDER BY created_at').all().map(adminSecurity.publicAdmin))));
    router.post('/admin/admins',requireAdmin,route(async(req,res)=>{
        const username=field(req.body.username,'نام کاربری',3,80),role=req.body.role,password=req.body.password;
        if(!/^[A-Za-z0-9_.-]+$/.test(username)||!Object.hasOwn(adminSecurity.permissions,role)||role==='USER')throw fail(400,'نام کاربری یا نقش نامعتبر است.');
        if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)throw fail(400,'رمز مدیر باید حداقل ۱۲ کاراکتر و حداکثر ۷۲ بایت باشد.');
        const passwordHash=await bcrypt.hash(password,12),id=crypto.randomUUID(),at=new Date().toISOString();
        transaction(()=>{
            if(db.prepare('SELECT id FROM admin_accounts WHERE username=?').get(username))throw fail(409,'نام کاربری تکراری است.');
            db.prepare('INSERT INTO admin_accounts VALUES(?,?,?,?,?,?,?,?)').run(id,username,passwordHash,role,1,0,at,at);
            audit(req,'ADMIN_CREATED','admin',id,{username,role});
        });res.status(201).json(adminSecurity.publicAdmin(db.prepare('SELECT * FROM admin_accounts WHERE id=?').get(id)));
    }));
    router.put('/admin/admins/:id',requireAdmin,route((req,res)=>{
        const row=db.prepare('SELECT * FROM admin_accounts WHERE id=?').get(req.params.id);if(!row)throw fail(404,'مدیر پیدا نشد.');
        const role=req.body.role??row.role,active=req.body.active??!!row.active;
        if(!Object.hasOwn(adminSecurity.permissions,role)||role==='USER'||typeof active!=='boolean')throw fail(400,'نقش یا وضعیت نامعتبر است.');
        if(!active&&req.body.confirm!==true)throw fail(400,'غیرفعال‌کردن مدیر نیازمند تأیید است.');
        transaction(()=>{
            if(row.role==='SUPER_ADMIN'&&row.active&&(!active||role!=='SUPER_ADMIN')&&db.prepare("SELECT count(*) n FROM admin_accounts WHERE role='SUPER_ADMIN' AND active=1").get().n<=1)throw fail(409,'آخرین Super Admin فعال را نمی‌توان غیرفعال کرد یا نقش او را تغییر داد.');
            db.prepare('UPDATE admin_accounts SET role=?,active=?,updated_at=? WHERE id=?').run(role,active?1:0,new Date().toISOString(),row.id);
            if(!active||role!==row.role)db.prepare("DELETE FROM sessions WHERE principal=? AND kind='admin'").run(row.id);
            audit(req,role!==row.role?'ADMIN_ROLE_CHANGED':'ADMIN_STATUS_CHANGED','admin',row.id,{previousRole:row.role,role,active});
        });res.json(adminSecurity.publicAdmin(db.prepare('SELECT * FROM admin_accounts WHERE id=?').get(row.id)));
    }));
    router.get('/admin/audit',requireAdmin,route((req,res)=>{
        const offset=Number(req.query.offset||0),q=field(req.query.q||'','جستجو',0,120);
        if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw fail(400,'صفحه نامعتبر است.');
        const search='%'+q+'%';
        const where='WHERE actor_username LIKE ? OR action LIKE ? OR target_id LIKE ?';
        const rows=db.prepare(`SELECT id,actor_username AS admin,actor_role AS role,action,target_type AS targetType,target_id AS targetId,details,created_at AS createdAt FROM audit_logs ${where} ORDER BY id DESC LIMIT 100 OFFSET ?`).all(search,search,search,offset).map(r=>({...r,details:JSON.parse(r.details)}));
        const total=db.prepare(`SELECT count(*) n FROM audit_logs ${where}`).get(search,search,search).n;res.json({items:rows,total,offset});
    }));
    router.get('/admin/settings',requireAdmin,route((req,res)=>res.json(readSettings(store))));
    router.put('/admin/settings',requireAdmin,route((req,res)=>{
        const settings=validateSettings(req.body,store);
        transaction(()=>{db.prepare("INSERT INTO settings(id,payload) VALUES('site-config',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(JSON.stringify(settings));audit(req,'SITE_SETTINGS_CHANGED','settings','site-config',{maintenance:settings.maintenance});});res.json(settings);
    }));
    router.post('/admin/products/bulk',requireAdmin,route((req,res)=>{
        const {ids,action}=req.body;
        if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length||!['activate','deactivate','delete','category'].includes(action))throw fail(400,'عملیات گروهی نامعتبر است.');
        if(action==='delete'&&(!adminSecurity.can(req.admin,'products.delete')||req.body.confirm!==true))throw fail(403,'حذف گروهی نیازمند مجوز حذف و تأیید است.');
        const category=action==='category'?field(req.body.category,'دسته‌بندی',2,80):null;
        transaction(()=>{
            const rows=list('products');if(ids.some(id=>!rows.some(p=>String(p.id)===id)))throw fail(404,'یکی از محصولات پیدا نشد؛ تغییری انجام نشد.');
            const next=action==='delete'?rows.filter(p=>!ids.includes(String(p.id))):rows.map(p=>ids.includes(String(p.id))?{...p,...(action==='category'?{category}:{status:action==='activate'?'active':'inactive'}),updatedAt:new Date().toISOString()}:p);
            store.replace('products',next);audit(req,'PRODUCT_BULK_'+action.toUpperCase(),'products',ids.join(','),{count:ids.length,category});
        });res.json({changed:ids.length});
    }));
    router.delete('/admin/discounts/:id',requireAdmin,route((req,res)=>{
        if(req.body.confirm!==true)throw fail(400,'حذف کد تخفیف نیازمند تأیید است.');
        transaction(()=>{const rows=list('discounts'),found=rows.find(d=>d.id===req.params.id);if(!found)throw fail(404,'کد تخفیف پیدا نشد.');store.replace('discounts',rows.filter(d=>d.id!==found.id));audit(req,'DISCOUNT_DELETED','discount',found.id,{code:found.code});});res.status(204).end();
    }));
    router.get('/admin/users/:id',requireAdmin,route((req,res)=>{
        const u=list('users').find(u=>String(u.id)===req.params.id);if(!u)throw fail(404,'کاربر پیدا نشد.');
        res.json({id:u.id,name:u.name,email:u.email,phone:u.phone,banned:u.banned===true,joinDate:u.joinDate});
    }));
    router.get('/admin/users/:id/orders',requireAdmin,route((req,res)=>{
        if(!adminSecurity.can(req.admin,'orders.read'))throw fail(403,'مجوز مشاهده سفارش‌ها را ندارید.');res.json(list('orders').filter(o=>o.userId===req.params.id));
    }));
    router.get('/admin/search',requireAdmin,route((req,res)=>{
        const q=field(req.query.q||'','عبارت جستجو',2,120).toLowerCase();const matches=(...values)=>values.some(v=>String(v||'').toLowerCase().includes(q)),result=[];
        if(adminSecurity.can(req.admin,'products.read'))for(const p of list('products').filter(p=>matches(p.id,p.name,p.brand)).slice(0,8))result.push({type:'product',id:String(p.id),title:p.name,subtitle:p.category});
        if(adminSecurity.can(req.admin,'orders.read'))for(const o of list('orders').filter(o=>matches(o.id,o.code,o.userName,o.userEmail,o.userPhone)).slice(0,8))result.push({type:'order',id:String(o.id),title:o.code,subtitle:o.userName});
        if(adminSecurity.can(req.admin,'customers.read')||adminSecurity.can(req.admin,'customers.limited'))for(const u of list('users').filter(u=>matches(u.id,u.name,u.email,u.phone)).slice(0,8))result.push({type:'user',id:String(u.id),title:u.name,subtitle:u.email});
        if(adminSecurity.can(req.admin,'tickets.read'))for(const t of db.prepare('SELECT t.id,t.subject,a.email,a.payload FROM tickets t JOIN accounts a ON t.user_id=a.id').all().filter(t=>matches(t.id,t.subject,t.email,JSON.parse(t.payload).name)).slice(0,8))result.push({type:'ticket',id:t.id,title:t.subject,subtitle:t.email});
        res.json(result);
    }));
}
module.exports={installManagement};
