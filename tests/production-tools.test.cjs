'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {lockfile}=require('../scripts/release-check.cjs');
const {stage,verify,list}=require('../scripts/package-release.cjs');
const {smoke,target}=require('../scripts/production-smoke.cjs');
const {launch}=require('./helpers/security-server.cjs');
test('release lock validation rejects dependency and Node engine drift without changing the lockfile',t=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'web2-lock-check-'));
    t.after(()=>{assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true});});
    const pkg={name:'fixture',version:'1.0.0',dependencies:{express:'4.22.2'},engines:{node:'>=24.15.0 <25'}};
    const lock={name:pkg.name,version:pkg.version,lockfileVersion:3,packages:{'':structuredClone(pkg)}};
    fs.writeFileSync(path.join(directory,'package-lock.json'),JSON.stringify(lock));
    const check=changes=>{fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({...pkg,...changes}));return lockfile(directory);};
    assert.equal(check({}),true);assert.equal(check({dependencies:{express:'4.0.0'}}),false);assert.equal(check({engines:{node:'>=22'}}),false);assert.equal(check({devDependencies:{unexpected:'1.0.0'}}),false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'package-lock.json'))),lock);
});
test('production anonymous smoke is read-only and admin cookies retain all HTTPS flags and expiry',async t=>{
    const env=await launch(t,{production:true}),db=env.openDatabase();
    const state=()=>JSON.stringify(['accounts','orders','sessions','products'].map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()));
    const before=state(),result=await smoke(env.base);assert.equal(result.status,'ok',JSON.stringify(result));assert.equal(state(),before);
    const admin=env.client(),login=await admin.call('/api/admin/login','POST',{username:'audit-admin',password:'Defensive audit administrator 2026!'});assert.equal(login.status,200);
    const cookie=login.response.headers.getSetCookie().find(value=>value.startsWith('__Host-web2_admin='));assert.ok(cookie);
    for(const flag of [/; Secure(?:;|$)/,/; HttpOnly(?:;|$)/,/; SameSite=Strict(?:;|$)/,/; Path=\/(?:;|$)/,/; Max-Age=28800(?:;|$)/,/; Expires=/])assert.match(cookie,flag);
    assert.doesNotMatch(cookie,/; Domain=/);assert.equal((await admin.call('/api/admin/session')).status,200);
    assert.equal((await env.client().call('/api/admin/session')).status,401);
    assert.equal((await admin.call('/api/admin/logout','POST',{})).status,204);
    assert.equal((await admin.call('/api/admin/session')).status,401);
});
test('smoke refuses insecure public origins and never treats redirects or failed readiness as success',async()=>{
    for(const url of ['http://public.example.invalid','https://user:pass@example.invalid','https://example.invalid/path'])assert.throws(()=>target(url));
    const result=await smoke('http://127.0.0.1:3000',{request:async()=>new Response('{}',{status:302,headers:{Location:'https://example.invalid/'}})});
    assert.equal(result.status,'failed');assert.equal(result.checks.every(check=>!check.passed),true);
});
test('release allowlist omits local state and debug files; manifest catches corruption and extra secrets',t=>{
    const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'.runtime'),{recursive:true});
    const directory=fs.mkdtempSync(path.join(root,'.runtime','phase21-package-test-')),target=path.join(directory,'source');
    t.after(()=>{assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(path.join(root,'.runtime')));fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
    const names=list(root);assert.ok(names.includes('deploy/ecosystem.config.cjs'));assert.ok(names.includes('scripts/backup.cjs'));assert.ok(names.includes('tests/fixtures/migration-v1.json'));
    for(const name of names)assert.doesNotMatch(name,/^(?:\.env$|\.runtime\/|node_modules\/|\.git\/|var\/|backend\/|gaming-store\/|gaming-ecommerce\/|_.*|temp_old_section)/);
    stage(root,target);assert.equal(verify(target).status,'ok');
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(target,'data.json')))),['products']);
    fs.writeFileSync(path.join(target,'.env'),'MUST_NOT_SHIP=synthetic');assert.throws(()=>verify(target),/UNEXPECTED_RELEASE_FILE/);fs.unlinkSync(path.join(target,'.env'));
    fs.appendFileSync(path.join(target,'server.js'),'\n// corrupted');assert.throws(()=>verify(target),/RELEASE_HASH_MISMATCH/);
});
