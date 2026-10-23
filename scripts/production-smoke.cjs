'use strict';
// Anonymous GETs only: no accounts, orders, stock, provider messages or sessions created.
const sensitive=['/.env','/.env.production','/data.json','/var/web2.sqlite','/var/web2.sqlite-wal','/backups/store.sqlite','/logs/web2.log',
    '/deploy/ecosystem.config.cjs','/scripts/backup.cjs','/.git/config','/tests/fixtures/migration-v1.json','/img/private.key','/server.js','/package-lock.json'];
function target(value){
    const url=new URL(value);
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&url.hostname!=='127.0.0.1')throw Error('HTTPS_OR_LOOPBACK_ORIGIN_REQUIRED');
    return url;
}
async function smoke(base,{request=fetch,requireHsts=false}={}){
    const url=target(base),checks=[];
    if(requireHsts&&url.protocol!=='https:')throw Error('HSTS_REQUIRES_HTTPS');
    async function check(route,status,{json,headers=false}={}){
        const started=performance.now();let response,passed=false,code;
        try{
            response=await request(url.origin+route,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(5000)});
            passed=(Array.isArray(status)?status:[status]).includes(response.status);
            if(json)passed=json(await response.json())&&passed;
            else await response.arrayBuffer();
            if(headers)passed=passed&&response.headers.get('X-Content-Type-Options')==='nosniff'&&!!response.headers.get('Content-Security-Policy')&&response.headers.get('X-Frame-Options')==='DENY'&&!!response.headers.get('Referrer-Policy')&&!!response.headers.get('Permissions-Policy')&&!response.headers.has('X-Powered-By')&&(!requireHsts||/^max-age=[1-9]\d*(?:;|$)/i.test(response.headers.get('Strict-Transport-Security')||''))&&!/nginx\//i.test(response.headers.get('Server')||'');
            if(route==='/health'||route==='/ready')passed=passed&&response.headers.get('Cache-Control')==='no-store'&&performance.now()-started<2000;
            if(!passed)code='UNEXPECTED_HTTP_RESPONSE';
        }catch{code='HTTP_REQUEST_FAILED';}
        checks.push({route,passed,...(response?{httpStatus:response.status}:{}),elapsedMs:Math.round(performance.now()-started),...(code?{code}:{})});
    }
    for(const route of ['/health','/ready'])await check(route,200,{json:body=>body?.status==='ok'});
    await check('/',200,{headers:true});
    const catalog=body=>Array.isArray(body)||Array.isArray(body?.items);
    await check('/api/products?page=1&limit=1',200,{json:catalog});
    await check('/api/products?q=phase21-synthetic-missing-item&limit=1',200,{json:catalog});
    await check('/api/auth/session',200,{json:body=>body?.user===null&&body?.csrfToken===null});
    for(const route of ['/cart','/profile','/checkout','/admin-login'])await check(route,200);
    for(const route of ['/api/users/me','/api/orders','/api/admin/session','/api/admin/products'])await check(route,401);
    await check('/admin.html',404);
    for(const route of sensitive)await check(route,[403,404]);
    return {status:checks.every(row=>row.passed)?'ok':'failed',scope:'anonymous-read-only',https:url.protocol==='https:',checks};
}
if(require.main===module)(async()=>{try{
    const args=process.argv.slice(2);if(![2,3].includes(args.length)||args[0]!=='--base'||args.length===3&&args[2]!=='--require-hsts')throw Error('ARGUMENTS_INVALID');
    const result=await smoke(args[1],{requireHsts:args[2]==='--require-hsts'});console.log(JSON.stringify(result,null,2));if(result.status!=='ok')process.exitCode=1;
}catch{console.error(JSON.stringify({status:'failed',code:'SMOKE_CHECK_FAILED'}));process.exitCode=1;}})();
module.exports={smoke,target};
