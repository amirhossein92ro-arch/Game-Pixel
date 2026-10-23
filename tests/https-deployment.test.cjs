'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {hstsOptions,validateRuntime}=require('../lib/runtime-config.cjs');
const {configuration,effectiveConfiguration}=require('../scripts/https-preflight.cjs');
const {smoke}=require('../scripts/production-smoke.cjs');
const {launch}=require('./helpers/security-server.cjs');
const env={NODE_ENV:'production',HOST:'127.0.0.1',PORT:'3000',APP_ORIGIN:'https://shop.example.invalid',TRUST_PROXY:'loopback',ALLOWED_ORIGINS:'',ADMIN_PASSWORD:'Transport audit fixture 2026!'};
test('public production bindings and malformed HSTS are rejected before startup',()=>{
    for(const HOST of ['0.0.0.0','::','198.51.100.10','public.example.invalid'])assert.throws(()=>validateRuntime({...env,HOST}),/HOST/);
    for(const HSTS_MAX_AGE of ['-1','1.5','300; includeSubDomains','31536001','true','', '000300'])assert.throws(()=>hstsOptions({...env,HSTS_MAX_AGE}),/HSTS_MAX_AGE/);
    assert.equal(hstsOptions(env),false);assert.equal(hstsOptions({...env,NODE_ENV:'test',HSTS_MAX_AGE:'300'}),false);
});
test('offline HTTPS audit rejects origin, CORS, upstream and proxy drift without revealing values',()=>{
    assert.equal(configuration(env,'shop.example.invalid').status,'ok');
    for(const domain of ['YOUR_DOMAIN','www.YOUR_DOMAIN','127.0.0.1','shop.example.invalid/path','https://shop.example.invalid'])assert.equal(configuration(env,domain).status,'failed');
    for(const override of [{APP_ORIGIN:'http://localhost:3000'},{APP_ORIGIN:'https://other.example.invalid'},{ALLOWED_ORIGINS:'https://other.example.invalid'},{HOST:'0.0.0.0'},{PORT:'3001'},{TRUST_PROXY:'true'},{NODE_ENV:'test'}]){
        const result=configuration({...env,...override,API_KEY:'transport-secret-marker'},'shop.example.invalid');assert.equal(result.status,'failed');assert.doesNotMatch(JSON.stringify(result),/transport-secret-marker|Transport audit fixture|other\.example|localhost/);
    }
});
test('effective PM2 audit detects stale transport overrides and refuses duplicates or a different release',()=>{
    const root=path.resolve(__dirname,'..'),entry={name:'web2',pm2_env:{status:'online',pm_cwd:root,pm_exec_path:path.join(root,'server.js'),APP_ORIGIN:'https://old.example.invalid',ADMIN_PASSWORD:'must-not-be-reported'}};
    const checked=effectiveConfiguration(env,[entry]);assert.deepEqual(checked.mismatches,['APP_ORIGIN']);assert.equal(configuration(checked.effective,'shop.example.invalid').status,'failed');
    assert.throws(()=>effectiveConfiguration(env,[entry,entry]),/ONE_ONLINE/);assert.throws(()=>effectiveConfiguration(env,[{...entry,pm2_env:{...entry.pm2_env,pm_cwd:path.join(root,'other')}}]),/RELEASE_PATH/);
});
test('real production responses defer HSTS until explicitly enabled, without adding subdomains or preload',async t=>{
    for(const hstsMaxAge of ['0','300'])await t.test('max age '+hstsMaxAge,async t=>{
        const fixture=await launch(t,{production:true,hstsMaxAge});
        const response=await fetch(fixture.base+'/',{headers:{'X-Forwarded-Proto':'https'}});
        assert.equal(response.status,200);assert.equal(response.headers.get('Strict-Transport-Security'),hstsMaxAge==='0'?null:'max-age=300');
        for(const header of ['Content-Security-Policy','X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy'])assert.ok(response.headers.get(header));
    });
});
test('HTTPS smoke makes HSTS an explicit post-stability check and detects header regressions',async()=>{
    const request=async url=>{
        const route=new URL(url).pathname,headers={'Content-Security-Policy':"default-src 'self'",'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=()','Cache-Control':'no-store',Server:'nginx'};
        if(['/health','/ready'].includes(route))return Response.json({status:'ok'},{headers});
        if(route==='/api/products')return Response.json([],{headers});
        if(route==='/api/auth/session')return Response.json({user:null,csrfToken:null},{headers});
        if(['/api/users/me','/api/orders','/api/admin/session','/api/admin/products'].includes(route))return new Response(null,{status:401,headers});
        return new Response(null,{status:['/','/cart','/profile','/checkout','/admin-login'].includes(route)?200:404,headers});
    };
    assert.equal((await smoke(env.APP_ORIGIN,{request})).status,'ok');
    assert.equal((await smoke(env.APP_ORIGIN,{request,requireHsts:true})).status,'failed');
    const wrapped=modify=>async url=>{const response=await request(url);modify(response.headers);return response;};
    assert.equal((await smoke(env.APP_ORIGIN,{request:wrapped(headers=>headers.set('Strict-Transport-Security','max-age=300')),requireHsts:true})).status,'ok');
    for(const modify of [headers=>headers.delete('Permissions-Policy'),headers=>headers.set('Server','nginx/1.28.3')])assert.equal((await smoke(env.APP_ORIGIN,{request:wrapped(modify)})).status,'failed');
});
