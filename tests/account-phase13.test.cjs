'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {totp}=require('../lib/admin-security.cjs');

test('account 2FA, one-use recovery, CSRF and device revocation over HTTP',async()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'web2-phase13-'));
    const database=path.join(directory,'test.sqlite'),port=31000+crypto.randomInt(1000),base=`http://localhost:${port}`;
    const server=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),APP_ORIGIN:base,DATABASE_PATH:database,NODE_ENV:'test',ADMIN_PASSWORD:'phase13-admin-password-2026',ACCOUNT_TOTP_KEY:crypto.randomBytes(32).toString('hex')},stdio:['ignore','pipe','pipe']});
    const jar=()=>({cookies:new Map(),csrf:'',pending:'',async call(url,method='GET',body,token){
        const response=await fetch(base+url,{method,headers:{Origin:base,'User-Agent':this.userAgent||'Chrome/120.0',...(body===undefined?{}:{'Content-Type':'application/json'}),...(this.cookies.size?{Cookie:[...this.cookies].map(([k,v])=>k+'='+v).join('; ')}:{}),...((token??this.csrf)?{'X-CSRF-Token':token??this.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
        for(const value of response.headers.getSetCookie()){const [pair]=value.split(';'),i=pair.indexOf('=');this.cookies.set(pair.slice(0,i),pair.slice(i+1));}
        const data=response.status===204?null:await response.json();if(data?.csrfToken)this.csrf=data.csrfToken;if(data?.pendingCsrf)this.pending=data.pendingCsrf;return {status:response.status,data};
    }});
    const a=jar(),b=jar(),c=jar(),password='phase13-user-password-2026',email='phase13@example.invalid';b.userAgent='Firefox/121.0';
    let inspect;
    try{
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),15000);server.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code));});server.stdout.on('data',chunk=>{if(String(chunk).includes('Server is running')){clearTimeout(timer);resolve();}});});
        const registered=await a.call('/api/auth/register','POST',{name:'کاربر تست',email,phone:'09123334455',password});assert.equal(registered.status,201);
        assert.equal((await a.call('/api/users/me/2fa/setup','POST',{currentPassword:'wrong'})).status,403);
        const setup=await a.call('/api/users/me/2fa/setup','POST',{currentPassword:password});assert.equal(setup.status,200);assert.match(setup.data.secret,/^[A-Z2-7]{32}$/);
        assert.equal((await a.call('/api/users/me/security')).data.twoFactor.enabled,false);
        assert.equal((await a.call('/api/users/me/2fa/confirm','POST',{code:'000000'})).status,400);
        const confirm=await a.call('/api/users/me/2fa/confirm','POST',{code:totp(setup.data.secret)});assert.equal(confirm.status,200);assert.equal(confirm.data.recoveryCodes.length,8);
        const recovery=confirm.data.recoveryCodes[0];
        const security=(await a.call('/api/users/me/security')).data;assert.equal(security.twoFactor.enabled,true);assert.equal(JSON.stringify(security).includes(setup.data.secret),false);assert.equal(JSON.stringify(security).includes(recovery),false);
        inspect=new DatabaseSync(database);assert.equal(JSON.stringify(inspect.prepare('SELECT * FROM account_factors').all()).includes(setup.data.secret),false);assert.equal(JSON.stringify(inspect.prepare('SELECT * FROM account_factors').all()).includes(recovery),false);
        assert.equal((await a.call('/api/auth/logout','POST',{})).status,204);
        const pending=await a.call('/api/auth/login','POST',{email,password});assert.equal(pending.status,200);assert.equal(pending.data.twoFactorRequired,true);assert.equal(pending.data.user,undefined);
        assert.equal((await a.call('/api/auth/session')).data.user,null);assert.equal((await a.call('/api/users/me')).status,401);
        assert.equal((await a.call('/api/auth/2fa/verify','POST',{code:recovery},'wrong')).status,401);
        assert.equal((await a.call('/api/auth/2fa/verify','POST',{code:'000000'},a.pending)).status,400);
        const completed=await a.call('/api/auth/2fa/verify','POST',{code:recovery},a.pending);assert.equal(completed.status,200);assert.equal(completed.data.user.id,registered.data.user.id);
        assert.equal((await a.call('/api/auth/session')).data.user.id,registered.data.user.id);
        assert.equal((await b.call('/api/auth/login','POST',{email,password})).data.twoFactorRequired,true);
        assert.equal((await b.call('/api/auth/2fa/verify','POST',{code:recovery},b.pending)).status,400);
        const nextCode=confirm.data.recoveryCodes[1];assert.equal((await b.call('/api/auth/2fa/verify','POST',{code:nextCode},b.pending)).status,200);
        assert.ok((await a.call('/api/users/me/notifications')).data.items.some(n=>n.title==='ورود از مرورگر تازه'));
        const sessions=(await a.call('/api/users/me/sessions')).data;assert.equal(sessions.length,2);assert.ok(sessions.every(s=>s.id&&!s.hash&&!s.token));
        const other=sessions.find(s=>!s.current);assert.equal((await a.call('/api/users/me/sessions/'+other.id,'DELETE',{},'wrong')).status,403);
        assert.equal((await a.call('/api/users/me/sessions/'+other.id,'DELETE',{})).status,204);assert.equal((await b.call('/api/users/me')).status,401);
        assert.equal((await b.call('/api/auth/login','POST',{email,password})).data.twoFactorRequired,true);
        assert.equal((await b.call('/api/auth/2fa/verify','POST',{code:confirm.data.recoveryCodes[2]},b.pending)).status,200);
        assert.equal((await a.call('/api/users/me/sessions/logout-others','POST',{})).status,200);assert.equal((await a.call('/api/users/me')).status,200);
        assert.equal((await b.call('/api/users/me')).status,401);
        assert.equal((await c.call('/api/auth/login','POST',{email,password})).data.twoFactorRequired,true);
        for(let i=0;i<5;i++)assert.equal((await c.call('/api/auth/2fa/verify','POST',{code:'000000'},c.pending)).status,400);
        assert.equal((await c.call('/api/auth/2fa/verify','POST',{code:confirm.data.recoveryCodes[3]},c.pending)).status,401);
        assert.equal((await a.call('/api/users/me/2fa/recovery-codes','POST',{currentPassword:password,code:confirm.data.recoveryCodes[4]})).status,200);
        assert.equal((await a.call('/api/users/me/2fa/disable','POST',{currentPassword:password,code:confirm.data.recoveryCodes[2]})).status,400);
        const resetId=crypto.randomUUID(),oldCookie=a.cookies.get('web2_user'),newPassword='phase13-new-password-2026';
        inspect.prepare('INSERT INTO password_reset_challenges(id,user_id,phone_hash,otp_hash,expires_at,attempts,verified_token_hash,verified_expires_at,used_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(resetId,registered.data.user.id,crypto.createHash('sha256').update('09123334455').digest('hex'),'test-hash',Date.now()+600000,0,'test-token',Date.now()+600000,null,Date.now());
        assert.equal((await a.call('/api/users/me/password','PUT',{currentPassword:'wrong',newPassword,confirmPassword:newPassword})).status,403);
        assert.equal((await a.call('/api/users/me/password','PUT',{currentPassword:password,newPassword,confirmPassword:newPassword})).status,200);
        assert.notEqual(a.cookies.get('web2_user'),oldCookie,'password change rotates the session');
        const challenge=inspect.prepare('SELECT used_at FROM password_reset_challenges WHERE id=?').get(resetId);assert.ok(!challenge||challenge.used_at);
        assert.equal((await jar().call('/api/auth/login','POST',{email,password})).status,401);
        const events=inspect.prepare("SELECT action,details FROM audit_logs WHERE target_id=? ORDER BY id").all(registered.data.user.id);
        assert.ok(events.some(e=>e.action==='USER_2FA_ENABLED'));assert.ok(events.some(e=>e.action==='USER_RECOVERY_CODE_USED'));assert.ok(events.some(e=>e.action==='USER_SESSION_REVOKED'));assert.ok(events.some(e=>e.action==='USER_NEW_DEVICE_LOGIN'));
        assert.equal(JSON.stringify(events).includes(recovery),false);assert.equal(JSON.stringify(events).includes(setup.data.secret),false);
    }finally{inspect?.close();if(server.exitCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}fs.rmSync(directory,{recursive:true,force:true});}
});
