'use strict';
const crypto=require('node:crypto'),bcrypt=require('./passwords.cjs');
const {field}=require('./account.cjs');
const {validateBootstrapPassword}=require('./runtime-config.cjs');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const permissions={
    SUPER_ADMIN:['*'],
    ADMIN:['dashboard.read','analytics.read','products.read','products.write','products.delete','orders.read','orders.write','customers.read','customers.write','users.view','users.edit','users.disable','users.reset','users.logout','products.view','products.create','products.edit','orders.view','orders.edit','discounts.view','discounts.edit','settings.view','settings.edit','discounts.read','discounts.write','tickets.read','tickets.write','notifications.write','content.read','content.write','audit.read','audit.view'],
    ORDER_MANAGER:['dashboard.read','orders.read','orders.write','orders.view','orders.edit'],
    PRODUCT_MANAGER:['dashboard.read','products.read','products.write','products.delete','products.view','products.create','products.edit'],
    SUPPORT:['dashboard.read','customers.limited','users.view','tickets.read','tickets.write'],
    USER:[]
};
const can=(admin,permission)=>!!admin&&(permissions[admin.role]?.includes('*')||permissions[admin.role]?.includes(permission));
function publicAdmin(row){return {id:row.id,username:row.username,email:row.email||null,role:row.role,active:!!row.active,totpRequired:!!row.totp_required,createdAt:row.created_at,updatedAt:row.updated_at,permissions:permissions[row.role]||[]};}
function requiredPermission(path,method){
    path=path.toLowerCase().replace(/\/+$/,'');
    const read=['GET','HEAD'].includes(method);
    if(/^\/api\/admin\/(session|logout)$/.test(path))return null;
    if(/^\/api\/admin\/sessions(?:\/|$)/.test(path))return read?'admins.manage':'admins.manage';
    if(/^\/api\/admin\/(stats|dashboard)$/.test(path))return 'dashboard.read';
    if(path==='/api/admin/system-status')return 'system.monitor';
    if(/^\/api\/admin\/analytics$/.test(path))return 'analytics.read';
    if(/^\/api\/admin\/(admins|permissions)(\/|$)/.test(path))return 'admins.manage';
    if(/^\/api\/admin\/settings$/.test(path))return read?'settings.view':'settings.edit';
    if(/^\/api\/admin\/audit$/.test(path))return 'audit.view';
    if(/^\/api\/admin\/search$/.test(path))return 'dashboard.read';
    if(/^\/api\/(?:admin\/)?products(\/|$)/.test(path))return read?'products.view':method==='DELETE'?'products.delete':method==='POST'&&!/\/bulk$/.test(path)?'products.create':'products.edit';
    if(/^\/api\/admin\/orders(\/|$)/.test(path))return read?'orders.view':'orders.edit';
    if(/^\/api\/admin\/users(\/|$)/.test(path)){
        if(read)return 'users.view';
        if(/\/role$/.test(path))return 'users.promote';
        if(/\/status$/.test(path))return 'users.disable';
        if(/\/reset-password$/.test(path))return 'users.reset';
        if(/\/logout-all$/.test(path))return 'users.logout';
        if(method==='DELETE')return 'users.delete';
        return 'users.edit';
    }
    if(/^\/api\/admin\/discounts(\/|$)/.test(path))return read?'discounts.view':'discounts.edit';
    if(/^\/api\/admin\/tickets(\/|$)/.test(path))return read?'tickets.read':'tickets.write';
    if(/^\/api\/admin\/notification(?:s|-recipients)(\/|$)/.test(path))return 'notifications.write';
    if(/^\/api\/admin\/(posts|comments|messages)(\/|$)/.test(path))return read?'content.read':'content.write';
    return 'unknown';
}
function requiresRecentAuthentication(path,method) {
    if(['GET','HEAD','OPTIONS'].includes(method))return false;
    path=path.toLowerCase().replace(/\/+$/,'');
    return /^\/api\/admin\/(?:admins(?:\/|$)|sessions\/[^/]+$|users\/[^/]+(?:\/(?:role|status|reset-password|logout-all))?$)/.test(path);
}
function totp(secret,time=Date.now()){
    let bits='',bytes=[];
    for(const c of secret.toUpperCase().replace(/=+$/,'')){const n='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);if(n<0)throw Error('Invalid ADMIN_TOTP_SECRET');bits+=n.toString(2).padStart(5,'0');}
    for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));
    const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(time/30000)));
    const digest=crypto.createHmac('sha1',Buffer.from(bytes)).update(counter).digest(),offset=digest[19]&15;
    return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
