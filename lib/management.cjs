'use strict';
const crypto=require('node:crypto'),bcrypt=require('./passwords.cjs');
const {field}=require('./account.cjs');
const {readSettings,validateSettings}=require('./site.cjs');
const {analytics}=require('./analytics.cjs');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function installManagement(router,store,security){
    const {list,transaction}=store,{requireAdmin,route,adminSecurity,requireRecentAdminAuthentication}=security;
    const audit=(req,action,type,id,details={})=>{adminSecurity.audit(req.admin,action,type,id,details);req.auditRecorded=true;};
    router.get('/site-settings',route((req,res)=>{
        const settings=readSettings(store),a=settings.announcement,time=Date.now();
        res.json({...settings,announcement:{...a,visible:a.enabled&&(!a.startsAt||Date.parse(a.startsAt)<=time)&&(!a.expiresAt||Date.parse(a.expiresAt)>time)}});
    }));
    router.get('/admin/analytics',requireAdmin,route((req,res)=>{
        const days=Number(req.query.days||30);if(![7,30,90].includes(days))throw fail(400,'بازه نمودار نامعتبر است.');
        const range=req.query.range||'30d';if(!['today','7d','30d','custom'].includes(range))throw fail(400,'بازه نامعتبر است.');
        const now=new Date(),end=new Date(now);end.setUTCHours(0,0,0,0);end.setUTCDate(end.getUTCDate()+1);
        let start=new Date(end);start.setUTCDate(start.getUTCDate()-(range==='today'?1:range==='7d'?7:30));
        if(range==='custom'){
            if(!/^\d{4}-\d{2}-\d{2}$/.test(req.query.start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(req.query.end||''))throw fail(400,'تاریخ نامعتبر است.');
            start=new Date(req.query.start+'T00:00:00Z');end=new Date(req.query.end+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);
            if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start.toISOString().slice(0,10)!==req.query.start||new Date(req.query.end+'T00:00:00Z').toISOString().slice(0,10)!==req.query.end||end<=start||end-start>90*86400000||end>Date.now()+86400000)throw fail(400,'بازه تاریخ نامعتبر است.');
        }
        res.json({...analytics(store,req.admin,days),journey:require('./journey-analytics.cjs').createJourneyAnalytics(store).report(start.toISOString(),end.toISOString())});
    }));
    router.get('/admin/permissions',requireAdmin,route((req,res)=>res.json(adminSecurity.permissions)));
    const pageQuery=req=>{const page=Number(req.query.page||1),pageSize=Number(req.query.pageSize||20);if(!Number.isSafeInteger(page)||page<1||page>1000000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw fail(400,'صفحه نامعتبر است.');return {page,pageSize,offset:(page-1)*pageSize};};
    router.get('/admin/admins',requireAdmin,route((req,res)=>{
        const {page,pageSize,offset}=pageQuery(req),q=field(req.query.q||'','جستجو',0,120),role=req.query.role||'',status=req.query.status||'',sort=req.query.sort||'newest';
        if(role&&!['ADMIN','SUPER_ADMIN','ORDER_MANAGER','PRODUCT_MANAGER','SUPPORT'].includes(role)||!['','active','disabled'].includes(status)||!['newest','oldest','name'].includes(sort))throw fail(400,'فیلتر نامعتبر است.');
        const {rows,total}=store.search.admins({q,role,status,sort,pageSize,offset});
        const items=rows.map(row=>({...adminSecurity.publicAdmin(row),email:row.email||store.access('management').findAccountsById(row.id)?.email||null,lastLogin:row.last_login||null,activeSessions:store.access('management').countSessionsByPrincipalAndKindAndAdm(row.id,Date.now()).n,recentActivity:store.access('management').listAuditLogsByActorId(row.id)}));
        if(!Object.keys(req.query).length)return res.json(items);
        res.json({items,total,page,pageSize,pages:Math.ceil(total/pageSize)});
    }));
    router.post('/admin/admins',requireAdmin,route(async(req,res)=>{
        const username=field(req.body.username,'نام کاربری',3,80),role=req.body.role,password=req.body.password,email=req.body.email===undefined?null:field(req.body.email,'ایمیل',5,200).toLowerCase();
        if(!/^[A-Za-z0-9_.-]+$/.test(username)||typeof role!=='string'||!Object.hasOwn(adminSecurity.permissions,role)||role==='USER')throw fail(400,'نام کاربری یا نقش نامعتبر است.');
        if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'ایمیل نامعتبر است.');
        require('./request-security.cjs').password(password);
        const passwordHash=await bcrypt.hash(password,12),id=crypto.randomUUID(),at=new Date().toISOString();
        transaction(()=>{
            const actor=store.access('management').findAdminAccountsByIdAndActive(req.admin.id);
            if(!actor || actor.session_version!==req.adminSession.principal_version || !store.access('management').findSessionsByHashAndKindAndAdm(req.adminSession.hash,Date.now()))throw fail(401,'Admin session expired.');
            requireRecentAdminAuthentication(req);
            if(actor.role!=='SUPER_ADMIN')throw fail(403,'Super admin required.');
            if(store.access('management').findAdminAccountsByUsername(username))throw fail(409,'نام کاربری تکراری است.');
            if(email&&store.access('management').findAdminAccountsByEmail(email))throw fail(409,'ایمیل مدیر تکراری است.');
            store.access('management').createAdminAccounts(id,username,email,passwordHash,role,1,0,at,at);
            audit(req,'ADMIN_CREATED','admin',id,{username,role});
        });res.status(201).json(adminSecurity.publicAdmin(store.access('management').findAdminAccountsById(id)));
    }));
    router.put('/admin/admins/:id',requireAdmin,route((req,res)=>{
        transaction(()=>{
        const row=store.access('management').findAdminAccountsById(req.params.id);if(!row)throw fail(404,'مدیر پیدا نشد.');
        const role=req.body.role??row.role,active=req.body.active??!!row.active;
        if(typeof role!=='string'||!Object.hasOwn(adminSecurity.permissions,role)||role==='USER'||typeof active!=='boolean')throw fail(400,'نقش یا وضعیت نامعتبر است.');
        if(!active&&req.body.confirm!==true)throw fail(400,'غیرفعال‌کردن مدیر نیازمند تأیید است.');
        if(row.id===req.admin.id&&(!active||role!==row.role))throw fail(409,'نقش یا وضعیت حساب مدیریت فعلی را از این نشست تغییر ندهید.');
            if(row.role==='SUPER_ADMIN'&&row.active&&(!active||role!=='SUPER_ADMIN')&&store.access('management').countAdminAccountsByRoleAndSUPER_ADMAndActive().n<=1)throw fail(409,'آخرین Super Admin فعال را نمی‌توان غیرفعال کرد یا نقش او را تغییر داد.');
            if (['SUPER_ADMIN','ADMIN'].includes(row.role) && (!active || role!==row.role) && (req.body.confirm!==true || req.body.adminConfirm!==true)) throw fail(400,'تغییر دسترسی مدیر نیازمند تأیید اضافه است.');
            store.access('management').updateAdminAccountsById(role,active?1:0,new Date().toISOString(),row.id);
            const account=store.access('management').findAccountsById2(row.id);
            if(account){const user={...JSON.parse(account.payload),role:'admin',banned:!active,updatedAt:new Date().toISOString()};store.access('management').updateAccountsById(JSON.stringify(user),row.id);store.replace('users',list('users').map(u=>String(u.id)===row.id?user:u));}
            if(!active||role!==row.role)store.revokeSessions(row.id);
            audit(req,role!==row.role?'ADMIN_ROLE_CHANGED':'ADMIN_STATUS_CHANGED','admin',row.id,{previousRole:row.role,role,active});
        });res.json(adminSecurity.publicAdmin(store.access('management').findAdminAccountsById(req.params.id)));
    }));
    router.get('/admin/sessions',requireAdmin,route((req,res)=>{
        const {page,pageSize,offset}=pageQuery(req),adminId=field(req.query.adminId||'','مدیر',0,120);
        const found=store.search.adminSessions({adminId,pageSize,offset,time:Date.now()}),currentId=store.access('management').findSessionDetailsBySessionHash(req.adminSession.hash)?.id;
        const items=found.items.map(row=>({...row,current:row.id===currentId})),total=found.total;
        res.json({items,total,page,pageSize,pages:Math.ceil(total/pageSize)});
    }));
    router.delete('/admin/sessions/:id',requireAdmin,route((req,res)=>{
        const id=req.params.id;if(!/^[0-9a-f-]{36}$/i.test(id)||req.body.confirm!==true)throw fail(400,'شناسه یا تأیید نامعتبر است.');
        transaction(()=>{const session=store.access('management').findSessionsByPublicIdAndKindAndAdm(id);if(!session)throw fail(404,'نشست پیدا نشد.');if(session.hash===req.adminSession.hash)throw fail(409,'نشست فعلی را از این مسیر باطل نکنید.');store.access('management').deleteSessionsByHash(session.hash);audit(req,'ADMIN_SESSION_REVOKED','admin',session.principal);});res.status(204).end();
    }));
    router.get('/admin/audit',requireAdmin,route((req,res)=>{
        const {page,pageSize}=pageQuery(req),offset=req.query.offset===undefined?(page-1)*pageSize:Number(req.query.offset),q=field(req.query.q||'','جستجو',0,120),adminId=field(req.query.adminId||'','مدیر',0,120),action=field(req.query.action||'','عملیات',0,100),from=req.query.from||'',to=req.query.to||'';
        if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||from&&(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!Number.isFinite(Date.parse(from+'T00:00:00Z')))||to&&(!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(to+'T00:00:00Z')))||from&&to&&from>to)throw fail(400,'فیلتر یا صفحه نامعتبر است.');
        const {rows,total}=store.search.audit({q,adminId,action,from,to,pageSize,offset});res.json({items:rows,total,offset,page,pageSize,pages:Math.ceil(total/pageSize)});
    }));
    router.get('/admin/settings',requireAdmin,route((req,res)=>res.json(readSettings(store))));
    router.put('/admin/settings',requireAdmin,route((req,res)=>{
        const settings=transaction(()=>{
        const {confirm,revision,...body}=req.body,settings=validateSettings(body,store),previous=readSettings(store);
        if(req.admin.role!=='SUPER_ADMIN'&&(settings.maintenance!==previous.maintenance||settings.shippingCost!==previous.shippingCost||settings.freeShippingThreshold!==previous.freeShippingThreshold))throw fail(403,'تنظیمات مهم فروشگاه فقط برای مدیر ارشد است.');
        if(settings.maintenance!==previous.maintenance&&confirm!==true)throw fail(400,'تغییر وضعیت فروشگاه نیازمند تأیید است.');
        store.assertRevision(previous,revision);settings.revision=previous.revision+1;
        store.access('management').createSettings(JSON.stringify(settings));audit(req,'SITE_SETTINGS_CHANGED','settings','site-config',{maintenance:settings.maintenance});return settings;});res.json(settings);
    }));
    router.post('/admin/products/bulk',requireAdmin,route((req,res)=>{
        const {ids,action}=req.body;
        if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length||!['activate','deactivate','delete','category'].includes(action))throw fail(400,'عملیات گروهی نامعتبر است.');
        if(action==='delete'&&!adminSecurity.can(req.admin,'products.delete'))throw fail(403,'مجوز حذف محصول را ندارید.');
        if(action==='delete'&&(req.body.confirm!==true||req.body.confirmationPhrase!=='DELETE'))throw fail(400,'برای حذف گروهی محصولات، عبارت DELETE را وارد کنید.');
        const category=action==='category'?field(req.body.category,'دسته‌بندی',2,80):null;
        transaction(()=>{
            const rows=list('products').filter(p=>!p.deletedAt);if(ids.some(id=>!rows.some(p=>String(p.id)===id)))throw fail(404,'یکی از محصولات پیدا نشد؛ تغییری انجام نشد.');
            const revisions=req.body.revisions;
            if(revisions!==undefined&&(!revisions||typeof revisions!=='object'||Array.isArray(revisions)||Object.keys(revisions).length!==ids.length))throw fail(400,'نسخه محصولات نامعتبر است.');
            for(const id of ids){const product=rows.find(p=>String(p.id)===id);if(revisions!==undefined)store.assertRevision(product,revisions[id],true);
                if(action==='delete')store.remove('products',id);else store.mutate('products',id,p=>({...p,...(action==='category'?{category}:{status:action==='activate'?'active':'inactive'}),updatedAt:new Date().toISOString()}));}
            audit(req,'PRODUCT_BULK_'+action.toUpperCase(),'products',ids.join(','),{count:ids.length,category});
        });res.json({changed:ids.length});
    }));
    router.delete('/admin/discounts/:id',requireAdmin,route((req,res)=>{
        if(req.body.confirm!==true)throw fail(400,'حذف کد تخفیف نیازمند تأیید است.');
        transaction(()=>{const found=store.get('discounts',req.params.id);if(!found)throw fail(404,'کد تخفیف پیدا نشد.');store.remove('discounts',found.id,{expectedRevision:req.body.revision});audit(req,'DISCOUNT_DELETED','discount',found.id,{code:found.code});});res.status(204).end();
    }));
    router.get('/admin/search',requireAdmin,route((req,res)=>{
        const q=field(req.query.q||'','عبارت جستجو',2,120).toLowerCase(),result=[];
        function search(table,fields,type,title,subtitle){
            const rows=store.search.global(type,q);
            for(const row of rows)result.push({type,...row});
        }
        if(adminSecurity.can(req.admin,'products.read'))search('products',['id','name','brand'],'product','name','category');
        if(adminSecurity.can(req.admin,'orders.read'))search('orders',['id','code','userName','userEmail','userPhone'],'order','code','userName');
        if(adminSecurity.can(req.admin,'customers.read')||adminSecurity.can(req.admin,'customers.limited'))search('users',['id','name','email','phone'],'user','name','email');
        if(adminSecurity.can(req.admin,'tickets.read'))for(const t of store.access('management').listTickets(q,q,q,q))result.push({type:'ticket',...t});
        res.json(result);
    }));
}
module.exports={installManagement};
