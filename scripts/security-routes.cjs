'use strict';
// Inventory the real Express registration tree using a disposable store and no listener.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function policy(route) {
    const {requiredPermission,requiresRecentAuthentication}=require('../lib/admin-security.cjs');
    const {method,path:routePath,handlers}=route,mutation=!['GET','HEAD','OPTIONS'].includes(method),api=routePath.startsWith('/api/');
    const admin=handlers.includes('requireAdmin'),customer=handlers.includes('requireUser'),page=handlers.includes('requireAdminSession');
    const pending=routePath==='/api/auth/2fa/verify';
    const publicAPIs=new Set(['GET /api/site-settings','GET /api/products','GET /api/products/:id','GET /api/auth/config','GET /api/auth/session','GET /api/health',
        'POST /api/auth/register','POST /api/auth/login','POST /api/admin/login','POST /api/contact',...['request','verify','reset'].map(action=>'POST /api/auth/forgot-password/'+action)]);
    if(api&&!admin&&!customer&&!pending&&!publicAPIs.has(method+' '+routePath))throw Error('Unclassified public API route: '+method+' '+routePath);
    const permission=admin?requiredPermission(routePath,method):page?'ADMIN or SUPER_ADMIN':null;
    if(permission==='unknown')throw Error('Unclassified administrative permission: '+routePath);
    const limits=['800/IP/min'];
    if(api)limits.push('300 API/IP/min');
    if(routePath.startsWith('/api/admin/'))limits.push('120 admin/IP/min');
    if(/^\/api\/(?:auth|admin\/login|checkout|contact|tickets|users\/me\/password)/.test(routePath))limits.push('30/route/IP/min');
    if(['/api/auth/login','/api/admin/login'].includes(routePath))limits.push('30 login/IP/15min; persistent 5-failure identity lockout');
    if(routePath==='/api/auth/register')limits.push('10 registration/IP/15min');
    if(mutation&&/^\/api\/(?:admin\/admins(?:\/|$)|users\/me\/password$|auth\/forgot-password\/)/.test(routePath))limits.push('15 sensitive/route/IP/15min');
    if(mutation&&(routePath==='/api/users/me/password'||routePath==='/api/users/me'&&method==='PUT'))limits.push('10 credential/profile writes/route/IP/15min');
    if(routePath.startsWith('/api/auth/forgot-password/'))limits.push('OTP phone/IP/challenge limits');
    if(routePath.startsWith('/api/users/me/2fa/'))limits.push('12 factor/customer/15min');
    if(pending)limits.push('30 verification/IP/15min; 5 attempts/challenge');
    if(routePath==='/api/checkout')limits.push('10 new orders/customer/15min; free idempotent replay');
    if(routePath==='/api/checkout/quote')limits.push('60 quotes/customer/min');
    if(admin&&mutation&&(/^\/api\/admin\/(?:admins(?:\/|$)|sessions\/[^/]+$|users\/[^/]+\/(?:role|status|logout-all)$)/.test(routePath)
        ||method==='DELETE'&&/^\/api\/admin\/users\/[^/]+$/.test(routePath)))limits.push('60 privileged checks/admin/15min (namespace and route guards share the budget)');
    if(routePath.startsWith('/api/admin/users/')&&mutation)limits.push('60 user mutations/admin/min; 10 user password resets/admin/min');
    if(routePath.endsWith('/reset-password')&&admin&&mutation)limits.push('10 password-reset checks/admin/15min (namespace and route guards share the budget)');
    return {...route,authentication:admin?'administrator':customer?'customer':page?'administrator document':pending?'pending password-verified login':'public',
        permission:permission||'none',csrf:!mutation?'not required':admin||customer?'session token required':pending?'pending-login token required':'Origin/JSON checks; token required if a matching session exists',
        rateLimits:limits,validation:api?'bounded path/query/body; route-specific allowlists, types and business constraints':'bounded URL and path; used parameters validated; fixed page or asset targets',
        ownership:customer?'authenticated customer identity; owner-scoped queries/collections':pending?'pending login principal':admin?'role/permission; target hierarchy and final Super Admin checks where applicable':'not applicable',
        recentAdminAuthentication:admin&&requiresRecentAuthentication(routePath,method)};
}

