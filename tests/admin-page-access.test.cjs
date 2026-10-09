'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

const root=path.resolve(__dirname,'..');

test('admin HTML is delivered only after a trusted admin session and role check',async()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'admin-page-access-'));
    const port=35000+Math.floor(Math.random()*1000);
    const base=`http://127.0.0.1:${port}`;
    const password='Admin-page-test-password-2026!';
    const child=spawn(process.execPath,['server.js'],{
        cwd:root,
        env:{...process.env,NODE_ENV:'test',PORT:String(port),APP_ORIGIN:base,DATABASE_PATH:path.join(temp,'test.sqlite'),ADMIN_USERNAME:'admin',ADMIN_PASSWORD:password,ADMIN_TOTP_SECRET:'',AUTH_CAPTCHA_ENABLED:'false'},
        stdio:['ignore','pipe','pipe'],windowsHide:true
    });

    function client(){
        return {cookie:'',csrf:'',async request(url,{method='GET',body,redirect='manual'}={}){
            const response=await fetch(base+url,{method,redirect,headers:{Origin:base,Cookie:this.cookie,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(this.csrf?{'X-CSRF-Token':this.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
            const setCookies=response.headers.getSetCookie();
            if(setCookies.length)this.cookie=setCookies.map(value=>value.split(';')[0]).join('; ');
            const text=await response.text();
            let data=null;try{data=text?JSON.parse(text):null;}catch{}
            if(data?.csrfToken)this.csrf=data.csrfToken;
            return {status:response.status,headers:response.headers,text,data};
        }};
    }

    const guest=client(),user=client(),superadmin=client(),admin=client();
    try {
        await new Promise((resolve,reject)=>{
            let errors='';
            const timer=setTimeout(()=>reject(Error(errors||'startup timeout')),20000);
            child.stderr.on('data',chunk=>errors+=chunk);
            child.once('exit',()=>{clearTimeout(timer);reject(Error(errors||'server exited'));});
            child.stdout.on('data',chunk=>{if(String(chunk).includes('Server is running')){clearTimeout(timer);resolve();}});
        });

        const direct=await guest.request('/admin.html');
        assert.equal(direct.status,404);
        assert.doesNotMatch(direct.text,/adminDashboard|CONTROL CENTER/);
        assert.equal((await guest.request('/admin.htm')).status,404);
        assert.equal((await guest.request('/admin/index.html')).status,404);
        assert.equal((await guest.request('/%2e%2e/admin.html')).status,404);
        assert.equal((await guest.request('/%252e%252e%252fadmin.html')).status,404);

        const guestAdmin=await guest.request('/admin');
        assert.equal(guestAdmin.status,302);
        assert.equal(guestAdmin.headers.get('location'),'/admin-login');
        assert.equal((await guest.request('/api/admin/users')).status,401);

        const loginPage=await guest.request('/admin-login');
        assert.equal(loginPage.status,200);
        assert.match(loginPage.text,/adminLoginForm/);
        assert.doesNotMatch(loginPage.text,/adminDashboard|data-admin-panel|adminTotalUsers/);

        const registration=await user.request('/api/auth/register',{method:'POST',body:{name:'Normal User',email:'normal-user@example.invalid',phone:'09121117654',password}});
        assert.equal(registration.status,201);
        assert.equal((await user.request('/admin')).status,403);
        assert.equal((await user.request('/api/admin/users')).status,403);

        const superLogin=await superadmin.request('/api/admin/login',{method:'POST',body:{username:'admin',password}});
        assert.equal(superLogin.status,200);
        assert.equal((await superadmin.request('/admin')).status,200);
        const created=await superadmin.request('/api/admin/admins',{method:'POST',body:{username:'page-admin',password,role:'ADMIN'}});
        assert.equal(created.status,201);

        const loggedIn=await admin.request('/api/admin/login',{method:'POST',body:{username:'page-admin',password}});
        assert.equal(loggedIn.status,200);
        assert.equal(loggedIn.data.role,'ADMIN');
        assert.match(loggedIn.headers.get('set-cookie'),/HttpOnly/i);
        assert.match(loggedIn.headers.get('set-cookie'),/SameSite=Strict/i);
        const dashboard=await admin.request('/admin');
        assert.equal(dashboard.status,200);
        assert.match(dashboard.text,/adminDashboard/);
        assert.doesNotMatch(dashboard.text,/adminLoginForm/);
        assert.equal((await admin.request('/api/admin/users')).status,200);

        assert.equal((await admin.request('/api/admin/logout',{method:'POST',body:{}})).status,204);
        const afterLogout=await admin.request('/admin');
        assert.equal(afterLogout.status,302);
        assert.equal(afterLogout.headers.get('location'),'/admin-login');
    } finally {
        if(child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}
        fs.rmSync(temp,{recursive:true,force:true});
    }
});
