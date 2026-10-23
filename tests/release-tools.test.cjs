'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {environment,secretScan}=require('../scripts/release-check.cjs');
test('configuration preflight works before npm ci without loading any external dependency',()=>{
    const modulePath=path.resolve(__dirname,'../lib/runtime-config.cjs');
    const code="require(process.argv[1]).validateRuntime({NODE_ENV:'test',ADMIN_PASSWORD:'Isolated preflight fixture 2026!'});console.log(JSON.stringify(Object.keys(require.cache).filter(name=>name.includes('node_modules'))));";
    const run=spawnSync(process.execPath,['-e',code,modulePath],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),[]);
});
test('release checks reject unsupported Node versions and cannot claim production payments are ready',()=>{
    const env={NODE_ENV:'production',HOST:'127.0.0.1',PORT:'3000',APP_ORIGIN:'https://shop.example.invalid',TRUST_PROXY:'loopback',ADMIN_USERNAME:'fixture',ADMIN_PASSWORD:'Release tooling fixture 2026!',ACCOUNT_TOTP_KEY:'a'.repeat(64),TURNSTILE_SITE_KEY:'synthetic-site',TURNSTILE_SECRET_KEY:'synthetic-secret',SMS_PROVIDER:'generic',SMS_API_KEY:'synthetic-key',SMS_API_URL:'https://sms.example.invalid/send',BACKUP_DIR:path.resolve(os.tmpdir(),'web2-fixture-backups'),DATABASE_PATH:path.resolve(os.tmpdir(),'web2-fixture.sqlite'),PAYMENT_MODE:'real',PAYMENT_PROVIDER:'invented'};
    for(const nodeVersion of ['22.20.0','24.14.0','25.0.0'])assert.ok(environment(env,{nodeVersion}).findings.some(f=>f.code==='RUNTIME_CONFIG_INVALID'));
    const checked=environment(env,{nodeVersion:'24.15.0'});assert.equal(checked.status,'NO-GO');assert.ok(checked.findings.some(f=>f.code==='PAYMENTS_UNAVAILABLE'));assert.deepEqual(checked.missing,[]);
    assert.doesNotMatch(JSON.stringify(checked),/Release tooling fixture|synthetic-secret|synthetic-key|https:\/\/sms/);
    const missing=environment({NODE_ENV:'development',ALLOW_PRODUCTION_HTTP:'true'});assert.equal(missing.status,'NO-GO');assert.ok(missing.missing.includes('ADMIN_PASSWORD'));assert.ok(missing.unusedVariables.includes('ALLOW_PRODUCTION_HTTP'));
});
test('secret scanner reports locations without disclosing values and never follows links',t=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'web2-release-scan-'));
    t.after(()=>{assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
    const secret=['ghp_','Z'.repeat(36)].join('');fs.writeFileSync(path.join(directory,'accidental.js'),'const credential = '+JSON.stringify(secret)+';');
    fs.writeFileSync(path.join(directory,'.env'),'PRIVATE='+secret);fs.mkdirSync(path.join(directory,'tests'));fs.writeFileSync(path.join(directory,'tests','fixture.js'),"const password='synthetic test fixture';");
    fs.writeFileSync(path.join(directory,'labels.js'),"password.autocomplete=register?'new-password':'current-password';");
    const excluded=path.join(directory,'.runtime');fs.mkdirSync(excluded);fs.writeFileSync(path.join(excluded,'private.js'),secret);fs.symlinkSync(excluded,path.join(directory,'linked'),process.platform==='win32'?'junction':'dir');
    const result=secretScan(directory);assert.equal(result.status,'review-required');assert.deepEqual(result.findings,[{path:'accidental.js',line:1,rule:'provider-token'}]);assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
    fs.unlinkSync(path.join(directory,'accidental.js'));assert.equal(secretScan(directory).status,'pass');
});
test('test isolation removes inherited production configuration once and preserves explicit child fixtures',()=>{
    const helper=path.resolve(__dirname,'helpers/isolated-environment.cjs');
    const code="require(process.argv[1]);const {spawnSync}=require('node:child_process');const child=spawnSync(process.execPath,['-e','console.log(JSON.stringify({mode:process.env.NODE_ENV,provider:process.env.SMS_PROVIDER,loadDisabled:String(process.loadEnvFile).includes(\"()=>{}\")}))'],{env:{...process.env,NODE_ENV:'production',SMS_PROVIDER:'generic'},encoding:'utf8'});console.log(JSON.stringify({mode:process.env.NODE_ENV,provider:process.env.SMS_PROVIDER,hasSecret:!!process.env.SMS_API_KEY,child:JSON.parse(child.stdout)}));";
    const run=spawnSync(process.execPath,['-e',code,helper],{env:{...process.env,NODE_OPTIONS:'',WEB2_TEST_ENV_ISOLATED:'',NODE_ENV:'production',SMS_PROVIDER:'generic',SMS_API_KEY:'must-not-inherit'},encoding:'utf8',windowsHide:true});
    assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),{mode:'test',provider:'mock',hasSecret:false,child:{mode:'production',provider:'generic',loadDisabled:true}});
});
