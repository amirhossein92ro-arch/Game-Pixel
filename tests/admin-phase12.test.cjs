'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{spawn}=require('node:child_process'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
test('phase 12 permissions, bounded audit and session revocation',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-admin-phase12-')),port=31000+Math.floor(Math.random()*1000),base='http://localhost:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DATABASE_PATH:path.join(temp,'test.sqlite'),ADMIN_PASSWORD:'Phase12-super-password-2026!',APP_ORIGIN:base,NODE_ENV:'test',PAYMENT_MODE:'test',AUTH_CAPTCHA_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 function client(){return {cookie:'',csrf:'',async call(url,method='GET',body,token=this.csrf){const response=await fetch(base+url,{method,headers:{Origin:base,...(this.cookie?{Cookie:this.cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-CSRF-Token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.getSetCookie().length)this.cookie=response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');const data=response.status===204?null:await response.json();if(data?.csrfToken)this.csrf=data.csrfToken;return {status:response.status,data};}};}
 const chief=client(),admin=client(),other=client(),user=client();
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),20000);child.once('exit',code=>{clearTimeout(timer);reject(Error('server exit '+code));});child.stdout.on('data',data=>{if(String(data).includes('Server is running')){clearTimeout(timer);resolve();}});});
  assert.equal((await chief.call('/api/admin/login','POST',{username:'admin',password:'Phase12-super-password-2026!'})).status,200);
  assert.equal((await chief.call('/api/admin/admins','POST',{username:'bad_email',email:'invalid',password:'Phase12-admin-password-2026!',role:'ADMIN'})).status,400);
  const created=(await chief.call('/api/admin/admins','POST',{username:'phase12_admin',email:'phase12-admin@example.invalid',password:'Phase12-admin-password-2026!',role:'ADMIN'})).data;
  assert.equal(created.email,'phase12-admin@example.invalid');
  assert.equal((await chief.call('/api/admin/admins','POST',{username:'duplicate_email',email:'phase12-admin@example.invalid',password:'Phase12-admin-password-2026!',role:'ADMIN'})).status,409);
  const adminList=(await chief.call('/api/admin/admins?page=1&pageSize=1&sort=name')).data;
  assert.equal(adminList.items.length,1);assert.equal(adminList.pages,2);
  assert.equal((await chief.call('/api/admin/admins?q=phase12&role=ADMIN&status=active')).data.total,1);
  assert.equal((await chief.call('/api/admin/admins?sort=invalid')).status,400);
  assert.equal((await admin.call('/api/admin/login','POST',{username:'phase12_admin',password:'Phase12-admin-password-2026!'})).status,200);
  assert.equal((await other.call('/api/admin/login','POST',{username:'phase12_admin',password:'Phase12-admin-password-2026!'})).status,200);
  assert.equal((await user.call('/api/auth/register','POST',{name:'Phase Tester',email:'phase12@example.invalid',phone:'09124445566',password:'Phase12-user-password-2026!'})).status,201);
  assert.equal((await user.call('/api/admin/audit')).status,403);
  assert.equal((await admin.call('/api/admin/audit')).status,200);
  assert.equal((await admin.call('/api/admin/sessions')).status,403);
  assert.equal((await admin.call('/api/admin/admins/'+created.id,'PUT',{role:'SUPER_ADMIN',confirm:true,adminConfirm:true})).status,403);
  assert.equal((await admin.call('/api/admin/users/'+created.id+'/role','PATCH',{role:'SUPER_ADMIN',confirm:true,adminConfirm:true})).status,403);
  assert.equal((await chief.call('/api/admin/admins/bootstrap-admin','PUT',{active:false,confirm:true,adminConfirm:true})).status,409);
  assert.equal((await chief.call('/api/admin/users/'+created.id+'/role','PATCH',{role:'SUPER_ADMIN',confirm:true,adminConfirm:true},'invalid')).status,403);
  const product=(await chief.call('/api/admin/products','POST',{name:'Phase12 Product',price:100000,stock:3,category:'Phase12'})).data;
  const secondProduct=(await chief.call('/api/admin/products','POST',{name:'Phase12 Other',price:200000,stock:7,category:'Phase12'})).data;
  assert.equal((await chief.call('/api/admin/products/'+product.id,'DELETE',{})).status,400);
  assert.equal((await chief.call('/api/admin/products?stock=low&page=1&pageSize=1')).data.items.length,1);
  assert.equal((await chief.call('/api/admin/products?q=Phase12&status=active&page=1&pageSize=1')).data.total,2);
  assert.equal((await chief.call('/api/admin/products?category=Phase12&sort=stock_asc&pageSize=1')).data.items[0].id,product.id);
  assert.equal((await chief.call('/api/admin/products?sort=invalid')).status,400);
  assert.equal((await chief.call('/api/admin/orders?page=0')).status,400);
  assert.equal((await chief.call('/api/admin/orders?sort=invalid')).status,400);
  const logs=(await chief.call('/api/admin/audit?action=PRODUCT_CREATED&q='+product.id+'&page=1&pageSize=1')).data;
  assert.equal(logs.total,1);assert.equal(logs.items.length,1);assert.equal(logs.items[0].targetId,String(product.id));
  assert.ok(logs.items[0].details.ip);
  assert.equal((await chief.call('/api/admin/audit?adminId=missing')).data.total,0);
  assert.equal((await chief.call('/api/admin/audit?from=2026-99-99')).status,400);
  assert.ok(!JSON.stringify((await chief.call('/api/admin/audit')).data).includes('Phase12-super-password'));
  assert.equal((await user.call('/api/admin/products/bulk','POST',{ids:[String(product.id)],action:'delete',confirm:true,confirmationPhrase:'DELETE'})).status,403);
  assert.equal((await chief.call('/api/admin/products/bulk','POST',{ids:[String(product.id)],action:'delete',confirm:true})).status,400);
  assert.equal((await chief.call('/api/admin/products/bulk','POST',{ids:[String(product.id)],action:'delete',confirm:true,confirmationPhrase:'DELETE'})).status,200);
  assert.equal((await chief.call('/api/admin/audit?action=PRODUCT_BULK_DELETE')).data.total,1);
  const sessions=(await chief.call('/api/admin/sessions?adminId='+created.id)).data;
  assert.equal(sessions.total,2);assert.ok(sessions.items.every(s=>/^[0-9a-f-]{36}$/i.test(s.id)&&!JSON.stringify(s).includes('hash')));
  assert.equal((await chief.call('/api/admin/sessions/'+sessions.items[0].id,'DELETE',{confirm:true})).status,204);
  const statuses=[(await admin.call('/api/admin/session')).status,(await other.call('/api/admin/session')).status];assert.deepEqual(statuses.sort(),[200,401]);
  assert.equal((await chief.call('/api/admin/users/'+created.id,'PATCH',{email:'updated-phase12-admin@example.invalid'})).status,200);
  assert.equal((await chief.call('/api/admin/users/'+created.id)).data.email,'updated-phase12-admin@example.invalid');
  assert.equal((await chief.call('/api/admin/admins?q=phase12_admin')).data.items[0].email,'updated-phase12-admin@example.invalid');
 }finally{if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}fs.rmSync(temp,{recursive:true,force:true});}
});
test('typed destructive confirmation is a focused, keyboard-accessible dialog',async()=>{
 const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
 try{
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  vm.runInContext(fs.readFileSync(path.join(root,'js/admin-console.js'),'utf8'),dom.getInternalVMContext());
  let result=w.Web2Admin.confirmPhrase('حذف حساب قابل بازگشت نیست.','DELETE');
  let dialog=w.document.querySelector('dialog');assert.ok(dialog);assert.match(dialog.textContent,/DELETE/);
  let input=dialog.querySelector('input'),submit=dialog.querySelector('[type="submit"]');assert.equal(w.document.activeElement,input);assert.equal(submit.disabled,true);
  input.value='delete';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(submit.disabled,true);
  dialog.querySelector('[type="button"]').click();assert.equal(await result,false);
  result=w.Web2Admin.confirmPhrase('حذف محصول','DELETE');dialog=w.document.querySelector('dialog');input=dialog.querySelector('input');submit=dialog.querySelector('[type="submit"]');
  input.value='DELETE';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(submit.disabled,false);dialog.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(await result,true);
 }finally{dom.window.close();}
});