function createAdminSecurity(store){
    const {transaction}=store;
    if(process.env.ADMIN_TOTP_SECRET&&!/^[A-Z2-7]{16,}={0,6}$/i.test(process.env.ADMIN_TOTP_SECRET))throw Error('ADMIN_TOTP_SECRET must be a valid Base32 secret (16+ characters).');
    if(process.env.ADMIN_PASSWORD){
        const password=process.env.ADMIN_PASSWORD;
        validateBootstrapPassword(process.env);
        const existing=store.access('admin-security').findAdminAccountsByIdAndAdm();
        const username=process.env.ADMIN_USERNAME||existing?.username||'admin';
        const previousConfig=store.access('admin-security').findSettingsById()?.payload;
        const configHash=previousConfig && bcrypt.compareSync(password,previousConfig) ? previousConfig : bcrypt.hashSync(password,12);
        if(!existing)transaction(()=>{
            const at=new Date().toISOString();
            store.access('admin-security').createAdminAccounts('bootstrap-admin',username,bcrypt.hashSync(password,12),'SUPER_ADMIN',1,process.env.ADMIN_TOTP_SECRET?1:0,at,at);
        });
        else if((!previousConfig ? !bcrypt.compareSync(password,existing.password_hash) : previousConfig!==configHash)||existing.username!==username||(process.env.ADMIN_TOTP_SECRET&&!existing.totp_required))transaction(()=>{
            store.access('admin-security').updateAdminAccountsById(username,bcrypt.hashSync(password,12),existing.totp_required||process.env.ADMIN_TOTP_SECRET?1:0,new Date().toISOString(),existing.id);
            store.revokeSessions(existing.id);
        });
        store.access('admin-security').createSettings(configHash);
    }
    // Older single-admin sessions do not gain SUPER_ADMIN privileges during migration.
    store.access('admin-security').deleteSessionsByKindAndAdmAndNOT();
    const failures=require('./login-protection.cjs').createLoginProtection(store,'admin');
    function audit(admin,action,targetType,targetId,details={}){
        if(!admin)return;
        store.repositories.auditLogs.create({actorId:admin.id,actorUsername:admin.username,actorRole:admin.role,action,targetType,targetId:String(targetId||''),details:{...details,...(admin.auditIp?{ip:admin.auditIp}:{})},createdAt:new Date().toISOString()});
    }
    async function login(body,ip){
        const username=typeof body.username==='string'?body.username.trim().slice(0,200):'',password=typeof body.password==='string'?body.password:'';
        const time=Date.now();failures.check(username);
        const row=store.access('admin-security').findAdminAccountsByUsername(username);
        const valid=Buffer.byteLength(password)<=72&&await bcrypt.compare(password,row?.password_hash||'$2b$12$uJbYKWiNFXiFSNTybLV2y.fUPnWxXVdOKtpTgCO.oZRNgL4FKae1i');
        let otpValid=true,matchedStep=null;
        if(row?.totp_required&&valid){
            if(row.id!=='bootstrap-admin'||!process.env.ADMIN_TOTP_SECRET)throw fail(503,'تنظیمات ورود دومرحله‌ای سرور کامل نیست.');
            const code=typeof body.otp==='string'?body.otp:'';
            const delta=/^\d{6}$/.test(code)?[-30000,0,30000].find(delta=>crypto.timingSafeEqual(Buffer.from(code),Buffer.from(totp(process.env.ADMIN_TOTP_SECRET,time+delta)))):undefined;otpValid=delta!==undefined;if(otpValid)matchedStep=Math.floor((time+delta)/30000);
        }
        const current=store.access('admin-security').findAdminAccountsById(row?.id || '');
        if(!row||!valid||!current?.active||current.password_hash!==row.password_hash||current.totp_required!==row.totp_required||!otpValid){
            failures.failed(username);
            audit({id:'authentication',username:'Authentication',role:'SYSTEM'},'ADMIN_LOGIN_FAILED','admin',row?.id||'',{ip:typeof ip==='string'?ip.slice(0,64):''});
            throw fail(401,'نام کاربری، رمز عبور یا کد دومرحله‌ای اشتباه است.');
        }
        store.access('admin-security').updateAdminAccountsById2(new Date().toISOString(),row.id);
        if(current.totp_required){try{transaction(()=>{const replayKey='totp-last-step:'+current.id;const step=matchedStep;const previous=store.access('admin-security').findSettingsById2(replayKey);if(previous&&Number(previous.payload)>=step)throw fail(401,'نام کاربری، رمز عبور یا کد دومرحله‌ای اشتباه است.');store.access('admin-security').createSettings2(replayKey,String(step));});}catch(e){failures.failed(username);audit({id:'authentication',username:'Authentication',role:'SYSTEM'},'ADMIN_LOGIN_FAILED','admin',current.id,{reason:'otp_replay'});throw e;}}
        failures.succeeded(username);const admin=publicAdmin(current);audit(admin,'ADMIN_LOGIN','admin',row.id,{ip:typeof ip==='string'?ip.slice(0,64):''});return admin;
    }
    function authorize(admin,path,method){
        const permission=requiredPermission(path,method);
        if(permission==='unknown')throw fail(403,'مجوز انجام این عملیات را ندارید.');
        if(permission===null)return;
        if(permission==='customers.read'&&can(admin,'customers.limited'))return;
        if(!can(admin,permission))throw fail(403,'مجوز انجام این عملیات را ندارید.');
    }
    return {login,audit,authorize,can,permissions,publicAdmin};
}
module.exports={createAdminSecurity,can,permissions,publicAdmin,totp,validateBootstrapPassword,requiredPermission,requiresRecentAuthentication};
