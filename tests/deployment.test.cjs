'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {plan,execute}=require('../scripts/deploy.cjs');
function fixture(t){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'web2-release-deploy-')),candidate=path.join(root,'candidate'),previous=path.join(root,'previous'),shared=path.join(root,'shared');fs.mkdirSync(shared);
    t.after(()=>{assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
    const envFile=path.join(shared,'.env'),lock=path.join(shared,'deploy.lock'),database=path.join(shared,'store.sqlite');fs.writeFileSync(database,'database-preserved');fs.mkdirSync(path.join(shared,'backups'));
    fs.writeFileSync(envFile,'NODE_ENV=production\nPORT=3000\nSTORAGE_DRIVER=sqlite\nDATABASE_PATH='+database+'\nBACKUP_DIR='+path.join(shared,'backups')+'\n');
    for(const directory of [candidate,previous]){
        for(const name of ['deploy','lib','scripts'])fs.mkdirSync(path.join(directory,name),{recursive:true});
        fs.writeFileSync(path.join(directory,'server.js'),'');fs.writeFileSync(path.join(directory,'scripts/backup.cjs'),'');fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({version:'1.0.1-rc.1'}));
        fs.writeFileSync(path.join(directory,'package-lock.json'),JSON.stringify({version:'1.0.1-rc.1',packages:{'':{version:'1.0.1-rc.1'}}}));
        fs.writeFileSync(path.join(directory,'lib/storage-migrations.cjs'),'const schemaVersion=16;');
        fs.writeFileSync(path.join(directory,'deploy/ecosystem.config.cjs'),"module.exports={apps:[{name:'web2',cwd:require('node:path').resolve(__dirname,'..'),script:'server.js',instances:1,exec_mode:'fork'}]};");fs.linkSync(envFile,path.join(directory,'.env'));
    }
    return {candidate,previous,envFile,lock,database};
}
function operations(f,{failure,duplicate=false,rollbackFailure=false}={}){
    let active=f.previous;const calls=[];
    return {calls,async runner(command,args){
        const step=args[0]==='jlist'?'jlist':args[0]==='startOrRestart'?(args[1].startsWith(f.candidate)?'activate':'rollback'):command==='sudo'?'nginx':args[0]==='ci'?(args.includes('--omit=dev')?'production-ci':'ci'):args[0]==='run'?(args[1]==='test:production'?'tests':'check'):args[0].includes('release-check')?'preflight':args[0].includes('backup.cjs')?'backup':args[0].includes('production-smoke')?'smoke':args[0]==='-e'?(args[1].includes('.verify(')?'backup-verify':'dependencies'):args[0];calls.push(step);
        if(failure===step||step==='rollback'&&rollbackFailure)throw Error('Simulated failure.');
        if(step==='jlist'){const row={name:'web2',pm2_env:{status:'online',pm_cwd:active,pm_exec_path:path.join(active,'server.js')}};return JSON.stringify(duplicate?[row,row]:[row]);}
        if(step==='backup')return JSON.stringify({status:'ok',backup:'web2-fixture.sqlite',bytes:4096,sha256:'a'.repeat(64)});
        if(step==='activate')active=f.candidate;if(step==='rollback')active=f.previous;return '';
    },async probe(){calls.push('health');if(failure==='health'&&active===f.candidate)throw Error('Synthetic health failure.');}};
}
test('deployment dry-run is read-only and requires compatible separate releases and shared state',async t=>{
    const f=fixture(t),p=plan(f),ops=operations(f);assert.equal((await execute(p,{...ops,dryRun:true})).status,'dry-run');assert.deepEqual(ops.calls,[]);assert.equal(fs.existsSync(f.lock),false);
    assert.throws(()=>plan({...f,previous:f.candidate}),/SEPARATE_RELEASE/);fs.writeFileSync(path.join(f.candidate,'lib/storage-migrations.cjs'),'const schemaVersion=17;');assert.throws(()=>plan(f),/SCHEMA_CHANGE_REQUIRES_MANUAL/);
});
test('deployment refuses a held lock and leaves its owner record unchanged',async t=>{
    const f=fixture(t),p=plan(f),ops=operations(f);fs.writeFileSync(f.lock,'other-deployment');await assert.rejects(execute(p,{...ops,dryRun:false}),error=>error.code==='EEXIST');assert.deepEqual(ops.calls,[]);assert.equal(fs.readFileSync(f.lock,'utf8'),'other-deployment');
});
for(const failure of ['nginx','preflight','ci','check','tests','production-ci','dependencies','backup','backup-verify'])test('deployment stops before activation when '+failure+' fails',async t=>{
    const f=fixture(t),ops=operations(f,{failure});await assert.rejects(execute(plan(f),{...ops,dryRun:false}));assert.equal(ops.calls.includes('activate'),false);assert.equal(fs.existsSync(f.lock),false);assert.equal(fs.readFileSync(f.database,'utf8'),'database-preserved');
});
test('deployment requires a single existing PM2 process, backs up before activation and saves only after health',async t=>{
    const f=fixture(t),duplicate=operations(f,{duplicate:true});await assert.rejects(execute(plan(f),{...duplicate,dryRun:false}),/PM2_PROCESS_STATE_INVALID/);assert.deepEqual(duplicate.calls,['jlist']);
    const ops=operations(f);assert.equal((await execute(plan(f),{...ops,dryRun:false})).status,'deployed');assert.ok(ops.calls.indexOf('backup')<ops.calls.indexOf('activate'));assert.ok(ops.calls.indexOf('health')<ops.calls.indexOf('save'));assert.equal(fs.existsSync(f.lock),false);
});
test('failed candidate health rolls back code, validates the previous process, and preserves current data',async t=>{
    const f=fixture(t),ops=operations(f,{failure:'health'});await assert.rejects(execute(plan(f),{...ops,dryRun:false}),/DEPLOY_FAILED_ROLLED_BACK/);assert.ok(ops.calls.includes('rollback'));assert.equal(ops.calls.filter(step=>step==='health').length,3);assert.equal(fs.readFileSync(f.database,'utf8'),'database-preserved');assert.equal(fs.existsSync(f.lock),false);
});
test('failed public or local smoke rolls back code without restoring data',async t=>{
    const f=fixture(t),ops=operations(f,{failure:'smoke'});await assert.rejects(execute(plan(f),{...ops,dryRun:false}),/DEPLOY_FAILED_ROLLED_BACK/);assert.ok(ops.calls.includes('rollback'));assert.equal(fs.readFileSync(f.database,'utf8'),'database-preserved');
});
test('deployment rejects missing data and shared directories resolving inside a release',t=>{
    const f=fixture(t);fs.unlinkSync(f.database);assert.throws(()=>plan(f));fs.writeFileSync(f.database,'database-preserved');
    fs.rmdirSync(path.join(path.dirname(f.envFile),'backups'));fs.mkdirSync(path.join(f.previous,'backups'));fs.symlinkSync(path.join(f.previous,'backups'),path.join(path.dirname(f.envFile),'backups'),process.platform==='win32'?'junction':'dir');assert.throws(()=>plan(f),/SHARED_STATE_OUTSIDE_RELEASE_REQUIRED/);
});
test('rollback failure is explicit and never triggers automatic data restore',async t=>{
    const f=fixture(t),ops=operations(f,{failure:'health',rollbackFailure:true});await assert.rejects(execute(plan(f),{...ops,dryRun:false}),/DEPLOY_FAILED_ROLLBACK_FAILED/);assert.equal(ops.calls.includes('save'),false);assert.equal(fs.readFileSync(f.database,'utf8'),'database-preserved');
});