function capture() {
    if(process.env.WEB2_ROUTE_CAPTURE!=='1'||process.env.NODE_ENV!=='test')throw Error('Isolated route capture is required.');
    const folder=fs.realpathSync(process.env.WEB2_ROUTE_CAPTURE_DIR||'');
    if(path.dirname(folder)!==fs.realpathSync(os.tmpdir())||!path.basename(folder).startsWith('web2-route-audit-'))throw Error('Invalid capture workspace.');
    process.loadEnvFile=()=>{};
    Object.assign(process.env,{STORAGE_DRIVER:'sqlite',DATABASE_PATH:path.join(folder,'store.sqlite'),SQLITE_PATH:path.join(folder,'store.sqlite'),SEED_DATA_PATH:path.join(folder,'seed.json'),
        HOST:'127.0.0.1',PORT:'3000',APP_ORIGIN:'http://127.0.0.1:3000',ALLOWED_ORIGINS:'',TRUST_PROXY:'',ADMIN_USERNAME:'route-audit',ADMIN_PASSWORD:'Route inventory fixture 2026!',ADMIN_TOTP_SECRET:'',ACCOUNT_TOTP_KEY:'',
        CAPTCHA_PROVIDER:'turnstile',CAPTCHA_TEST_MODE:'true',TURNSTILE_SITE_KEY:'',TURNSTILE_SECRET_KEY:'',CAPTCHA_SITE_KEY:'',CAPTCHA_SECRET_KEY:'',SMS_PROVIDER:'mock',PAYMENT_MODE:'test'});
    const storage=require('../storage/index.cjs'),open=storage.openStorage,stores=[];
    storage.openStorage=(...args)=>{const store=open(...args);stores.push(store);return store;};
    const express=require('express');
    express.application.listen=function() {
        const routes=[];
        function walk(stack,prefix='') {
            for(const layer of stack) {
                if(layer.route) {
                    const paths=Array.isArray(layer.route.path)?layer.route.path:[layer.route.path];
                    for(const routePath of paths)for(const method of Object.keys(layer.route.methods)) {
                        routes.push({method:method.toUpperCase(),path:prefix+(typeof routePath==='string'?routePath:String(routePath)),handlers:layer.route.stack.map(handler=>handler.name)});
                    }
                } else if(layer.handle?.stack) {
                    // The active app has one mounted API router. Fail if a new mount is unclassified.
                    if(layer.regexp.source!=='^\\/api\\/?(?=\\/|$)')throw Error('Unclassified router mount.');
                    walk(layer.handle.stack,prefix+'/api');
                }
            }
        }
        walk(this._router.stack);
        for(const store of stores)store.close();
        process.stdout.write(JSON.stringify(routes));
        process.exit(0);
    };
    require('../server.js');
}

function inventory() {
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'web2-route-audit-'));
    try {
        fs.writeFileSync(path.join(folder,'seed.json'),'{}');
        return JSON.parse(execFileSync(process.execPath,[__filename,'--capture'],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,
            env:{...process.env,NODE_ENV:'test',WEB2_ROUTE_CAPTURE:'1',WEB2_ROUTE_CAPTURE_DIR:folder},stdio:['ignore','pipe','pipe']})).map(policy);
    } finally {
        if(path.dirname(fs.realpathSync(folder))!==fs.realpathSync(os.tmpdir())||!path.basename(folder).startsWith('web2-route-audit-'))throw Error('Unsafe capture cleanup.');
        fs.rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    }
}

