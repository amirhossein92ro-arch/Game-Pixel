'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');

test('registration accepts explicit production and local development origins without anonymous CSRF',async()=>{
    const root=path.join(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-register-origin-'));
    const port=32000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
    const env={...process.env,PORT:String(port),NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',
        ALLOWED_ORIGINS:' http://109.122.247.237/ , , http://109.122.247.237:3000/ ',
        DATABASE_PATH:path.join(temp,'registration.sqlite'),ADMIN_PASSWORD:'registration-test-admin-2026',CAPTCHA_TEST_MODE:'true'};
    delete env.DEV_FRONTEND_ORIGINS;
    const server=spawn(process.execPath,['server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
    try {
        await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(Error('Server startup timeout')),15000);
            server.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});
            server.stdout.on('data',chunk=>{if(String(chunk).includes('Server is running')){clearTimeout(timer);resolve();}});
        });
        const anonymous=await fetch(base+'/api/auth/session');
        assert.equal(anonymous.status,200);
        assert.deepEqual(await anonymous.json(),{user:null,csrfToken:null});
        const origins=['http://localhost:5000','http://127.0.0.1:5000','http://localhost:3000','http://127.0.0.1:3000','http://109.122.247.237','http://109.122.247.237:3000'];
        let cookie,csrfToken;
        for(const [i,origin] of origins.entries()) {
            const response=await fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:origin,Referer:origin+'/profile.html','Content-Type':'application/json'},
                body:JSON.stringify({name:'Registration Test',email:`registration-${i}@example.invalid`,phone:`0912000000${i}`,password:'registration-test-password-2026',captchaToken:'test-valid-captcha'})});
            const data=await response.json();
            assert.equal(response.status,201,JSON.stringify({origin,referer:origin+'/profile.html',host:new URL(base).host,method:'POST',path:'/api/auth/register',nodeEnv:env.NODE_ENV,response:data}));
            assert.ok(data.user.id);assert.ok(data.csrfToken);
            assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
            assert.equal(response.headers.get('Access-Control-Allow-Credentials'),'true');
            cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');csrfToken=data.csrfToken;
        }
        const headers={Origin:origins[0],Cookie:cookie,'Content-Type':'application/json'};
        const fields={name:'Second Registration',email:'registration-second@example.invalid',phone:'09120000009',password:'registration-test-password-2026',captchaToken:'test-valid-captcha'};
        assert.equal((await fetch(base+'/api/auth/register',{method:'POST',headers,body:JSON.stringify(fields)})).status,403,'authenticated registration still requires its session CSRF token');
        assert.equal((await fetch(base+'/api/auth/register',{method:'POST',headers:{...headers,'X-CSRF-Token':csrfToken},body:JSON.stringify(fields)})).status,201);
        const rejected=await fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:'http://attacker.invalid','Content-Type':'application/json'},body:JSON.stringify(fields)});
        assert.equal(rejected.status,403);
        assert.equal((await rejected.json()).error,'مبدأ درخواست مجاز نیست.');
    } finally {
        if(server.exitCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}
        fs.rmSync(temp,{recursive:true,force:true});
    }
});
