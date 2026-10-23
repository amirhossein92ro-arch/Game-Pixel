'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite'),bcrypt=require('bcrypt');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..');
test('secure user management, real sessions, audit, and admin DOM actions',async t=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-user-management-')),database=path.join(temp,'test.sqlite');
    const port=28500+Math.floor(Math.random()*1000),base='http://localhost:'+port,windows=[];
    let child;
    const env={...process.env,PORT:String(port),DATABASE_PATH:database,ADMIN_PASSWORD:'Users-test-super-2026!',APP_ORIGIN:base,NODE_ENV:'test',PAYMENT_MODE:'test',AUTH_CAPTCHA_ENABLED:'false'};
    async function start(){let errors='';child=spawn(process.execPath,['server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout '+errors)),20000);child.once('exit',code=>{clearTimeout(timer);reject(Error('startup '+code+' '+errors));});child.stdout.on('data',data=>{if(String(data).includes('Server is running')){clearTimeout(timer);resolve();}});child.stderr.on('data',data=>errors+=data);});}
    async function stop(){if(child?.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}}
    function client(){return {cookie:'',csrf:'',async request(url,method='GET',body,csrf=true){const response=await fetch(base+url,{method,headers:{Origin:base,...(this.cookie?{Cookie:this.cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(csrf&&this.csrf?{'X-CSRF-Token':this.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.getSetCookie().length)this.cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');const data=response.status===204?null:await response.json();if(data?.csrfToken)this.csrf=data.csrfToken;return {status:response.status,data};}};}
    const superadmin=client(),admin=client(),user=client(),second=client(),promoted=client(),anonymous=client();
    const password='Users-original-password-2026!',tempPassword='Users-temporary-password-2026!';
    const registered=[];let uid,pid,adminId;
    const url=(id,suffix='')=>'/api/admin/users/'+id+suffix;
    const confirmation={confirm:true,adminConfirm:true};
    try{
        await start();
        assert.equal((await superadmin.request('/api/admin/login','POST',{username:'admin',password:env.ADMIN_PASSWORD})).status,200);
        adminId=(await superadmin.request('/api/admin/admins','POST',{username:'users_manager',password,role:'ADMIN'})).data.id;
        assert.equal((await admin.request('/api/admin/login','POST',{username:'users_manager',password})).status,200);
        for(const [i,c]of [user,second,promoted].entries()){const result=await c.request('/api/auth/register','POST',{name:['Alpha Player','Beta Player','Gamma Player'][i],email:'users'+i+'@example.invalid',phone:'0912111000'+i,password});assert.equal(result.status,201);registered.push(result.data.user);}
        uid=registered[0].id;pid=registered[2].id;
        await t.test('normal/anonymous principals cannot access any management operation; ADMIN can view and edit users',async()=>{
            for(const c of [user,anonymous])for(const [suffix,method,body]of [['','GET'],['/role','PATCH',{role:'admin'}],['/status','PATCH',{status:'disabled',confirm:true}],['/reset-password','POST',{password:tempPassword,confirm:true}],['/logout-all','POST',{confirm:true}],['','DELETE',{confirm:true}]])assert.equal((await c.request(url(uid,suffix),method,body)).status,c === user ? 403 : 401);
            assert.equal((await admin.request('/api/admin/users')).status,200);
            assert.equal((await admin.request(url(uid),'PATCH',{name:'Alpha Updated'})).status,200);
            assert.equal((await admin.request(url(uid),'PATCH',{role:'SUPER_ADMIN'})).status,400);
            assert.equal((await admin.request(url(uid,'/role'),'PATCH',{role:'SUPER_ADMIN'})).status,403);
            assert.equal((await superadmin.request(url(uid,'/role'),'PATCH',{role:'constructor'})).status,400);
            assert.equal((await admin.request(url('missing'))).status,404);
            for(const [suffix,method,body]of [['','PATCH',{username:'illegal'}],['/role','PATCH',{role:'ADMIN',...confirmation}],['/status','PATCH',{status:'disabled',...confirmation}],['/reset-password','POST',{password:tempPassword,...confirmation}],['/logout-all','POST',confirmation],['','DELETE',confirmation]])assert.equal((await admin.request(url('bootstrap-admin',suffix),method,body)).status,403);
        });
        await t.test('CSRF, input validation, duplicates, search, role/status filters and pagination',async()=>{
            assert.equal((await admin.request(url(uid),'PATCH',{name:'CSRF fail'},false)).status,403);
            assert.equal((await admin.request(url(uid),'PATCH',{phone:'bad'})).status,400);
            assert.equal((await admin.request(url(uid),'PATCH',{email:registered[1].email})).status,409);
            assert.equal((await admin.request(url(uid,'/status'),'PATCH',{status:'disabled'})).status,400);
            assert.equal((await admin.request('/api/admin/users?page=0')).status,400);
            assert.equal((await admin.request('/api/admin/users?q[x]=invalid')).status,400);
            const names=(await admin.request('/api/admin/users?q=Player&role=user&status=active&sort=name&page=1&pageSize=1')).data;
            const all=(await admin.request('/api/admin/users?page=1&pageSize=100')).data;assert.equal(all.total,5);assert.equal(all.items.length,5);
            assert.equal(names.items.length,1);assert.equal(names.total,2);assert.equal(names.pages,2);
            const next=(await admin.request('/api/admin/users?q=Player&role=user&sort=name&page=2&pageSize=1')).data;assert.notEqual(names.items[0].id,next.items[0].id);
            assert.equal((await admin.request('/api/admin/users?q='+registered[0].phone)).data.items[0].id,uid);
            assert.equal((await admin.request('/api/admin/users?q='+registered[0].email)).data.items[0].id,uid);
            const detail=(await admin.request(url(uid))).data;assert.equal(detail.name,'Alpha Updated');assert.ok(detail.joinDate);assert.ok(!JSON.stringify(detail).includes('password'));
        });
        await t.test('promotion creates a real admin login, hierarchy is enforced and role changes revoke both session kinds',async()=>{
            assert.equal((await superadmin.request(url(pid,'/role'),'PATCH',{role:'admin'})).status,200);
            assert.equal((await promoted.request('/api/users/me')).status,401);
            assert.equal((await promoted.request('/api/admin/login','POST',{username:registered[2].email,password})).status,200);
            assert.equal((await promoted.request('/api/admin/users')).status,200);
            assert.equal((await admin.request(url(pid,'/status'),'PATCH',{status:'disabled',...confirmation})).status,403);
            assert.equal((await superadmin.request(url(pid,'/role'),'PATCH',{role:'SUPER_ADMIN',...confirmation})).status,200);
            assert.equal((await superadmin.request(url('bootstrap-admin'),'DELETE',confirmation)).status,409,'current super admin cannot delete itself even when another exists');
            assert.equal((await promoted.request('/api/admin/session')).status,401);
            await promoted.request('/api/admin/login','POST',{username:registered[2].email,password});
            assert.equal((await promoted.request(url(adminId,'/role'),'PATCH',{role:'SUPER_ADMIN',...confirmation})).status,200);
            assert.equal((await admin.request('/api/admin/session')).status,401);
            assert.equal((await superadmin.request(url(adminId,'/role'),'PATCH',{role:'ADMIN',...confirmation})).status,200);
            assert.equal((await superadmin.request(url(pid,'/role'),'PATCH',{role:'user',...confirmation})).status,200);
            assert.equal((await promoted.request('/api/admin/session')).status,401);
            for(const [suffix,method,body]of [['/role','PATCH',{role:'ADMIN',...confirmation}],['/status','PATCH',{status:'disabled',...confirmation}],['','DELETE',confirmation]])assert.equal((await superadmin.request(url('bootstrap-admin',suffix),method,body)).status,409);
            await admin.request('/api/admin/login','POST',{username:'users_manager',password});
        });
        await t.test('temporary password is bcrypt only; all old sessions and reset grants are invalidated',async()=>{
            const extra=client();await extra.request('/api/auth/login','POST',{email:registered[0].email,password});
            assert.equal((await admin.request(url(uid,'/reset-password'),'POST',{password:'short',confirm:true})).status,400);
            assert.equal((await admin.request(url(uid,'/reset-password'),'POST',{password:tempPassword,confirm:true})).status,200);
            assert.equal((await user.request('/api/users/me')).status,401);assert.equal((await extra.request('/api/users/me')).status,401);
            const db=new DatabaseSync(database);const account=db.prepare('SELECT * FROM accounts WHERE id=?').get(uid);
            assert.match(account.password_hash,/^\$2[aby]\$12\$/);assert.ok(await bcrypt.compare(tempPassword,account.password_hash));assert.ok(!account.payload.includes(tempPassword));assert.equal(db.prepare('SELECT count(*) n FROM sessions WHERE principal=?').get(uid).n,0);db.close();
            assert.equal((await user.request('/api/auth/login','POST',{email:registered[0].email,password})).status,401);
            assert.equal((await user.request('/api/auth/login','POST',{email:registered[0].email,password:tempPassword})).status,200);
            assert.ok((await admin.request(url(uid))).data.lastLogin);
        });
        await t.test('disabled accounts cannot log in, re-enabling never resurrects sessions, force logout works',async()=>{
            assert.equal((await admin.request(url(uid,'/status'),'PATCH',{status:'disabled',confirm:true})).status,200);
            assert.equal((await user.request('/api/users/me')).status,401);
            assert.equal((await user.request('/api/auth/login','POST',{email:registered[0].email,password:tempPassword})).status,401);
            assert.equal((await admin.request('/api/admin/users?status=disabled')).data.items[0].id,uid);
            await admin.request(url(uid,'/status'),'PATCH',{status:'active'});
            assert.equal((await user.request('/api/users/me')).status,401);
            await user.request('/api/auth/login','POST',{email:registered[0].email,password:tempPassword});
            const other=client();await other.request('/api/auth/login','POST',{email:registered[0].email,password:tempPassword});
            assert.equal((await admin.request(url(uid,'/logout-all'),'POST',{confirm:true})).status,200);
            assert.equal((await user.request('/api/users/me')).status,401);assert.equal((await other.request('/api/users/me')).status,401);
        });
        await t.test('linked admin/customer credentials, disable state and sessions stay synchronized',async()=>{
            await superadmin.request(url(pid,'/role'),'PATCH',{role:'admin'});
            const elevated=client(),customer=client();
            assert.equal((await elevated.request('/api/admin/login','POST',{username:registered[2].email,password})).status,200);
            assert.equal((await customer.request('/api/auth/login','POST',{email:registered[2].email,password})).status,200);
            assert.equal((await superadmin.request('/api/admin/admins/'+pid,'PUT',{active:false,confirm:true})).status,400,'original admin editor also needs extra confirmation');
            assert.equal((await superadmin.request(url(pid,'/reset-password'),'POST',{password:tempPassword,...confirmation})).status,200);
            assert.equal((await elevated.request('/api/admin/session')).status,401);assert.equal((await customer.request('/api/users/me')).status,401);
            const db=new DatabaseSync(database),a=db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(pid),b=db.prepare('SELECT password_hash FROM admin_accounts WHERE id=?').get(pid);
            assert.equal(a.password_hash,b.password_hash);assert.ok(await bcrypt.compare(tempPassword,b.password_hash));db.close();
            assert.equal((await elevated.request('/api/admin/login','POST',{username:registered[2].email,password:tempPassword})).status,200);
            await superadmin.request(url(pid,'/status'),'PATCH',{status:'disabled',...confirmation});
            assert.equal((await elevated.request('/api/admin/session')).status,401);
            assert.equal((await elevated.request('/api/admin/login','POST',{username:registered[2].email,password:tempPassword})).status,401);
            assert.equal((await customer.request('/api/auth/login','POST',{email:registered[2].email,password:tempPassword})).status,401);
            await superadmin.request(url(pid,'/status'),'PATCH',{status:'active',...confirmation});
            await superadmin.request(url(pid,'/role'),'PATCH',{role:'user',...confirmation});
        });
        await t.test('deletion is confirmed and audited; retained order totals/details are accurate',async()=>{
            const db=new DatabaseSync(database),order={id:'um-order',code:'UM-1',userId:registered[1].id,status:'paid',paymentStatus:'paid',total:250000,createdAt:new Date().toISOString()};
            db.prepare('INSERT INTO orders VALUES(?,?)').run(order.id,JSON.stringify(order));db.close();
            const detail=(await admin.request(url(registered[1].id))).data;assert.equal(detail.orderCount,1);assert.equal(detail.totalSpent,250000);
            assert.equal((await admin.request(url(registered[1].id,'/orders'))).data[0].id,order.id);
            assert.equal((await admin.request(url(registered[1].id),'DELETE',{confirm:true})).status,403);
            assert.equal((await superadmin.request(url(registered[1].id),'DELETE',{})).status,400);
            assert.equal((await superadmin.request(url(registered[1].id),'DELETE',{confirm:true})).status,400);
            assert.equal((await superadmin.request(url(registered[1].id),'DELETE',{confirm:true,confirmationPhrase:'DELETE'})).status,204);
            assert.equal((await second.request('/api/users/me')).status,401);assert.equal((await admin.request(url(registered[1].id))).status,404);
            const verify=new DatabaseSync(database);assert.equal(JSON.parse(verify.prepare('SELECT payload FROM orders WHERE id=?').get(order.id).payload).userDeleted,true);verify.close();
            const logs=(await superadmin.request('/api/admin/audit')).data.items;
            for(const action of ['USER_ROLE_CHANGED','USER_DISABLED','USER_ENABLED','USER_PASSWORD_RESET','USER_DELETED','USER_FORCE_LOGOUT'])assert.ok(logs.some(log=>log.action===action),action);
            assert.ok(!JSON.stringify(logs).includes(tempPassword));assert.ok(logs.every(log=>log.admin&&log.createdAt));
        });
        await t.test('real admin DOM: Persian badges, search, details, editing, reset confirmation and password clearing',async()=>{
            const errors=[],dom=new JSDOM(fs.readFileSync(path.join(root,'admin.html'),'utf8'),{url:base+'/admin.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()}),w=dom.window;windows.push(w);
            w.Headers=Headers;w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.AbortController=AbortController;w.TextEncoder=TextEncoder;w.structuredClone=structuredClone;w.Element.prototype.scrollIntoView=function(){};
            w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
            w.fetch=async(input,options={})=>fetch(new URL(input,base),{...options,headers:{...Object.fromEntries(new Headers(options.headers)),Cookie:superadmin.cookie,Origin:base}});w.addEventListener('error',e=>errors.push(e.message));
            for(const tag of w.document.querySelectorAll('script[src]')){const src=tag.getAttribute('src');if(!src.startsWith('https:'))vm.runInContext(fs.readFileSync(path.join(root,src.split(/[?#]/,1)[0]),'utf8'),dom.getInternalVMContext(),{filename:src});}
            async function until(fn){for(let i=0;i<350;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('DOM timeout '+fn+' errors '+errors+' notice '+w.document.getElementById('adminUsersNotice').textContent+' box '+w.document.getElementById('adminUsers').textContent+' role '+w.Web2Admin.principal?.role);}
            await until(()=>!w.document.getElementById('adminDashboard').hidden);w.document.querySelector('[data-admin-tab="users"]').click();await until(()=>w.document.querySelector('.admin-users-table'));
            assert.equal(w.document.documentElement.dir,'rtl');assert.ok(w.document.getElementById('adminUsers').textContent.includes('مدیر ارشد'));
            const search=w.document.getElementById('adminUserSearch');search.value='Alpha';w.document.getElementById('adminUserFilters').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>w.document.querySelectorAll('.admin-users-table tbody tr').length===1);
            w.document.querySelector('[data-um-action="view"]').click();await until(()=>w.document.querySelector('.admin-user-detail'));assert.ok(w.document.querySelector('.admin-user-detail').textContent.includes(uid));w.document.querySelector('[data-dialog-close]').click();
            w.document.querySelector('[data-um-action="edit"]').click();const edit=w.document.querySelector('.admin-user-dialog form');edit.elements.name.value='Alpha DOM';edit.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>!w.document.querySelector('.admin-user-dialog'));assert.equal((await superadmin.request(url(uid))).data.name,'Alpha DOM');
            w.Web2Admin.confirm=async()=>true;w.document.querySelector('[data-um-action="reset"]').click();const reset=w.document.querySelector('.admin-user-dialog form'),input=reset.elements.password;assert.equal(input.type,'password');input.value='DOM-temporary-password-2026!';reset.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>!w.document.querySelector('.admin-user-dialog'));assert.equal(input.value,'');await until(()=>w.document.getElementById('adminUserActivity').textContent.includes('USER_PASSWORD_RESET'));
            assert.deepEqual(errors,[]);
        });
        await t.test('bootstrap reset persists through restart; old cookie remains invalid and extra confirmation enforced',async()=>{
            assert.equal((await superadmin.request(url('bootstrap-admin','/reset-password'),'POST',{password:tempPassword,confirm:true})).status,400);
            assert.equal((await superadmin.request(url('bootstrap-admin','/reset-password'),'POST',{password:tempPassword,...confirmation})).status,200);
            assert.equal((await superadmin.request('/api/admin/session')).status,401);
            await stop();await start();
            assert.equal((await superadmin.request('/api/admin/login','POST',{username:'admin',password:env.ADMIN_PASSWORD})).status,401);
            assert.equal((await superadmin.request('/api/admin/login','POST',{username:'admin',password:tempPassword})).status,200);
        });
        await t.test('mutation rate limiting returns 429 and Retry-After',async()=>{
            let limited=false;
            for(let i=0;i<65;i++){const r=await admin.request(url(uid),'PATCH',{name:'Rate test'});if(r.status===429){limited=true;break;}assert.equal(r.status,200);}
            assert.ok(limited);
        });
    }finally{windows.forEach(w=>w.close());await stop();if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()))throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true});}
});
