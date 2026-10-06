'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..');

test('five-hour sessions, CAPTCHA and one-use password recovery',async()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-recovery-'));
    const database=path.join(temp,'test.sqlite'),port=25000+Math.floor(Math.random()*1000),base=`http://localhost:${port}`;
    const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),APP_ORIGIN:base,DATABASE_PATH:database,NODE_ENV:'test',CAPTCHA_TEST_MODE:'true',SMS_PROVIDER:'',ADMIN_PASSWORD:'recovery-test-admin-2026'},stdio:['ignore','pipe','pipe']});
    let cookie='',csrf='',inspect;
    async function request(url,body,captcha='test-valid-captcha'){
        const response=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:body===undefined?undefined:JSON.stringify({...body,captchaToken:captcha})});
        const set=response.headers.getSetCookie();if(set.length)cookie=set.map(v=>v.split(';')[0]).join('; ');
        const data=response.status===204?null:await response.json();if(data?.csrfToken)csrf=data.csrfToken;
        return {response,data,set};
    }
    try{
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),15000);server.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code));});server.stdout.on('data',chunk=>{if(String(chunk).includes('Server is running')){clearTimeout(timer);resolve();}});});
        const user={name:'کاربر بازیابی',phone:'09121112233',email:'recovery@example.invalid',password:'old-recovery-password-2026'};
        assert.equal((await request('/api/auth/register',user,'invalid')).response.status,400);
        const registered=await request('/api/auth/register',user);assert.equal(registered.response.status,201);
        const cookieHeader=registered.set.join(';');assert.match(cookieHeader,/HttpOnly/i);assert.match(cookieHeader,/SameSite=Strict/i);assert.match(cookieHeader,/Max-Age=18000/i);
        inspect=new DatabaseSync(database);const account=inspect.prepare('SELECT id,password_hash FROM accounts WHERE email=?').get(user.email);
        assert.match(account.password_hash,/^\$2b\$12\$/);assert.notEqual(account.password_hash,user.password);
        const session=inspect.prepare("SELECT expires FROM sessions WHERE principal=? AND kind='user'").get(account.id);
        assert.ok(session.expires-Date.now()<=5*3600000&&session.expires-Date.now()>5*3600000-30000);
        inspect.prepare("UPDATE sessions SET expires=? WHERE principal=? AND kind='user'").run(Date.now()-1,account.id);
        assert.equal((await request('/api/account/dashboard')).response.status,401);
        cookie='';csrf='';assert.equal((await request('/api/auth/login',{email:user.email,password:user.password},'invalid')).response.status,400);
        cookie='';csrf='';assert.equal((await request('/api/auth/login',{email:user.email,password:user.password})).response.status,200);
        assert.equal((await request('/api/auth/logout',{})).response.status,204);
        assert.equal(inspect.prepare("SELECT count(*) AS n FROM sessions WHERE principal=? AND kind='user'").get(account.id).n,0);
        cookie='';csrf='';assert.equal((await request('/api/auth/login',{email:user.email,password:'wrong'})).response.status,401);
        const oldSession=await request('/api/auth/login',{email:user.email,password:user.password});assert.equal(oldSession.response.status,200);const oldCookie=cookie;
        assert.equal((await request('/api/auth/forgot-password/request',{phone:user.phone},'invalid')).response.status,400);
        const expired=await request('/api/auth/forgot-password/request',{phone:user.phone});
        const unknownRequest=await request('/api/auth/forgot-password/request',{phone:'09129998877'});
        assert.equal(expired.response.status,200);assert.equal(unknownRequest.response.status,200);
        assert.deepEqual(Object.keys(unknownRequest.data).sort(),Object.keys(expired.data).sort(),'response shape does not reveal account existence');
        assert.equal(unknownRequest.data.message,expired.data.message);
        assert.equal((await request('/api/auth/forgot-password/request',{phone:user.phone})).response.status,429);
        inspect.prepare('DELETE FROM password_reset_challenges WHERE phone_hash=?').run(require('node:crypto').createHash('sha256').update(user.phone).digest('hex'));
        inspect.prepare('DELETE FROM password_reset_challenges WHERE phone_hash=?').run(require('node:crypto').createHash('sha256').update('09129998877').digest('hex'));
        assert.match(expired.data.mockOtp,/^\d{6}$/);
        inspect.prepare('UPDATE password_reset_challenges SET expires_at=?,created_at=? WHERE id=?').run(Date.now()-1,Date.now()-121000,expired.data.challengeId);
        assert.equal((await request('/api/auth/forgot-password/verify',{challengeId:expired.data.challengeId,otp:expired.data.mockOtp})).response.status,400);
        const sent=await request('/api/auth/forgot-password/request',{phone:user.phone});assert.equal(sent.response.status,200);assert.match(sent.data.mockOtp,/^\d{6}$/);
        assert.equal((await request('/api/auth/forgot-password/verify',{challengeId:sent.data.challengeId,otp:sent.data.mockOtp},'invalid')).response.status,400);
        assert.equal((await request('/api/auth/forgot-password/verify',{challengeId:sent.data.challengeId,otp:'000000'})).response.status,400);
        const verified=await request('/api/auth/forgot-password/verify',{challengeId:sent.data.challengeId,otp:sent.data.mockOtp});assert.equal(verified.response.status,200);
        assert.equal((await request('/api/auth/forgot-password/verify',{challengeId:sent.data.challengeId,otp:sent.data.mockOtp})).response.status,400,'OTP is consumed immediately after verification');
        const nextPassword='new-recovery-password-2026';
        assert.equal((await request('/api/auth/forgot-password/reset',{challengeId:sent.data.challengeId,resetToken:verified.data.resetToken,password:nextPassword,confirmPassword:nextPassword},'invalid')).response.status,400);
        assert.equal((await request('/api/auth/forgot-password/reset',{challengeId:sent.data.challengeId,resetToken:verified.data.resetToken,password:nextPassword,confirmPassword:nextPassword})).response.status,200);
        assert.equal((await request('/api/auth/forgot-password/reset',{challengeId:sent.data.challengeId,resetToken:verified.data.resetToken,password:nextPassword,confirmPassword:nextPassword})).response.status,400);
        cookie=oldCookie;csrf='';assert.equal((await request('/api/account/dashboard')).response.status,401);
        cookie='';assert.equal((await request('/api/auth/login',{email:user.email,password:user.password})).response.status,401);
        assert.equal((await request('/api/auth/login',{email:user.email,password:nextPassword})).response.status,200);
        assert.equal((await request('/api/auth/logout',{})).response.status,204);cookie='';csrf='';
        const parallelUser={name:'کاربر همزمان',phone:'09121112244',email:'parallel-recovery@example.invalid',password:'parallel-recovery-password-2026'};
        assert.equal((await request('/api/auth/register',parallelUser)).response.status,201);
        const parallel=await Promise.all([request('/api/auth/forgot-password/request',{phone:parallelUser.phone}),request('/api/auth/forgot-password/request',{phone:parallelUser.phone})]);
        assert.deepEqual(parallel.map(item=>item.response.status).sort(),[200,429],'parallel OTP requests produce only one challenge');
        cookie='';csrf='';
        for(let attempt=0;attempt<5;attempt++)assert.equal((await request('/api/auth/login',{email:user.email,password:'wrong-password'})).response.status,401);
        assert.equal((await request('/api/auth/login',{email:user.email,password:'wrong-password'})).response.status,429);
        inspect.close();inspect=null;
    }finally{
        if(inspect){inspect.close();inspect=null;}
        if(server.exitCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}
        if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()))throw Error('unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
    }
});
