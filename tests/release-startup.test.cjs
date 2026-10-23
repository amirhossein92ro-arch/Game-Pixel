'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function fixture(t){
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'web2-release-startup-'));
    const database=path.join(directory,'store.sqlite'),seed=path.join(directory,'seed.json'),preload=path.join(directory,'preload.cjs');
    fs.writeFileSync(seed,'{}');fs.writeFileSync(preload,'process.loadEnvFile=()=>{};');
    const children=[];t.after(async()=>{for(const child of children)if(child.exitCode===null&&child.signalCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
    return {directory,database,preload,children,env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'3000',APP_ORIGIN:'https://shop.example.invalid',ALLOWED_ORIGINS:'',TRUST_PROXY:'loopback',
        STORAGE_DRIVER:'sqlite',DATABASE_PATH:database,SQLITE_PATH:database,SEED_DATA_PATH:seed,ADMIN_USERNAME:'release-admin',ADMIN_PASSWORD:'Release startup fixture 2026!',
        ADMIN_TOTP_SECRET:'',ACCOUNT_TOTP_KEY:'',CAPTCHA_PROVIDER:'turnstile',CAPTCHA_TEST_MODE:'false',TURNSTILE_SITE_KEY:'',TURNSTILE_SECRET_KEY:'',CAPTCHA_SITE_KEY:'',CAPTCHA_SECRET_KEY:'',
        SMS_PROVIDER:'generic',SMS_API_KEY:'synthetic-fixture',SMS_API_URL:'https://sms.example.invalid/send',SMS_TEMPLATE_ID:'',PAYMENT_MODE:'test'}};
}
test('invalid startup configuration is rejected before creating or migrating storage',async t=>{
    for(const [name,override]of [
        ['HTTP production origin',{APP_ORIGIN:'http://shop.example.invalid'}],
        ['malformed origin',{APP_ORIGIN:'https://shop.example.invalid/private'}],
        ['untrusted development origin',{NODE_ENV:'test',DEV_FRONTEND_ORIGINS:'https://external.example.invalid'}],
        ['mistyped environment',{NODE_ENV:'prodution'}],
        ['broad proxy trust',{TRUST_PROXY:'true'}],
        ['malformed authenticator key',{ACCOUNT_TOTP_KEY:'invalid-key'}],
        ['malformed bootstrap factor',{ADMIN_TOTP_SECRET:'invalid-secret'}],
        ['incomplete CAPTCHA pair',{TURNSTILE_SITE_KEY:'synthetic-site-key'}],
        ['unavailable storage driver',{STORAGE_DRIVER:'postgres'}],
        ['invalid port',{PORT:'0'}]
    ])await t.test(name,t=>{
        const f=fixture(t),run=spawnSync(process.execPath,['--require',f.preload,'server.js'],{cwd:root,env:{...f.env,...override},encoding:'utf8',windowsHide:true,timeout:10000});
        assert.equal(run.status,1,name+' must fail before listening');assert.equal(fs.existsSync(f.database),false,name+' must leave the database absent');
        assert.doesNotMatch(run.stdout+run.stderr,/Release startup fixture|synthetic-fixture|invalid-secret|invalid-key|node_modules|at Object\./);
    });
});
test('production without optional SMS starts explicitly degraded and never delivers mock OTPs',async t=>{
    const f=fixture(t),probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    const child=spawn(process.execPath,['--require',f.preload,'server.js'],{cwd:root,env:{...f.env,SMS_PROVIDER:'',SMS_API_KEY:'',SMS_API_URL:'',PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
    f.children.push(child);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout.')),15000);child.once('exit',()=>{clearTimeout(timer);reject(Error('Startup failed.'));});child.stdout.on('data',()=>{if(logs.includes('Server is running')){clearTimeout(timer);resolve();}});});
    for(const route of ['/health','/ready']){const response=await fetch('http://127.0.0.1:'+port+route);assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'ok'});}
    assert.match(logs,/SMS_UNCONFIGURED/);assert.match(logs,/PAYMENTS_UNAVAILABLE/);assert.doesNotMatch(logs,/Release startup fixture|synthetic-fixture/);
    const sms=require('../lib/sms.cjs').createSmsService({NODE_ENV:'production'});assert.equal(sms.mock,false);
    await assert.rejects(sms.sendOtp({phone:'09120000000',code:'123456',expiresInSeconds:120}),error=>error.status===503&&!/123456/.test(error.message));
});
