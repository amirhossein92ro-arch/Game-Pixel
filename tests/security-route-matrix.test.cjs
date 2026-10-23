'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const {inventory}=require('../scripts/security-routes.cjs');
const {launch}=require('./helpers/security-server.cjs');
const routes=inventory(),root=path.resolve(__dirname,'..');
const url=route=>route.path.replaceAll(':id','00000000-0000-4000-8000-000000000001');
const chunks=(rows,size=20)=>Array.from({length:Math.ceil(rows.length/size)},(_,index)=>rows.slice(index*size,(index+1)*size));
const rawResponse=(base,requestPath,method='GET')=>new Promise((resolve,reject)=>{
    const request=http.request(base,{method,path:requestPath},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('error',reject);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body}));});
    request.setTimeout(20000,()=>request.destroy(Error('Raw security request timed out.')));request.on('error',reject);request.end();
});
const rawStatus=async(...args)=>(await rawResponse(...args)).status;

test('all registered customer APIs deny anonymous callers and all administrative APIs deny USER callers',async t=>{
    assert.ok(routes.length>=129);assert.equal(routes.some(route=>route.permission==='unknown'),false);
    const protectedRoutes=routes.filter(route=>['customer','administrator'].includes(route.authentication));
    for(const [index,block]of chunks(protectedRoutes).entries())await t.test('registered route block '+(index+1),async t=>{
        const env=await launch(t),guest=env.client(),buyer=env.client();await env.register(buyer);
        for(const route of block) {
            const body=route.method==='GET'?undefined:{};
            assert.equal((await guest.call(url(route),route.method,body)).status,401,route.method+' '+route.path);
            if(route.authentication==='administrator')assert.equal((await buyer.call(url(route),route.method,body)).status,403,route.method+' '+route.path);
        }
    });
});

test('every registered authenticated mutation rejects both missing and invalid CSRF tokens',async t=>{
    const mutations=routes.filter(route=>['customer','administrator'].includes(route.authentication)&&!['GET','HEAD','OPTIONS'].includes(route.method));
    for(const [index,block]of chunks(mutations).entries())await t.test('mutation block '+(index+1),async t=>{
        const env=await launch(t),admin=env.client(),buyer=env.client();await env.admin(admin);await env.register(buyer);
        for(const route of block)for(const token of [null,'invalid-token']) {
            const client=route.authentication==='administrator'?admin:buyer;
            const result=await client.call(url(route),route.method,{}, {'X-CSRF-Token':token});
            assert.equal(result.status,403,route.method+' '+route.path+' '+(token===null?'missing':'invalid'));
        }
    });
});

test('CSRF, expiry, CORS, preflights and host/proxy assumptions remain server enforced',async t=>{
    const env=await launch(t),client=env.client();await env.register(client);
    assert.equal((await client.call('/api/users/me')).status,200);
    assert.equal((await client.call('/api/users/me/notifications/read','PUT',{})).status,200);
    for(const origin of ['https://untrusted.example.invalid','null']) {
        const result=await client.call('/api/users/me/notifications/read','PUT',{}, {Origin:origin});assert.equal(result.status,403);assert.equal(result.response.headers.get('Access-Control-Allow-Origin'),null);
    }
    const denied=await client.call('/api/products','OPTIONS',undefined,{Origin:'https://untrusted.example.invalid','Access-Control-Request-Method':'PUT'});assert.equal(denied.status,403);
    const allowed=await client.call('/api/products','OPTIONS',undefined,{'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type,x-csrf-token'});assert.equal(allowed.status,204);assert.equal(allowed.response.headers.get('Access-Control-Allow-Origin'),env.base);
    const spoofed=await client.call('/', 'GET',undefined,{Host:'untrusted.example.invalid','X-Forwarded-Host':'untrusted.example.invalid','X-Forwarded-Proto':'https'});
    assert.equal(spoofed.status,200);assert.ok(spoofed.raw.includes(env.base));assert.doesNotMatch(spoofed.raw,/https:\/\/untrusted\.example/);assert.equal(spoofed.response.headers.get('Strict-Transport-Security'),null);
    const db=env.openDatabase();db.prepare('UPDATE sessions SET expires=?').run(Date.now()-1000);
    assert.equal((await client.call('/api/users/me/notifications/read','PUT',{})).status,401);
});

