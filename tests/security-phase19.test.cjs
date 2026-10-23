'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {launch}=require('./helpers/security-server.cjs');
const {totp}=require('../lib/admin-security.cjs');

test('recent administrator authentication covers legacy role/status updates and account deletion',async t=>{
    const env=await launch(t),admin=env.client(),buyer=env.client();await env.admin(admin);const user=await env.register(buyer);
    const db=env.openDatabase();
    const original=db.prepare("SELECT created_at FROM session_details JOIN sessions ON hash=session_hash WHERE kind='admin'").get().created_at;
    db.prepare("UPDATE session_details SET created_at=? WHERE session_hash IN (SELECT hash FROM sessions WHERE kind='admin')").run(new Date(Date.now()-16*60000).toISOString());
    for(const [method,suffix,body]of [
        ['PATCH','/role',{role:'ADMIN',confirm:true}],['PUT','',{role:'ADMIN',confirm:true}],
        ['PUT','',{banned:true,confirm:true}],['DELETE','',{confirm:true,confirmationPhrase:'DELETE'}]
    ]) {
        const result=await admin.call('/api/admin/users/'+user.id+suffix,method,body);assert.equal(result.status,403,method+' '+suffix);
        assert.equal(db.prepare('SELECT count(*) n FROM accounts WHERE id=?').get(user.id).n,1);
        assert.equal(db.prepare('SELECT count(*) n FROM admin_accounts WHERE id=?').get(user.id).n,0);
    }
    db.prepare("UPDATE session_details SET created_at=? WHERE session_hash IN (SELECT hash FROM sessions WHERE kind='admin')").run(original);
    assert.equal((await admin.call('/api/admin/users/'+user.id,'PUT',{banned:true,confirm:true})).status,200);
});

for(const action of ['setup','disable','recovery-codes'])test('revoked sessions cannot finish an in-flight 2FA '+action,async t=>{
    const env=await launch(t),client=env.client(),user=await env.register(client);
    let code,setup;
    if(action!=='setup') {
        setup=await client.call('/api/users/me/2fa/setup','POST',{currentPassword:user.password});assert.equal(setup.status,200);
        const confirmed=await client.call('/api/users/me/2fa/confirm','POST',{code:totp(setup.data.secret)});assert.equal(confirmed.status,200);code=confirmed.data.recoveryCodes[0];
    }
    const db=env.openDatabase();
    const before=db.prepare('SELECT * FROM account_factors WHERE user_id=?').get(user.id);
    const gate=await env.gate(),pending=client.call('/api/users/me/2fa/'+action,'POST',{currentPassword:user.password,...(code?{code}:{})});
    try {
        await gate.paused;assert.equal((await client.call('/api/auth/logout','POST',{})).status,204);
    } finally {await gate.release();}
    const result=await pending;assert.equal(result.status,401);
    assert.deepEqual(db.prepare('SELECT * FROM account_factors WHERE user_id=?').get(user.id),before);
    assert.equal(result.data.secret,undefined);assert.equal(result.data.recoveryCodes,undefined);
});

test('password changes during 2FA recovery-code verification cannot commit against the old password',async t=>{
    const env=await launch(t),client=env.client(),user=await env.register(client);
    const setup=await client.call('/api/users/me/2fa/setup','POST',{currentPassword:user.password});
    const confirmed=await client.call('/api/users/me/2fa/confirm','POST',{code:totp(setup.data.secret)});assert.equal(confirmed.status,200);
    const db=env.openDatabase();const before=db.prepare('SELECT * FROM account_factors WHERE user_id=?').get(user.id);
    const gate=await env.gate(),pending=client.call('/api/users/me/2fa/recovery-codes','POST',{currentPassword:user.password,code:confirmed.data.recoveryCodes[0]});
    try {await gate.paused;db.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run('$2b$12$'+crypto.randomBytes(40).toString('base64').replaceAll('+','.').slice(0,53),user.id);}finally{await gate.release();}
    assert.equal((await pending).status,409);assert.deepEqual(db.prepare('SELECT * FROM account_factors WHERE user_id=?').get(user.id),before);
});

test('recent-login expiry during administrator password hashing prevents committing sensitive changes',async t=>{
    const env=await launch(t),admin=env.client(),buyer=env.client();await env.admin(admin);const user=await env.register(buyer);
    const db=env.openDatabase(),original=db.prepare("SELECT created_at FROM session_details JOIN sessions ON hash=session_hash WHERE kind='admin'").get().created_at;
    const passwordBefore=db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(user.id).password_hash;
    for(const [url,body]of [
        ['/api/admin/admins',{username:'late-created-admin',password:'A new administrator phrase 2026!',role:'ADMIN'}],
        ['/api/admin/users/'+user.id+'/reset-password',{password:'A new customer password 2026!',confirm:true}]
    ]) {
        const gate=await env.gate('hash'),pending=admin.call(url,'POST',body);
        try {await gate.paused;db.prepare("UPDATE session_details SET created_at=? WHERE session_hash IN (SELECT hash FROM sessions WHERE kind='admin')").run(new Date(Date.now()-16*60000).toISOString());}finally{await gate.release();}
        assert.equal((await pending).status,403);
        assert.equal(db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(user.id).password_hash,passwordBefore);
        assert.equal(db.prepare('SELECT count(*) n FROM admin_accounts').get().n,1);
        db.prepare("UPDATE session_details SET created_at=? WHERE session_hash IN (SELECT hash FROM sessions WHERE kind='admin')").run(original);
    }
});
