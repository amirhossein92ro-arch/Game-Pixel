'use strict';
const crypto=require('node:crypto');
const bcrypt=require('./passwords.cjs');
const express=require('express');
const {getPaymentProvider}=require('./payment.cjs');
const {installAccount,profileFields,addressInput,field}=require('./account.cjs');
const {createAdminSecurity,validateBootstrapPassword,requiresRecentAuthentication}=require('./admin-security.cjs');
const {installManagement}=require('./management.cjs');
const {readSettings,shippingFor}=require('./site.cjs');
const {analytics}=require('./analytics.cjs');
const {collectionPage,respond,orderSummary}=require('./listing.cjs');
const {createAuthRecovery}=require('./auth-recovery.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const text=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const error=(status,message)=>Object.assign(new Error(message),{status});
function installCommerce(app,store) {
    const {transaction,list}=store;
    const journey=require('./journey-analytics.cjs').createJourneyAnalytics(store);
    const production=process.env.NODE_ENV==='production';
    const {normalizeOrigin,originPolicy}=require('./runtime-config.cjs');
    const {appOrigin,appOriginUsesHttps,allowedOrigins}=originPolicy();
    const isAllowedRequestOrigin = (_req, origin) => !!origin && allowedOrigins.has(origin);
    app.use('/api',(req,_res,next)=>{
        const supplied=req.headers.origin;
        if(supplied!==undefined&&!isAllowedRequestOrigin(req,normalizeOrigin(supplied)))return next(error(403,'مبدأ درخواست مجاز نیست.'));
        if(supplied===undefined&&req.headers.referer){try{if(!allowedOrigins.has(new URL(req.headers.referer).origin))return next(error(403,'Untrusted referer.'));}catch{return next(error(403,'Invalid referer.'));}}
        next();
    });
    app.use('/api', require('cors')({
        origin(origin, callback) {
            // No Origin is normal for same-origin/server-to-server requests; CORS headers are unnecessary.
            if (origin === undefined) return callback(null, false);
            callback(null, allowedOrigins.has(normalizeOrigin(origin)));
        },
        credentials: true,
        methods: ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],
        allowedHeaders: ['Content-Type','X-CSRF-Token','Idempotency-Key'],
        exposedHeaders: ['X-Total-Count','Link'],
    }));
    // cors() intentionally omits CORS headers for unknown origins; explicitly reject them too,
    // including safe methods and preflights, rather than relying only on browser enforcement.
    app.use('/api', (req, _res, next) => {
        if (req.headers.origin === undefined) return next();
        const origin = normalizeOrigin(req.headers.origin);
        if (!isAllowedRequestOrigin(req, origin)) return next(error(403, 'مبدأ درخواست مجاز نیست.'));
        next();
    });
    validateBootstrapPassword(process.env);
    if(production && (!appOrigin || !appOriginUsesHttps || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length<12))throw Error('Production requires HTTPS APP_ORIGIN and ADMIN_PASSWORD (12+ characters).');
    if(process.env.APP_ORIGIN&&!appOrigin)throw Error('APP_ORIGIN must be a valid origin.');
    const guard=require('./request-security.cjs');
    const checkoutLimit=require('./rate-limits.cjs').persistentLimit(store,{scope:'new-checkout',limit:10,windowMs:15*60000});
    const quoteLimit=require('./rate-limits.cjs').persistentLimit(store,{scope:'checkout-quote',limit:60,windowMs:60000});
    const apiLimit=guard.limiter({limit:300});
    const adminLimit=guard.limiter({limit:120});
    const sensitiveLimit=guard.limiter({limit:15,windowMs:15*60000});
    app.use('/api',(req,res,next)=>{try{const routePath=guard.canonicalPath(req.path);guard.query(req.query);apiLimit(req.ip);if(routePath.startsWith('/admin'))adminLimit(req.ip);if(!['GET','HEAD','OPTIONS'].includes(req.method)&&/^\/(?:admin\/admins|users\/me\/password|auth\/forgot-password)/.test(routePath))sensitiveLimit(req.ip+':'+routePath.split('/').slice(0,4).join('/'));guard.mutationFields({method:req.method,body:req.body,path:'/api'+req.path});next();}catch(e){if(e.retryAfter)res.setHeader('Retry-After',e.retryAfter);next(e);}});
    const adminSecurity=createAdminSecurity(store);
    const privilegedLimit=require('./rate-limits.cjs').persistentLimit(store,{scope:'privileged-admin-action',limit:60,windowMs:15*60000});
    const passwordResetLimit=require('./rate-limits.cjs').persistentLimit(store,{scope:'admin-password-reset',limit:10,windowMs:15*60000});
    const authRecovery=createAuthRecovery(store,process.env);
    const factors=require('./account-factors.cjs').createAccountFactors(store,process.env);
    const factorVerifyLimit=require('./rate-limits.cjs').persistentLimit(store,{scope:'factor-verify-ip',limit:30,windowMs:15*60000});
    const now=()=>new Date().toISOString();
    const publicUser=row=>{
        const u=JSON.parse(row.payload);
        const legacyRow=store.access('commerce').findUsersById(String(row.id));
        const legacy=legacyRow?require('./database.cjs').scrub(JSON.parse(legacyRow.payload)):null;
        const safe=Object.fromEntries(['name','firstName','lastName','displayName','avatar','addresses','joinDate','lastLogin','updatedAt','createdAt','orderCount'].filter(k=>Object.hasOwn(u,k)).map(k=>[k,require('./database.cjs').scrub(u[k])]));
        return {...safe,id:row.id,email:row.email,phone:row.phone,role:legacy?.role||u.role||'user',banned:!!(legacy?.banned||u.banned)};
    };
    const cookieName=kind=>(production?'__Host-':'')+`web2_${kind}`;
    const cookieOptions=req=>({httpOnly:true,secure:production||req?.secure||appOriginUsesHttps,sameSite:'strict',path:'/'});
    const validCsrf=(req,s)=>typeof req.headers['x-csrf-token']==='string'&&/^[a-f0-9]{64}$/.test(req.headers['x-csrf-token'])&&typeof s.csrf==='string'&&s.csrf.length===64&&crypto.timingSafeEqual(Buffer.from(req.headers['x-csrf-token']),Buffer.from(s.csrf));
    function session(req,kind='user') {
        const cookies=String(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName(kind)+'='));
        if(cookies.length!==1)return null;
        const cookie=cookies[0];
        const token=cookie.slice(cookie.indexOf('=')+1);if(!/^[a-f0-9]{64}$/.test(token))return null;
        const s=store.access('commerce').findSessionsByHashAndKindAndExpires(hash(token),kind,Date.now());
        if(!s)return null;
        const activity=store.access('commerce').findSessionDetailsBySessionHash(s.hash)?.last_activity_at;
        if(activity&&Date.parse(activity)<Date.now()-(kind==='admin'?90:60)*60000){store.access('commerce').deleteSessionsByHash(s.hash);return null;}
        if(kind==='user') {const row=store.access('commerce').findAccountsById(s.principal);if(!row||s.principal_version!==(Number(JSON.parse(row.payload).sessionVersion)||0))return null;s.user=publicUser(row);if(s.user.banned)return null;store.access('commerce').updateSessionDetailsBySessionHashAndLastActivityAt(now(),s.hash,new Date(Date.now()-60000).toISOString());}
        if(kind==='admin'){const row=store.access('commerce').findAdminAccountsByIdAndActive(s.principal);if(!row||s.principal_version!==row.session_version)return null;s.admin=adminSecurity.publicAdmin(row);store.access('commerce').updateSessionDetailsBySessionHashAndLastActivityAt(now(),s.hash,new Date(Date.now()-60000).toISOString());}
        return s;
    }
    function createSession(res,principal,kind,req) {
        return transaction(()=>{
        store.access('commerce').deleteSessionsByExpires(Date.now());
        const previous=session(req || {headers:{}},kind);
        if(previous)store.access('commerce').deleteSessionsByHash(previous.hash);
        const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex');
        const ttl=kind==='user'?5*3600000:8*3600000;
        const account=kind==='admin'?store.access('commerce').findAdminAccountsById(principal):store.access('commerce').findAccountsById(principal);
        if(!account||(kind==='admin'?!account.active:publicUser(account).banned))throw error(401,'Session cannot be created.');
        const version=kind==='admin'?account.session_version:Number(JSON.parse(account.payload).sessionVersion)||0;
        const excess=store.access('commerce').listSessionsByPrincipalAndKind(principal,kind);
        for(const old of excess)store.access('commerce').deleteSessionsByHash(old.hash);
        store.access('commerce').createSessions(hash(token),principal,kind,csrf,Date.now()+ttl,version);
        const ua=String(req?.headers['user-agent']||'');
        const device=/Edg\//.test(ua)?'Microsoft Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'مرورگر';
        store.access('commerce').createSessionDetails(hash(token),now(),device+(/Mobile|Android|iPhone/.test(ua)?' · موبایل':' · رایانه'),now(),String(req?.ip||'').slice(0,64),crypto.randomUUID());
        res.cookie(cookieName(kind),token,{...cookieOptions(req),maxAge:ttl});
        return csrf;});
    }
    function recordLoginDevice(id,req){
        const ua=String(req.headers['user-agent']||'');
        const device=/Edg\//.test(ua)?'Microsoft Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'مرورگر';
        const label=device+(/Mobile|Android|iPhone/.test(ua)?' · موبایل':' · رایانه');
        const known=store.access('commerce').listAccountLoginDevicesByUserId(id);
        if(known.length&&!known.some(row=>row.device===label)){
            accountFeatures.notify(id,'security','ورود از مرورگر تازه','اگر این ورود متعلق به شما نبود، رمز عبور خود را تغییر دهید و نشست‌های دیگر را ببندید.');
            store.securityEvent('USER_NEW_DEVICE_LOGIN',id);
            if(known.every(row=>row.last_ip&&row.last_ip!==String(req.ip||'')))store.securityEvent('USER_SUSPICIOUS_LOGIN',id,{reason:'new_browser_and_network'});
        }
        store.access('commerce').createAccountLoginDevices(id,label,String(req.ip||'').slice(0,64),now());
    }
    function requireUser(req,res,next){req.session=session(req);if(!req.session)return next(error(401,'ابتدا وارد حساب کاربری شوید.'));if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!validCsrf(req,req.session))return next(error(403,'اعتبار امنیتی درخواست نامعتبر است.'));next();}
    function requireRecentAdminAuthentication(req) {
        const path=guard.canonicalPath(req.originalUrl.split('?')[0]);
        if(!requiresRecentAuthentication(path,req.method))return;
        const created=store.access('commerce').findSessionDetailsBySessionHash2(req.adminSession.hash)?.created_at;
        if(!created||!Number.isFinite(Date.parse(created))||Date.parse(created)<Date.now()-15*60000)throw error(403,'برای این عملیات حساس، دوباره وارد پنل مدیریت شوید.');
    }
    function requireAdmin(req,res,next){try{req.adminSession=session(req,'admin');if(!req.adminSession)return next(error(session(req)?403:401,'ورود مدیر لازم است.'));req.admin=req.adminSession.admin;Object.defineProperty(req.admin,'auditIp',{value:String(req.ip||'').slice(0,64)});adminSecurity.authorize(req.admin,req.originalUrl.split('?')[0],req.method);
        if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!validCsrf(req,req.adminSession))throw error(403,'اعتبار امنیتی درخواست نامعتبر است.');
        if(!['GET','HEAD','OPTIONS'].includes(req.method)){
            const path=req.originalUrl.split('?')[0].toLowerCase();
            requireRecentAdminAuthentication(req);
            if(/\/api\/admin\/(?:admins(?:\/|$)|sessions\/|users\/[^/]+\/(?:role|status|logout-all)|users\/[^/]+$)/.test(path)&&(/\/api\/admin\/admins/.test(path)||/\/api\/admin\/sessions\//.test(path)||req.method==='DELETE'||/\/(?:role|status|logout-all)$/.test(path)))privilegedLimit(req.admin.id);
            if(/\/api\/admin\/users\/[^/]+\/reset-password$/.test(path))passwordResetLimit(req.admin.id);
        }
        if(!req.auditHook && !['GET','HEAD','OPTIONS'].includes(req.method)){
            req.auditHook=true;
            const record=value=>{if(res.statusCode<400&&!req.auditRecorded){const path=req.originalUrl.split('?')[0].toLowerCase(),resource=path.includes('/products')?'PRODUCT':path.includes('/orders')?'ORDER_STATUS':path.includes('/discounts')?'DISCOUNT':path.includes('/users')?'CUSTOMER':path.includes('/tickets')?'TICKET':path.includes('/posts')?'POST':path.includes('/comments')?'COMMENT':'ADMIN';adminSecurity.audit(req.admin,resource+'_'+({POST:'CREATED',PUT:'UPDATED',PATCH:'UPDATED',DELETE:'DELETED'}[req.method]||req.method),resource.toLowerCase(),req.params.id||value?.id||'');req.auditRecorded=true;}};
            const json=res.json.bind(res),end=res.end.bind(res);
            res.json=value=>{record(value);return json(value);};
            res.end=(...args)=>{record();return end(...args);};
        }next();}catch(e){next(e);}}
    function requireAdminSession(req,res,next){
        try {
            req.adminSession=session(req,'admin');
            if(!req.adminSession){
                if(session(req))return next(error(403,'دسترسی به پنل مدیریت مجاز نیست.'));
                return res.redirect(302,'/admin-login');
            }
            req.admin=req.adminSession.admin;
            if(!['ADMIN','SUPER_ADMIN'].includes(req.admin.role))return next(error(403,'دسترسی به پنل مدیریت مجاز نیست.'));
            next();
        } catch(e) { next(e); }
    }
    const routeLimit=guard.limiter({limit:30});
    app.use((req,res,next)=>{
        res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
        if(/^\/api\//i.test(req.path))res.setHeader('Cache-Control','no-store');
        if(/^\/api\//i.test(req.path)&&!['GET','HEAD','OPTIONS'].includes(req.method)) {
            const requestOrigin = req.headers.origin === undefined ? null : normalizeOrigin(req.headers.origin);
            if(req.headers.origin !== undefined && !isAllowedRequestOrigin(req, requestOrigin))return next(error(403,'مبدأ درخواست مجاز نیست.'));
            // An explicitly allowlisted cross-site frontend is permitted; untrusted cross-site requests remain blocked.
            if(req.headers['sec-fetch-site']==='cross-site' && !isAllowedRequestOrigin(req, requestOrigin))return next(error(403,'درخواست بین‌سایتی مجاز نیست.'));
            if(!req.is('application/json'))return next(error(415,'درخواست باید JSON باشد.'));
            if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))return next(error(400,'بدنه درخواست باید یک شیء JSON معتبر باشد.'));
            const kind=/^\/api\/(?:admin(?:\/|$)|products(?:\/|$))/i.test(req.path)?'admin':'user';
            const s=session(req,kind);
            if(s&&!validCsrf(req,s))return next(error(403,'اعتبار امنیتی درخواست منقضی شده است؛ صفحه را تازه کنید.'));
            if(req.body && ['cardNumber','cvv','cvv2','expiryDate'].some(k=>k in req.body))return next(error(400,'اطلاعات کارت بانکی را ارسال نکنید.'));
        }
        if(/^\/api\/(auth|admin\/login|checkout|contact|tickets|users\/me\/password)/i.test(req.path)) {
            try {routeLimit(hash(req.ip+':'+req.path.toLowerCase().replace(/\/+$/,'')));}catch(e){if(e.retryAfter)res.setHeader('Retry-After',String(e.retryAfter));return next(e);}
        }
        next();
    });
    const router=express.Router();
    // Authenticate the namespace before installing any admin handlers.
    router.use('/admin',(req,res,next)=>{
        if(req.method==='POST' && /^\/login\/?$/i.test(req.path))return next();
        return requireAdmin(req,res,next);
    });
    const route=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res,next)).catch(e=>{
        if(/^\/checkout(?:\/quote)?$/.test(req.path)){
            const message=String(e.message||'');
            const failureCode=e.status===429?'RATE_LIMITED':e.status===401?'SESSION_EXPIRED':e.status===409&&/موجود|stock/i.test(message)?'OUT_OF_STOCK':e.status>=500?'INTERNAL_ERROR':'VALIDATION_ERROR';
            journey.trusted('checkout_validation_failed',{failureCode});
        }
        next(e);
    });
    const analyticsLimit=guard.limiter({limit:60,windowMs:15*60000,maxEntries:5000});
    const analyticsSalt=crypto.randomBytes(16);
    router.post('/analytics/event',route((req,res)=>{
        const agent=String(req.headers['user-agent']||'');
        if(/(?:googlebot|bingbot|duckduckbot|baiduspider|yandexbot|slurp|facebookexternalhit)/i.test(agent))return res.status(204).end();
        analyticsLimit(hash(Buffer.concat([analyticsSalt,Buffer.from(String(req.ip||''))])));
        journey.client(req.body);
        res.status(204).end();
    }));
    installManagement(router,store,{requireAdmin,route,adminSecurity,requireRecentAdminAuthentication});
    require('./user-management.cjs').installUserManagement(router,store,{requireAdmin,route,adminSecurity,requireRecentAdminAuthentication});
    router.use('/checkout',(req,res,next)=>readSettings(store).maintenance?next(error(503,'فروشگاه در حال به‌روزرسانی است؛ کمی بعد تلاش کنید.')):next());
    const accountFeatures=installAccount(router,store,{requireUser,requireAdmin,route,createSession,factors});
    function credentials(body,register=false) {
        const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
        const password=typeof body.password==='string'?body.password:'';
        if(email.length<5||email.length>200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||Buffer.byteLength(password)>72||password.length<(register?12:1))
            throw error(register?400:401,register?'ایمیل معتبر و رمز عبور حداقل ۱۲ کاراکتری لازم است.':'اطلاعات ورود صحیح نیست.');
        return {email,password};
    }
    router.get('/auth/config',route((_req,res)=>res.json(authRecovery.publicConfig())));
    router.post('/auth/register',route(async(req,res)=>{
        await authRecovery.captchaGuard(req, 'register');
        const {email,password}=credentials(req.body,true);guard.password(password);if(req.body.confirmPassword!==undefined&&req.body.confirmPassword!==password)throw error(400,'Password confirmation does not match.');const name=field(req.body.name,'نام',2,100),phone=field(req.body.phone,'شماره موبایل',11,11);
        if(name.length<2||!/^09\d{9}$/.test(phone))throw error(400,'نام و شماره موبایل معتبر وارد کنید.');
        if(store.access('commerce').findAccountsByEmailAndPhone(email,phone))throw error(409,'این حساب قبلاً ثبت شده است.');
        const passwordHash=await bcrypt.hash(password,12),id=crypto.randomUUID();
        const user={id,name,firstName:name,lastName:'',displayName:name,avatar:'gamepad',email,phone,role:'user',addresses:[],joinDate:now()};
        const csrfToken=transaction(()=>{if(store.access('commerce').findAccountsByEmailAndPhone(email,phone))throw error(409,'این حساب قبلاً ثبت شده است.');store.access('commerce').createAccounts(id,email,phone,passwordHash,JSON.stringify(user));store.put('users',user,{insert:true});return createSession(res,id,'user',req);});
        journey.trusted('registration_completed');res.status(201).json({user,csrfToken});
    }));
    router.post('/auth/login',route(async(req,res)=>{
        await authRecovery.loginGuard(req);
        let email,password;
        try {({email,password}=credentials(req.body));}
        catch (error) {authRecovery.loginFailed(req);throw error;}
        const row=store.access('commerce').findAccountsByEmail(email);
        const valid=await bcrypt.compare(password,row?.password_hash||'$2b$12$uJbYKWiNFXiFSNTybLV2y.fUPnWxXVdOKtpTgCO.oZRNgL4FKae1i');
        const latest=row && store.access('commerce').findAccountsById(row.id);
        if(!latest||!valid||latest.password_hash!==row.password_hash||publicUser(latest).banned){authRecovery.loginFailed(req);throw error(401,'اطلاعات ورود صحیح نیست.');}
        if(factors.enabled(row.id)){
            const previous=session(req);if(previous)store.access('commerce').deleteSessionsByHash(previous.hash);
            res.clearCookie(cookieName('user'),cookieOptions(req));
            const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex');
            store.access('commerce').deletePendingAuthByUserIdAndExpires(row.id,Date.now());
            store.access('commerce').createPendingAuth(hash(token),row.id,hash(csrf),Date.now()+5*60000,Date.now(),hash(latest.password_hash),Number(JSON.parse(latest.payload).sessionVersion)||0);
            res.cookie(cookieName('pending'),token,{...cookieOptions(req),maxAge:5*60000});
            return res.json({twoFactorRequired:true,pendingCsrf:csrf});
        }
        authRecovery.loginSucceeded(req);
        transaction(()=>{accountFeatures.saveUser({...publicUser(latest),lastLogin:now()});recordLoginDevice(row.id,req);store.securityEvent('USER_LOGIN',row.id,{ip:req.ip});});
        const csrfToken=createSession(res,row.id,'user',req);journey.trusted('login_success');res.json({user:publicUser(row),csrfToken});
    }));
    router.post('/auth/2fa/verify',route((req,res)=>{
        factorVerifyLimit(req.ip);
        const name=cookieName('pending'),cookies=String(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
        if(cookies.length!==1)throw error(401,'تأیید ورود نامعتبر یا منقضی شده است.');
        const token=cookies[0].slice(name.length+1);if(!/^[a-f0-9]{64}$/.test(token))throw error(401,'تأیید ورود نامعتبر یا منقضی شده است.');
        const row=store.access('commerce').findPendingAuthByTokenHashAndExpires(hash(token),Date.now());
        if(!row||row.attempts>=5||typeof req.headers['x-csrf-token']!=='string'||hash(req.headers['x-csrf-token'])!==row.csrf_hash)throw error(401,'تأیید ورود نامعتبر یا منقضی شده است.');
        store.access('commerce').updatePendingAuthByTokenHashAndAttempts(row.token_hash);
        try{factors.check(row.user_id,req.body.code);}catch(e){store.securityEvent('USER_2FA_FAILED',row.user_id);throw e;}
        const account=store.access('commerce').findAccountsById(row.user_id);if(!account||publicUser(account).banned||hash(account.password_hash)!==row.password_check||(Number(JSON.parse(account.payload).sessionVersion)||0)!==row.principal_version)throw error(401,'تأیید ورود نامعتبر یا منقضی شده است.');
        store.access('commerce').deletePendingAuthByTokenHash(row.token_hash);res.clearCookie(name,cookieOptions(req));
        authRecovery.loginSucceeded({body:{email:account.email}});
        transaction(()=>{accountFeatures.saveUser({...publicUser(account),lastLogin:now()});recordLoginDevice(row.user_id,req);store.securityEvent('USER_2FA_SUCCESS',row.user_id);store.securityEvent('USER_LOGIN',row.user_id,{ip:req.ip});});
        const csrfToken=createSession(res,row.user_id,'user',req);journey.trusted('login_success');res.json({user:publicUser(account),csrfToken});
    }));
    router.get('/auth/session',route((req,res)=>{const s=session(req);res.json({user:s?.user||null,csrfToken:s?.csrf||null});}));
    router.post('/auth/logout',requireUser,route((req,res)=>{transaction(()=>{store.access('commerce').deleteSessionsByHash(req.session.hash);store.securityEvent('USER_LOGOUT',req.session.user.id);});res.clearCookie(cookieName('user'),cookieOptions(req));res.status(204).end();}));
    router.post('/auth/forgot-password/request',route(async(req,res)=>res.json(await authRecovery.requestOtp(req))));
    router.post('/auth/forgot-password/verify',route(async(req,res)=>res.json(await authRecovery.verifyOtp(req))));
    router.post('/auth/forgot-password/reset',route(async(req,res)=>res.json(await authRecovery.resetPassword(req))));
    router.get('/users/me',requireUser,route((req,res)=>res.json(req.session.user)));
    router.put('/users/me',requireUser,route(async(req,res)=>{
        const user=req.session.user,profile=profileFields(req.body,user);
        const email=field(req.body.email ?? user.email,'ایمیل',5,200).toLowerCase(),phone=field(req.body.phone ?? user.phone,'شماره موبایل',11,11);
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^09\d{9}$/.test(phone))throw error(400,'ایمیل یا شماره موبایل نامعتبر است.');
        let verifiedHash;
        const identityChanged=email!==user.email||phone!==user.phone;
        if(identityChanged) {
            if(typeof req.body.currentPassword!=='string'||!req.body.currentPassword||Buffer.byteLength(req.body.currentPassword)>72)throw error(403,'برای تغییر ایمیل یا موبایل، رمز عبور فعلی را وارد کنید.');
            const account=store.access('commerce').findAccountsById2(user.id);
            verifiedHash=account.password_hash;
            if(!await bcrypt.compare(req.body.currentPassword,verifiedHash))throw error(403,'برای تغییر ایمیل یا موبایل، رمز عبور فعلی را وارد کنید.');
            if(store.access('commerce').findAccountsByEmailAndPhoneAndId(email,phone,user.id))throw error(409,'ایمیل یا شماره موبایل قبلاً استفاده شده است.');
        }
        if(req.body.addresses!==undefined&&(!Array.isArray(req.body.addresses)||req.body.addresses.length>10))throw error(400,'فهرست آدرس‌ها نامعتبر است.');
        const addresses=Array.isArray(req.body.addresses)?req.body.addresses.map(a=>{
            if(a?.id&&!user.addresses?.some(old=>old.id===a.id))throw error(404,'آدرس پیدا نشد.');
            return addressInput(a,a.id||crypto.randomUUID(),false);
        }):undefined;
        if(addresses&&new Set(addresses.map(a=>a.id)).size!==addresses.length)throw error(400,'آدرس تکراری است.');
        if(addresses?.length){const defaultId=(addresses.find(a=>a.isDefault)||addresses[0]).id;addresses.forEach(a=>a.isDefault=a.id===defaultId);}
        let rotatedCsrf;
        const updated=transaction(()=>{
            if(!session(req))throw error(401,'Session has expired.');
            if(verifiedHash&&store.access('commerce').findAccountsById2(user.id)?.password_hash!==verifiedHash)throw error(401,'Session has expired.');
            const latest=publicUser(store.access('commerce').findAccountsById(user.id));
            if(identityChanged&&(latest.email!==user.email||latest.phone!==user.phone))throw error(409,'اطلاعات حساب تغییر کرده است؛ صفحه را تازه کنید.');
            const nextEmail=req.body.email===undefined?latest.email:email,nextPhone=req.body.phone===undefined?latest.phone:phone;
            if(store.access('commerce').findAccountsByEmailAndPhoneAndId(nextEmail,nextPhone,user.id))throw error(409,'ایمیل یا شماره موبایل قبلاً استفاده شده است.');
            if(addresses&&JSON.stringify(latest.addresses)!==JSON.stringify(user.addresses))throw error(409,'آدرس‌ها تغییر کرده‌اند؛ صفحه را تازه کنید.');
            const updated={...latest,...profileFields(req.body,latest),email:nextEmail,phone:nextPhone,addresses:addresses??latest.addresses??[],updatedAt:now()};
            store.access('commerce').updateAccountsById(nextEmail,nextPhone,user.id);
            accountFeatures.saveUser(updated);
            if(identityChanged){store.revokeSessions(user.id);store.securityEvent('USER_IDENTITY_CHANGED',user.id,{fields:['email','phone'].filter(k=>user[k]!==updated[k])});rotatedCsrf=createSession(res,user.id,'user',req);}
            return updated;
        });res.json(rotatedCsrf?{...updated,csrfToken:rotatedCsrf}:updated);
    }));
    router.get('/orders',requireUser,route((req,res)=>{const result=store.search.ordersForUser(req.query,req.session.user.id,{byDate:true});result.items=result.items.map(orderSummary);return respond(req,res,result);}));
    router.get('/orders/:id',requireUser,route((req,res)=>{const o=store.get('orders',req.params.id);if(!o||o.userId!==req.session.user.id)throw error(404,'سفارش پیدا نشد.');res.json(o);}));
    router.post('/admin/login',route(async(req,res)=>{
        if(!store.access('commerce').findAdminAccountsByActive())throw error(503,'حساب مدیریت هنوز روی سرور تنظیم نشده است.');
        const admin=await adminSecurity.login(req.body,req.ip);
        res.json({...admin,csrfToken:createSession(res,admin.id,'admin',req)});
    }));
    router.get('/admin/session',requireAdmin,route((req,res)=>res.json({...req.admin,csrfToken:req.adminSession.csrf})));
    router.post('/admin/logout',requireAdmin,route((req,res)=>{store.access('commerce').deleteSessionsByHash(req.adminSession.hash);res.clearCookie(cookieName('admin'),cookieOptions(req));adminSecurity.audit(req.admin,'ADMIN_LOGOUT','admin',req.admin.id);req.auditRecorded=true;res.status(204).end();}));
    const statuses=require('../storage/statuses.cjs').order;
    router.get('/admin/orders',requireAdmin,route((req,res)=>{
        const q=String(req.query.q||'').trim().toLowerCase(),status=String(req.query.status||''),sort=String(req.query.sort||'newest');
        if(q.length>120||!['','pending','paid','processing','shipped','delivered','cancelled'].includes(status)||!['newest','oldest','total_asc','total_desc'].includes(sort))throw error(400,'فیلتر نامعتبر است.');
        const paged=Object.keys(req.query).length;
        const result=store.search.orders(req.query,{q,status,sort});
        if(paged)result.items=result.items.map(orderSummary);
        return respond(req,res,result);
    }));
    router.get('/admin/orders/:id',requireAdmin,route((req,res)=>{const o=store.get('orders',req.params.id);if(!o)throw error(404,'سفارش پیدا نشد.');res.json(o);}));
    router.put('/admin/orders/:id',requireAdmin,route((req,res)=>{
        if(!statuses.includes(req.body.status))throw error(400,'وضعیت سفارش نامعتبر است.');
        const order=transaction(()=>{
            const o=store.get('orders',req.params.id);if(!o)throw error(404,'سفارش پیدا نشد.');
            store.assertRevision(o,req.body.revision);
            if(o.status==='cancelled'&&req.body.status!=='cancelled')throw error(409,'سفارش لغوشده قابل بازگشایی نیست.');
            if(req.body.status==='paid'&&o.paymentStatus!=='paid')throw error(409,'پرداخت واقعی برای این سفارش تأیید نشده است.');
            if(req.body.status==='cancelled'&&o.status!=='cancelled') {
                if(o.paymentStatus==='paid')throw error(503,'لغو سفارش پرداخت‌شده نیازمند فرآیند بازپرداخت تأییدشده است.');
                if(o.status==='delivered')throw error(409,'سفارش تحویل‌شده از این مسیر قابل لغو نیست.');
                for(const item of o.items||[])if(store.get('products',item.id))store.mutate('products',item.id,p=>({...p,stock:p.stock+item.quantity,updatedAt:now()}));
            }
            if(o.status!==req.body.status){const label={pending:'در انتظار',paid:'پرداخت‌شده',processing:'در حال آماده‌سازی',shipped:'ارسال‌شده',delivered:'تحویل‌شده',cancelled:'لغوشده'};accountFeatures.notify(o.userId,'order',req.body.status==='shipped'?'سفارش شما ارسال شد':'وضعیت سفارش تغییر کرد',`سفارش ${o.code} به وضعیت «${label[req.body.status]}» تغییر کرد.`,o.id);}
            if(o.status!==req.body.status){adminSecurity.audit(req.admin,'ORDER_STATUS_CHANGED','order',o.id,{previous:o.status,status:req.body.status});req.auditRecorded=true;}
            o.status=req.body.status;o.updatedAt=now();o.note=req.body.note===undefined?o.note||'':text(req.body.note,1000);return store.put('orders',o);
        });res.json(order);
    }));
    router.post('/admin/orders',requireAdmin,route(()=>{throw error(405,'سفارش باید از مسیر Checkout ثبت شود.');}));
    router.delete('/admin/orders/:id',requireAdmin,route(()=>{throw error(405,'سفارش را لغو کنید؛ سوابق مالی حذف نمی‌شوند.');}));
    router.post('/admin/users',requireAdmin,route(()=>{throw error(405,"حساب کاربر از مسیر ثبت‌نام ایجاد می‌شود.");}));
    function couponCode(value) {
        if(value===undefined||value==='')return '';
        if(typeof value!=='string'||value.length>50)throw error(400,'Invalid discount code.');
        const code=value.trim().toUpperCase();
        if(code&&!/^[A-Z0-9_-]{2,50}$/.test(code))throw error(400,'Invalid discount code.');
        return code;
    }
    function discountFor(code,subtotal,userId) {
        if(!code)return {discount:0,discountCode:''};
        const d=list('discounts').find(d=>d.code===code);
        if(!d||!d.active||(d.startsAt&&Date.parse(d.startsAt)>Date.now())||(d.expiresAt&&Date.parse(d.expiresAt)<=Date.now())||(d.maxUses!=null&&d.uses>=d.maxUses)||subtotal<(d.minPurchase||0))throw error(400,'کد تخفیف معتبر یا قابل استفاده نیست.');
        if(!['percent','fixed'].includes(d.type)||!Number.isSafeInteger(d.value)||d.value<1||(d.type==='percent'&&d.value>100)||(d.maxDiscount!=null&&(!Number.isSafeInteger(d.maxDiscount)||d.maxDiscount<1))||(d.perUserLimit!=null&&(!Number.isSafeInteger(d.perUserLimit)||d.perUserLimit<1)))throw error(400,'کد تخفیف معتبر یا قابل استفاده نیست.');
        if(d.perUserLimit!=null&&list('orders').filter(o=>o.userId===userId&&o.discountId===d.id).length>=d.perUserLimit)throw error(400,'کد تخفیف معتبر یا قابل استفاده نیست.');
        const raw=d.type==='percent'?Math.round(subtotal*d.value/100):d.value;
        return {discount:Math.min(subtotal,raw,d.maxDiscount??subtotal),discountCode:d.code,discountId:d.id,discountType:d.type,discountValue:d.value};
    }
    function quote(items,code,userId) {
        if(!Array.isArray(items)||!items.length||items.length>200)throw error(400,'اقلام سبد نامعتبر است.');
        const ids=new Set();
        const lines=items.map(i=>{
            const p=store.get('products',i?.id);const q=i?.quantity;
            if(!p||p.deletedAt||p.status!=='active'||ids.has(String(p.id))||!Number.isSafeInteger(q)||q<1||q>99||!Number.isSafeInteger(p.stock)||p.stock<0||q>p.stock||!Number.isSafeInteger(p.price)||p.price<=0||!Number.isSafeInteger(q*p.price))throw error(409,'محصول ناموجود است یا تعداد و قیمت معتبر نیست؛ حداکثر تعداد هر قلم ۹۹ است.');
            const percent=Number.isFinite(Number(p.discount))?Math.min(99,Math.max(0,Number(p.discount))):0;
            const price=Math.round(p.price*(100-percent)/100);
            if(!Number.isSafeInteger(price)||price<1)throw error(409,'قیمت نهایی محصول معتبر نیست.');
            ids.add(String(p.id));return {id:p.id,name:p.name,price,unitPrice:price,quantity:q,lineTotal:q*price};
        });
        const subtotal=lines.reduce((sum,i)=>sum+i.lineTotal,0);
        if(!Number.isSafeInteger(subtotal))throw error(400,'مبلغ سفارش نامعتبر است.');
        const discount=discountFor(couponCode(code),subtotal,userId);
        const shippingCost=shippingFor(store,subtotal-discount.discount);
        const total=subtotal-discount.discount+shippingCost;if(!Number.isSafeInteger(total)||total<0)throw error(400,'Invalid order amount.');
        return {items:lines,subtotal,...discount,shippingCost,total};
    }
    router.post('/checkout/quote',requireUser,route((req,res)=>{const totals=transaction(()=>{quoteLimit(req.session.user.id);return quote(req.body.items,req.body.discountCode,req.session.user.id);});res.json(totals);}));
    router.post('/checkout',requireUser,route((req,res)=>{
        const key=text(req.headers['idempotency-key'],100);if(!/^[a-zA-Z0-9-]{16,100}$/.test(key))throw error(400,'شناسه درخواست سفارش لازم است.');
        const b=req.body,user=req.session.user;
        const recipientFirstName=text(b.recipientName,50),recipientLastName=text(b.recipientLastName,50),recipientName=[recipientFirstName,recipientLastName].filter(Boolean).join(' ');
        const recipientPhone=text(b.recipientPhone,20),recipientAddress=text(b.recipientAddress,1000),recipientProvince=text(b.recipientProvince,60),recipientCity=text(b.recipientCity,60),recipientPostalCode=text(b.recipientPostalCode,10);
        if(b.shippingMethod!==undefined&&!['standard','express','pickup'].includes(b.shippingMethod))throw error(400,'Invalid shipping method.');
        const shippingMethod=['standard','express','pickup'].includes(b.shippingMethod)?b.shippingMethod:'standard',note=text(b.note,1000);
        if(recipientName.length<2||!/^09\d{9}$/.test(recipientPhone)||recipientAddress.length<10||b.isAgreed!==true)throw error(400,'نام، شماره موبایل، آدرس و پذیرش شرایط لازم است.');
        if((b.recipientLastName!==undefined&&recipientLastName.length<2)||(b.recipientProvince!==undefined&&recipientProvince.length<2)||(b.recipientCity!==undefined&&recipientCity.length<2)||(b.recipientPostalCode!==undefined&&!/^\d{10}$/.test(recipientPostalCode)))throw error(400,'نام خانوادگی، استان، شهر یا کد پستی نامعتبر است.');
        const requestHash=hash(JSON.stringify({items:Array.isArray(b.items)?b.items.map(i=>({id:String(i.id),quantity:i.quantity})).sort((a,b)=>a.id.localeCompare(b.id)):b.items,discountCode:couponCode(b.discountCode),recipientName,recipientPhone,recipientAddress,recipientProvince,recipientCity,recipientPostalCode,shippingMethod,note}));
        const result=transaction(()=>{
            if(!session(req))throw error(401,'Session has expired.');
            const at=Date.now();store.cleanup();
            const existing=store.access('commerce').findIdempotencyByUserIdAndKeyAndPurpose(user.id,key,at);
            if(existing){if(existing.request_hash!==requestHash)throw error(409,'این شناسه برای سفارش دیگری استفاده شده است.');const order=store.get('orders',existing.order_id);if(!order||order.userId!==user.id)throw error(409,'شناسه درخواست معتبر نیست.');require('./storage-migrations.cjs').event('idempotent-replay');return {order,replayed:true};}
            const duplicate=store.access('commerce').findIdempotencyByUserIdAndPurposeAndRequestHash(user.id,requestHash,new Date(Date.now()-60000).toISOString());
            if(duplicate)throw error(409,'این سفارش به‌تازگی ثبت شده است؛ سفارش‌های حساب خود را بررسی کنید.');
            checkoutLimit(user.id);
            const totals=quote(b.items,b.discountCode,user.id),id=crypto.randomUUID(),code=`W2-${crypto.randomUUID().toUpperCase()}`;
            const order={...totals,id,code,userId:user.id,userName:user.name,userEmail:user.email,userPhone:user.phone,recipientName,recipientFirstName,recipientLastName,recipientPhone,recipientProvince,recipientCity,recipientPostalCode,recipientAddress,shippingMethod,note,status:'pending',createdAt:now(),updatedAt:now(),isAgreed:true};
            const payment=getPaymentProvider().createPayment(order);Object.assign(order,payment,{paymentMethod:payment.provider});
            const savedOrder=store.put('orders',order,{insert:true});
            for(const item of order.items)store.mutate('products',item.id,p=>{if(!Number.isSafeInteger(p.stock)||p.stock<item.quantity)throw error(409,'موجودی کافی نیست.');return {...p,stock:p.stock-item.quantity,updatedAt:now()};});
            if(totals.discountId)store.mutate('discounts',totals.discountId,d=>({...d,uses:d.uses+1,updatedAt:now()}));
            store.access('commerce').createIdempotency(user.id,key,id,requestHash,'checkout',at,at+86400000);
            accountFeatures.notify(user.id,'order','سفارش شما ثبت شد',`سفارش ${code} با موفقیت ثبت شد.`,id);
            return {order:savedOrder};
        });if(!result.replayed)journey.trusted('order_created',{orderId:String(result.order.id)});res.status(result.replayed?200:201).json(result);
    }));
    router.get('/admin/discounts',requireAdmin,route((req,res)=>respond(req,res,collectionPage(store,'discounts',req.query,{defaultSize:Object.keys(req.query).length?20:100}))));
    function saveDiscount(req,res) {
        const result=transaction(()=>{
        const rows=list('discounts'),existing=req.params.id?rows.find(d=>String(d.id)===req.params.id):null;
        if(req.params.id&&!existing)throw error(404,'کد تخفیف پیدا نشد.');
        if(existing)store.assertRevision(existing,req.body.revision);
        const b={...existing,...req.body},code=couponCode(b.code),value=Number(b.value),type=b.type;
        if(['value','maxUses','perUserLimit','minPurchase','maxDiscount'].some(k=>b[k]!=null&&b[k]!==''&&!(typeof b[k]==='number'||typeof b[k]==='string'&&/^\d+$/.test(b[k])))||b.expiresAt!=null&&typeof b.expiresAt!=='string'||b.startsAt!=null&&typeof b.startsAt!=='string')throw error(400,'Invalid discount values.');
        if(!/^[A-Z0-9_-]{2,50}$/.test(code)||!['percent','fixed'].includes(type)||!Number.isSafeInteger(value)||value<=0||(type==='percent'&&value>100)||(type==='fixed'&&value>1e12)||rows.some(d=>d.code===code&&d.id!==existing?.id))throw error(400,'اطلاعات کد تخفیف نامعتبر است.');
        const maxUses=b.maxUses==null||b.maxUses===''?null:Number(b.maxUses),expiresAt=b.expiresAt||null;
        const perUserLimit=b.perUserLimit==null||b.perUserLimit===''?null:Number(b.perUserLimit);
        const maxDiscount=b.maxDiscount==null||b.maxDiscount===''?null:Number(b.maxDiscount);
        if((maxUses!==null&&(!Number.isSafeInteger(maxUses)||maxUses<1))||(perUserLimit!==null&&(!Number.isSafeInteger(perUserLimit)||perUserLimit<1||perUserLimit>1000))||(maxDiscount!==null&&(!Number.isSafeInteger(maxDiscount)||maxDiscount<1||maxDiscount>1e12))||(expiresAt&&!Number.isFinite(Date.parse(expiresAt))))throw error(400,'تاریخ انقضا یا محدودیت استفاده نامعتبر است.');
        const startsAt=b.startsAt||null,minPurchase=Number(b.minPurchase||0);
        if((startsAt&&!Number.isFinite(Date.parse(startsAt)))||(startsAt&&expiresAt&&Date.parse(startsAt)>=Date.parse(expiresAt))||!Number.isSafeInteger(minPurchase)||minPurchase<0||minPurchase>1e12||(b.active!==undefined&&typeof b.active!=='boolean'))throw error(400,'زمان یا حداقل خرید نامعتبر است.');
        const d={id:existing?.id||crypto.randomUUID(),code,type,value,active:b.active!==false,maxUses,perUserLimit,maxDiscount,startsAt,minPurchase,expiresAt,uses:existing?.uses||0,updatedAt:now()};
        if(d.maxUses!==null&&d.maxUses<d.uses)throw error(409,'سقف مصرف از مصرف ثبت‌شده کمتر است.');
        const saved=store.put('discounts',d,{insert:!existing});adminSecurity.audit(req.admin,existing?'DISCOUNT_UPDATED':'DISCOUNT_CREATED','discount',d.id,{code:d.code,type:d.type});req.auditRecorded=true;return {saved,existing};});res.status(result.existing?200:201).json(result.saved);
    }
    router.post('/admin/discounts',requireAdmin,route(saveDiscount));router.put('/admin/discounts/:id',requireAdmin,route(saveDiscount));
    router.post('/contact',route((req,res)=>{
        const b=req.body,name=text(b.name,100),email=text(b.email),subject=text(b.subject),message=text(b.message,3000);
        if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||message.length<5)throw error(400,'اطلاعات پیام را کامل کنید.');
        store.put('messages',{id:crypto.randomUUID(),name,email,subject,message,createdAt:now()},{insert:true});res.status(201).json({message:'پیام ثبت شد.'});
    }));
    router.get('/admin/messages',requireAdmin,route((req,res)=>respond(req,res,collectionPage(store,'messages',req.query,{defaultSize:Object.keys(req.query).length?20:100,order:'rowid DESC'}))));
    router.get('/health',route((req,res)=>res.json({status:'ok'})));
    app.use('/api',router);
    // Existing product/dashboard CRUD routes retain their behavior behind this guard.
    app.use('/api/admin',requireAdmin);
    return {requireAdmin,requireAdminSession,session,stats:admin=>analytics(store,admin).stats,adminSecurity};
}
module.exports={installCommerce};