test('sensitive files, encoded traversal, unsupported methods and oversized bodies disclose no secrets',async t=>{
    const env=await launch(t),guest=env.client();
    for(const route of ['/.env','/.env.production','/package.json','/package-lock.json','/data.json','/.git/config','/.runtime/phase19-source-baseline.json',
        '/tests/fixtures/migration-v1.json','/storage/sqlite/adapter.cjs','/deploy/ecosystem.config.cjs','/scripts/backup.cjs','/var/web2.sqlite','/var/web2.sqlite-wal','/backups/store.db',
        '/server.js','/backend/.env','/node_modules/express/package.json','/js/session.js.map','/img/.private.pem','/temp_old_section.txt']) {
        const result=await guest.call(route);assert.equal(result.status,404,route);assert.doesNotMatch(result.raw,/password_hash|ADMIN_PASSWORD|BEGIN PRIVATE KEY|SQLITE|node_modules\\/);
    }
    for(const requestPath of ['/img/../.env','/img/%2e%2e/.env','/img/%252e%252e/.env','/img/%2e%2e%5c.env','/img/%00.svg','/api/%2e%2e/.env'])assert.ok([400,404].includes(await rawStatus(env.base,requestPath)),requestPath);
    // Express normalizes the mount separator; the same allowlist and admin guard must still apply.
    for(const method of ['GET','HEAD']) {
        const publicScript=await rawResponse(env.base,'/js//session.js',method);assert.equal(publicScript.status,200);assert.match(publicScript.headers['content-type'],/javascript/);
        if(method==='GET')assert.equal(publicScript.body,fs.readFileSync(path.join(root,'js/session.js'),'utf8'));
        for(const requestPath of ['/js//admin-users.js','/js//%61dmin-users.js']) {
            const denied=await rawResponse(env.base,requestPath,method);assert.equal(denied.status,302,method+' '+requestPath);assert.equal(denied.headers.location,'/admin-login');assert.equal(denied.headers['cache-control'],'no-store');assert.doesNotMatch(denied.body,/Web2Admin|loadAdminUsers/);
        }
        assert.equal(await rawStatus(env.base,'/js//private.js',method),404);
    }
    const marker='phase19-secret-marker';const large=await guest.call('/api/contact','POST',JSON.stringify({message:marker+'x'.repeat(1048576)}));assert.equal(large.status,413);assert.doesNotMatch(large.raw,/phase19-secret-marker|stack|SyntaxError|node_modules|SELECT/);
    for(const method of ['TRACE','PATCH'])assert.ok([400,404,405].includes(await rawStatus(env.base,'/health',method)));
    for(const body of ['{"__proto__":{"polluted":true}}','{"nested":{"constructor":{"prototype":{"polluted":true}}}}'])assert.equal((await guest.call('/api/contact','POST',body)).status,400);
    assert.equal({}.polluted,undefined);assert.doesNotMatch(env.logs(),/phase19-secret-marker|Defensive audit administrator 2026!/);
});

test('rate limits cannot be bypassed using an untrusted forwarding header',async t=>{
    const env=await launch(t),guest=env.client();
    for(let index=0;index<30;index++)assert.equal((await guest.call('/api/contact','POST',{}, {'X-Forwarded-For':'198.51.100.'+index})).status,400);
    const limited=await guest.call('/api/contact','POST',{}, {'X-Forwarded-For':'203.0.113.99'});assert.equal(limited.status,429);assert.ok(Number(limited.response.headers.get('Retry-After'))>0);
});

test('production headers and canonical URLs do not depend on an attacker-supplied Host',async t=>{
    const env=await launch(t,{production:true}),guest=env.client();
    const result=await guest.call('/', 'GET',undefined,{Host:'untrusted.example.invalid','X-Forwarded-Host':'untrusted.example.invalid'});
    assert.equal(result.status,200);assert.ok(result.raw.includes(env.origin));assert.doesNotMatch(result.raw,/https:\/\/untrusted\.example/);
    assert.equal(result.response.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(result.response.headers.get('X-Frame-Options'),'DENY');assert.match(result.response.headers.get('Referrer-Policy'),/strict-origin/);
    assert.match(result.response.headers.get('Permissions-Policy'),/camera=\(\)/);assert.equal(result.response.headers.get('Strict-Transport-Security'),null);
    const csp=result.response.headers.get('Content-Security-Policy');assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/object-src 'none'/);assert.doesNotMatch(csp,/unsafe-eval|script-src[^;]*unsafe-inline/);
    const session=await guest.call('/api/auth/session');assert.deepEqual(session.data,{user:null,csrfToken:null});assert.equal(session.response.headers.get('Cache-Control'),'no-store');
});

test('URL-controlled return destinations accept only intended same-origin pages',()=>{
    for(const destination of ['https://untrusted.example.invalid/','//untrusted.example.invalid/','/\\untrusted.example.invalid/','javascript:alert(1)','data:text/html,x','/%2f%2funtrusted.example.invalid','/admin','/checkout.html%0d%0aLocation:evil']) {
        const dom=new JSDOM('<body></body>',{url:'https://shop.example.invalid/profile.html?returnTo='+encodeURIComponent(destination),runScripts:'outside-only',virtualConsole:new VirtualConsole()});
        try {vm.runInContext(fs.readFileSync(path.join(root,'js/profile.js'),'utf8'),dom.getInternalVMContext());assert.equal(vm.runInContext('accountReturnPath()',dom.getInternalVMContext()),'',destination);}finally{dom.window.close();}
    }
    const dom=new JSDOM('<body></body>',{url:'https://shop.example.invalid/profile.html?returnTo=%2Fcheckout.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
    try {vm.runInContext(fs.readFileSync(path.join(root,'js/profile.js'),'utf8'),dom.getInternalVMContext());assert.equal(vm.runInContext('accountReturnPath()',dom.getInternalVMContext()),'/checkout.html');}finally{dom.window.close();}
});
