'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const bcrypt=require('bcrypt'),{JSDOM,VirtualConsole}=require('jsdom');
const {openDatabase}=require('../lib/database.cjs');
const {validateBootstrapPassword}=require('../lib/admin-security.cjs');
const root=path.join(__dirname,'..');
test('short bootstrap credential requires explicit development/test opt-in and production rejects it',()=>{
    for(const NODE_ENV of ['development','test'])assert.doesNotThrow(()=>validateBootstrapPassword({NODE_ENV,ADMIN_PASSWORD:'12345',DEV_ADMIN_PASSWORD_ENABLED:'true'}));
    for(const NODE_ENV of ['production',undefined])assert.throws(()=>validateBootstrapPassword({NODE_ENV,ADMIN_PASSWORD:'12345',DEV_ADMIN_PASSWORD_ENABLED:'true'}));
    assert.throws(()=>validateBootstrapPassword({NODE_ENV:'development',ADMIN_PASSWORD:'12345'}));
    assert.throws(()=>validateBootstrapPassword({NODE_ENV:'test',ADMIN_PASSWORD:'1234',DEV_ADMIN_PASSWORD_ENABLED:'true'}));
    assert.throws(()=>validateBootstrapPassword({NODE_ENV:'production',ADMIN_PASSWORD:'12345',DEV_ADMIN_PASSWORD_ENABLED:'false'}));
    assert.doesNotThrow(()=>validateBootstrapPassword({NODE_ENV:'production',ADMIN_PASSWORD:'Strong-production-password-2026',DEV_ADMIN_PASSWORD_ENABLED:'false'}));
});
test('development admin is updated in place; real API and login form enforce auth, CSRF and logout',async()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-dev-admin-')),database=path.join(temp,'test.sqlite');
    const port=31000+Math.floor(Math.random()*1000),base=`http://localhost:${port}`;
    const initial=openDatabase(database,path.join(root,'data.json')),at=new Date().toISOString();
    initial.db.prepare('INSERT INTO admin_accounts VALUES(?,?,?,?,?,?,?,?)').run('bootstrap-admin','admin',bcrypt.hashSync('Previous-development-password',12),'SUPER_ADMIN',1,0,at,at);
    initial.close();
    const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',DEV_ADMIN_PASSWORD_ENABLED:'true',ADMIN_PASSWORD:'12345',ADMIN_USERNAME:'admin',ADMIN_TOTP_SECRET:'',PORT:String(port),APP_ORIGIN:base,DATABASE_PATH:database},stdio:['ignore','pipe','pipe']});
    let dom;
    function client(){return {cookie:'',csrf:'',async request(route,method='GET',body){
        const response=await fetch(base+route,{method,headers:{Origin:base,...(this.cookie?{Cookie:this.cookie}:{}),...(this.csrf?{'X-CSRF-Token':this.csrf}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
        if(response.headers.getSetCookie().length)this.cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
        const data=response.status===204?null:await response.json();if(data?.csrfToken)this.csrf=data.csrfToken;
        return {status:response.status,data};
    }};}
    async function until(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Admin UI timed out');}
    try{
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),15000);child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exit '+code));});child.stdout.on('data',data=>{if(String(data).includes('Server is running')){clearTimeout(timer);resolve();}});});
        const inspect=openDatabase(database,path.join(root,'data.json'));
        try{const rows=inspect.db.prepare('SELECT * FROM admin_accounts').all();assert.equal(rows.length,1);assert.equal(rows[0].id,'bootstrap-admin');assert.match(rows[0].password_hash,/^\$2b\$12\$/);assert.ok(await bcrypt.compare('12345',rows[0].password_hash));assert.notEqual(rows[0].password_hash,'12345');}finally{inspect.close();}
        const admin=client(),user=client(),anonymous=client();
        assert.equal((await admin.request('/api/admin/login','POST',{username:'admin',password:'incorrect'})).status,401);
        const login=await admin.request('/api/admin/login','POST',{username:'admin',password:'12345'});assert.equal(login.status,200);assert.equal(login.data.role,'SUPER_ADMIN');
        assert.equal((await admin.request('/api/admin/stats')).status,200);
        assert.equal((await anonymous.request('/api/admin/stats')).status,401);
        const noCsrf=await fetch(base+'/api/admin/logout',{method:'POST',headers:{Origin:base,Cookie:admin.cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(noCsrf.status,403);
        const fields={name:'Regular Test User',email:'regular@example.invalid',phone:'09123456000',password:'Regular-user-password-2026'};
        assert.equal((await user.request('/api/auth/register','POST',fields)).status,201);
        assert.equal((await user.request('/api/admin/stats')).status,401);
        assert.equal((await user.request('/api/admin/login','POST',{username:fields.email,password:'12345'})).status,401);
        assert.equal((await user.request('/api/auth/login','POST',{email:fields.email,password:'12345'})).status,401);
        assert.equal((await admin.request('/api/admin/logout','POST',{})).status,204);
        assert.equal((await admin.request('/api/admin/session')).status,401);
        const html=await (await fetch(base+'/admin.html')).text(),browser=client(),errors=[];
        dom=new JSDOM(html,{url:base+'/admin.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
        const w=dom.window;w.Headers=Headers;w.structuredClone=structuredClone;w.Element.prototype.scrollIntoView=function(){};
        w.fetch=async(input,options={})=>{const headers=new Headers(options.headers);headers.set('Origin',base);if(browser.cookie)headers.set('Cookie',browser.cookie);const response=await fetch(new URL(input,base),{...options,headers});if(response.headers.getSetCookie().length)browser.cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');return response;};
        w.addEventListener('error',event=>errors.push(event.message));
        for(const tag of w.document.querySelectorAll('script[src]')){const src=tag.getAttribute('src');if(!src.startsWith('https:'))vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),dom.getInternalVMContext(),{filename:src});}
        await until(()=>vm.runInContext('setupAdminPanel.bound',dom.getInternalVMContext()));
        assert.equal(w.document.getElementById('adminLoginView').hidden,false);
        w.document.getElementById('adminUsername').value='admin';w.document.getElementById('adminPassword').value='12345';
        const form=w.document.getElementById('adminLoginForm');assert.equal(form.checkValidity(),true);
        form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
        await until(()=>!w.document.getElementById('adminDashboard').hidden);
        assert.ok(w.Web2Admin.principal.role==='SUPER_ADMIN');
        assert.ok(![...Array(w.localStorage.length)].some((_,i)=>w.localStorage.getItem(w.localStorage.key(i)).includes('12345')));
        w.document.getElementById('adminLogout').click();
        await until(()=>w.document.getElementById('adminDashboard').hidden);
        assert.equal((await fetch(base+'/api/admin/session',{headers:{Cookie:browser.cookie}})).status,401);
        assert.deepEqual(errors,[]);
    }finally{dom?.window.close();if(child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill();await ended;}fs.rmSync(temp,{recursive:true,force:true});}
});