function markdown(routes) {
    const escape=value=>String(value).replaceAll('|','\\|');
    return '# Phase 19 route and security inventory\n\nGenerated from the real root Express registration tree using `node scripts/security-routes.cjs --markdown`. Capture disables `.env` loading, uses a disposable SQLite database and never opens a listener. Archived applications are not mounted by the active root server.\n\n'
        +'GET registrations also accept HEAD with identical authentication and authorization. All API responses are `no-store`. Browser mutations require JSON and a trusted Origin/Referer when supplied; cross-site Fetch Metadata is rejected without an allowed Origin. Safe reads do not require CSRF. CSRF is also enforced on public mutations when the relevant browser session already exists.\n\n'
        +'Role permissions are the server-side map in `lib/admin-security.cjs`. `admins.manage`, `users.promote` and `users.delete` are Super Admin-only; legacy user role updates also recheck Super Admin in the handler. Every administrative user mutation requires authentication within 15 minutes, including legacy PUT and DELETE. Async credential work rechecks the session before committing. Limits are configured guard budgets; namespace and route guards can both consume the same privileged budget for one request.\n\n'
        +'| Method | Route | Authentication | Permission | CSRF | Rate limits | Validation | Ownership / target scope | Recent admin login |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
        +routes.map(route=>'| '+[route.method,'`'+route.path+'`',route.authentication,route.permission,route.csrf,route.rateLimits.join('; '),route.validation,route.ownership,route.recentAdminAuthentication?'required':'no'].map(escape).join(' | ')+' |').join('\n')
        +'\n\nStatic middleware and fallbacks:\n\n| Surface | Policy |\n| --- | --- |\n'
        +'| GET/HEAD `/css/*` | Exact stylesheet allowlist, extension and realpath checks; no directory listing. |\n'
        +'| GET/HEAD `/js/*` | Exact script allowlist and realpath checks. Five administration scripts require ADMIN/SUPER_ADMIN document authentication and no-store; admin-login.js is public. Express normalizes repeated mount separators before these same checks. |\n'
        +'| GET/HEAD `/img/*` | Image extensions only; dotfiles, traversal, backups, maps and realpath escapes denied. Existing SVGs use a sandboxed restrictive CSP. |\n'
        +'| `/admin.html`, `/admin.htm`, `/admin/index.html` | Denied with 404, including encoded aliases. `/admin` is the protected delivery route. |\n'
        +'| OPTIONS `/api/*` | Explicit-origin CORS preflight, no CSRF; global IP request limit still applies. |\n'
        +'| Unknown `/api/admin/*` | Namespace authentication and fail-closed permission checks precede fallback. |\n'
        +'| Unknown `/api/*` / public paths | JSON 404 / static escaped HTML 404; no arbitrary file access. |\n'
        +'| Legacy mutation aliases | `/api/products` POST/PUT/DELETE use the same admin session, permission, CSRF, revision and validation checks. `/api/admin/users/:id` PUT shares role/status hierarchy, recent-login and revocation logic. Disabled order-create/order-delete and admin user-create APIs return 405 after security checks. |\n'
        +'| Browser cart | Local browser state, no separate server cart API. Quotes and checkout validate trusted products and totals on the server. |\n'
        +'| Uploads and payments | No multipart upload/download endpoint or real payment callback/webhook exists. Admin artwork accepts validated image URLs or bounded signature-checked raster data; real payment mode fails closed. |\n'
        +'| Archived apps | `backend/`, `gaming-store/`, `gaming-ecommerce/` are separate inactive applications, excluded from release synchronization and public static roots; existing legacy security regressions remain in the suite. |\n';
}

if(require.main===module) {
    if(process.argv[2]==='--capture')capture();
    else if(process.argv.length===2)process.stdout.write(JSON.stringify(inventory(),null,2)+'\n');
    else if(process.argv.length===3&&process.argv[2]==='--markdown')process.stdout.write(markdown(inventory()));
    else throw Error('Run without arguments to inventory isolated application routes.');
}
module.exports={inventory,markdown,policy};
