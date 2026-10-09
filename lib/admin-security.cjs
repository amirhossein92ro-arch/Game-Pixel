'use strict';
const crypto=require('node:crypto'),bcrypt=require('bcrypt');
const {field}=require('./account.cjs');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const permissions={
    SUPER_ADMIN:['*'],
    ADMIN:['dashboard.read','analytics.read','products.read','products.write','products.delete','orders.read','orders.write','customers.read','customers.write','discounts.read','discounts.write','tickets.read','tickets.write','notifications.write','content.read','content.write','audit.read'],
    ORDER_MANAGER:['dashboard.read','orders.read','orders.write'],
    PRODUCT_MANAGER:['dashboard.read','products.read','products.write','products.delete'],
    SUPPORT:['dashboard.read','customers.limited','tickets.read','tickets.write'],
    USER:[]
};
const can=(admin,permission)=>!!admin&&(permissions[admin.role]?.includes('*')||permissions[admin.role]?.includes(permission));
function publicAdmin(row){return {id:row.id,username:row.username,role:row.role,active:!!row.active,totpRequired:!!row.totp_required,createdAt:row.created_at,updatedAt:row.updated_at,permissions:permissions[row.role]||[]};}
function requiredPermission(path,method){
    path=path.toLowerCase().replace(/\/+$/,'');
    const read=['GET','HEAD'].includes(method);
    if(/^\/api\/admin\/(session|logout)$/.test(path))return null;
    if(/^\/api\/admin\/(stats|dashboard)$/.test(path))return 'dashboard.read';
    if(/^\/api\/admin\/analytics$/.test(path))return 'analytics.read';
    if(/^\/api\/admin\/(admins|permissions)(\/|$)/.test(path))return 'admins.manage';
    if(/^\/api\/admin\/settings$/.test(path))return 'settings.manage';
    if(/^\/api\/admin\/audit$/.test(path))return 'audit.read';
    if(/^\/api\/admin\/search$/.test(path))return 'dashboard.read';
    if(/^\/api\/(?:admin\/)?products(\/|$)/.test(path))return read?'products.read':method==='DELETE'?'products.delete':'products.write';
    if(/^\/api\/admin\/orders(\/|$)/.test(path))return read?'orders.read':'orders.write';
    if(/^\/api\/admin\/users(\/|$)/.test(path))return read?'customers.read':'customers.write';
    if(/^\/api\/admin\/discounts(\/|$)/.test(path))return read?'discounts.read':'discounts.write';
    if(/^\/api\/admin\/tickets(\/|$)/.test(path))return read?'tickets.read':'tickets.write';
    if(/^\/api\/admin\/notification(?:s|-recipients)(\/|$)/.test(path))return 'notifications.write';
    if(/^\/api\/admin\/(posts|comments|messages)(\/|$)/.test(path))return read?'content.read':'content.write';
    return 'unknown';
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
    const {db,transaction}=store;
    if(process.env.ADMIN_TOTP_SECRET&&!/^[A-Z2-7]{16,}={0,6}$/i.test(process.env.ADMIN_TOTP_SECRET))throw Error('ADMIN_TOTP_SECRET must be a valid Base32 secret (16+ characters).');
    if(process.env.ADMIN_PASSWORD){
        const password=process.env.ADMIN_PASSWORD;
        validateBootstrapPassword(process.env);
        const existing=db.prepare("SELECT * FROM admin_accounts WHERE id='bootstrap-admin'").get();
        const username=process.env.ADMIN_USERNAME||existing?.username||'admin';
        const previousConfig=db.prepare("SELECT payload FROM settings WHERE id='bootstrap-password-config'").get()?.payload;
        const configHash=previousConfig && bcrypt.compareSync(password,previousConfig) ? previousConfig : bcrypt.hashSync(password,12);
        if(!existing)transaction(()=>{
            const at=new Date().toISOString();
            db.prepare('INSERT INTO admin_accounts(id,username,password_hash,role,active,totp_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('bootstrap-admin',username,bcrypt.hashSync(password,12),'SUPER_ADMIN',1,process.env.ADMIN_TOTP_SECRET?1:0,at,at);
        });
        else if((!previousConfig ? !bcrypt.compareSync(password,existing.password_hash) : previousConfig!==configHash)||existing.username!==username||(process.env.ADMIN_TOTP_SECRET&&!existing.totp_required))transaction(()=>{
            db.prepare('UPDATE admin_accounts SET username=?,password_hash=?,totp_required=?,updated_at=? WHERE id=?').run(username,bcrypt.hashSync(password,12),existing.totp_required||process.env.ADMIN_TOTP_SECRET?1:0,new Date().toISOString(),existing.id);
            db.prepare("DELETE FROM sessions WHERE principal=? AND kind='admin'").run(existing.id);
        });
        db.prepare("INSERT INTO settings(id,payload) VALUES('bootstrap-password-config',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(configHash);
    }
    // Older single-admin sessions do not gain SUPER_ADMIN privileges during migration.
    db.prepare("DELETE FROM sessions WHERE kind='admin' AND principal NOT IN (SELECT id FROM admin_accounts)").run();
    const failures=new Map();
    function audit(admin,action,targetType,targetId,details={}){
        if(!admin)return;
        db.prepare('INSERT INTO audit_logs(actor_id,actor_username,actor_role,action,target_type,target_id,details,created_at) VALUES(?,?,?,?,?,?,?,?)')
            .run(admin.id,admin.username,admin.role,action,targetType,String(targetId||''),JSON.stringify(details),new Date().toISOString());
    }
    async function login(body,ip){
        const username=typeof body.username==='string'?body.username.trim().slice(0,200):'',password=typeof body.password==='string'?body.password:'';
        const key=String(ip)+':'+username,time=Date.now(),state=failures.get(key);
        if(state?.until>time)throw Object.assign(fail(429,'تلاش‌های ناموفق زیاد است؛ ۱۵ دقیقه بعد دوباره تلاش کنید.'),{retryAfter:Math.ceil((state.until-time)/1000)});
        const row=db.prepare('SELECT * FROM admin_accounts WHERE username=?').get(username);
        const valid=Buffer.byteLength(password)<=72&&await bcrypt.compare(password,row?.password_hash||'$2b$12$uJbYKWiNFXiFSNTybLV2y.fUPnWxXVdOKtpTgCO.oZRNgL4FKae1i');
        let otpValid=true;
        if(row?.totp_required&&valid){
            if(row.id!=='bootstrap-admin'||!process.env.ADMIN_TOTP_SECRET)throw fail(503,'تنظیمات ورود دومرحله‌ای سرور کامل نیست.');
            const code=typeof body.otp==='string'?body.otp:'';
            otpValid=/^\d{6}$/.test(code)&&[-30000,0,30000].some(delta=>crypto.timingSafeEqual(Buffer.from(code),Buffer.from(totp(process.env.ADMIN_TOTP_SECRET,time+delta))));
        }
        const current=db.prepare('SELECT * FROM admin_accounts WHERE id=?').get(row?.id || '');
        if(!row||!valid||!current?.active||current.password_hash!==row.password_hash||!otpValid){
            if(failures.size>10000)for(const[k,v]of failures)if(v.at<time-900000)failures.delete(k);
            if(failures.size>=10000&&!failures.has(key))throw fail(429,'تلاش‌های ورود زیاد است؛ بعداً تلاش کنید.');
            const latestFailure=failures.get(key),n=latestFailure&&latestFailure.at>time-900000?latestFailure.n+1:1;failures.set(key,{n,at:time,until:n>=5?time+900000:0});
            throw fail(401,'نام کاربری، رمز عبور یا کد دومرحله‌ای اشتباه است.');
        }
        db.prepare('UPDATE admin_accounts SET last_login=? WHERE id=?').run(new Date().toISOString(),row.id);
        failures.delete(key);const admin=publicAdmin(current);audit(admin,'ADMIN_LOGIN','admin',row.id);return admin;
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
function validateBootstrapPassword(env){
    const password=env.ADMIN_PASSWORD||'';
    if(!password)return;
    if(Buffer.byteLength(password)>72||password.length<12||/^(?:admin123|password|12345)/i.test(password))throw Error('ADMIN_PASSWORD must be strong, 12+ characters and at most 72 UTF-8 bytes.');
}
module.exports={createAdminSecurity,can,permissions,publicAdmin,totp,validateBootstrapPassword};
