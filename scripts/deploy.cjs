'use strict';
// Run from a staged release on the VPS. Dry-run is the default. This tool never
// changes Nginx, copies secrets, switches storage drivers or restores a database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{parseEnv}=require('node:util');
const {spawn}=require('node:child_process');
const fail=code=>Object.assign(new Error(code),{code});
const within=(parent,child)=>{const relative=path.relative(parent,child);return !relative||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
function metadata(directory){
    directory=fs.realpathSync(directory);
    for(const name of ['server.js','package.json','package-lock.json','deploy/ecosystem.config.cjs','lib/storage-migrations.cjs','scripts/backup.cjs'])if(!fs.statSync(path.join(directory,name)).isFile())throw fail('RELEASE_FILES_INVALID');
    const pkg=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8')),lock=JSON.parse(fs.readFileSync(path.join(directory,'package-lock.json'),'utf8'));
    if(pkg.version!==lock.version||pkg.version!==lock.packages?.['']?.version)throw fail('LOCKFILE_VERSION_MISMATCH');
    const config=path.join(directory,'deploy/ecosystem.config.cjs');delete require.cache[require.resolve(config)];const apps=require(config).apps;
    if(apps?.length!==1||apps[0].name!=='web2'||apps[0].instances!==1||apps[0].exec_mode!=='fork'||apps[0].script!=='server.js'||fs.realpathSync(apps[0].cwd)!==directory)throw fail('PM2_CONFIGURATION_INVALID');
    const schema=fs.readFileSync(path.join(directory,'lib/storage-migrations.cjs'),'utf8').match(/const schemaVersion\s*=\s*(\d+)/)?.[1];
    if(!schema)throw fail('SCHEMA_VERSION_UNVERIFIABLE');
    return {directory,config,schema,version:pkg.version,production:apps[0].env_production||{}};
}
function sameFile(a,b){const left=fs.statSync(a),right=fs.statSync(b);return left.isFile()&&right.isFile()&&left.dev===right.dev&&left.ino===right.ino;}
function plan({candidate,previous,envFile,lock}){
    if(!candidate||!previous||!envFile||!lock||![candidate,previous,envFile,lock].every(path.isAbsolute))throw fail('ABSOLUTE_DEPLOYMENT_PATHS_REQUIRED');
    const next=metadata(candidate),prior=metadata(previous);envFile=fs.realpathSync(envFile);lock=path.resolve(lock);
    if(next.directory===prior.directory||within(next.directory,prior.directory)||within(prior.directory,next.directory))throw fail('SEPARATE_RELEASE_DIRECTORIES_REQUIRED');
    if(next.schema!==prior.schema)throw fail('SCHEMA_CHANGE_REQUIRES_MANUAL_ROLLOUT');
    if(!sameFile(envFile,path.join(next.directory,'.env'))||!sameFile(envFile,path.join(prior.directory,'.env')))throw fail('SHARED_PRIVATE_ENV_REQUIRED');
    const env=parseEnv(fs.readFileSync(envFile,'utf8')),storage=require('../storage/config.cjs').configuration(env);
    for(const release of [next,prior])for(const name of ['NODE_ENV','HOST','PORT','TRUST_PROXY'])if(release.production[name]!==undefined&&String(release.production[name])!==String(env[name]))throw fail('PM2_ENVIRONMENT_MISMATCH');
    if(!path.isAbsolute(storage.filename)||!env.BACKUP_DIR||!path.isAbsolute(env.BACKUP_DIR))throw fail('ABSOLUTE_SHARED_STORAGE_REQUIRED');
    if(!fs.statSync(storage.filename).isFile()||fs.statSync(storage.filename).size<1||!fs.statSync(env.BACKUP_DIR).isDirectory())throw fail('EXISTING_SHARED_STORAGE_REQUIRED');
    const physical=[fs.realpathSync(storage.filename),fs.realpathSync(env.BACKUP_DIR),envFile,path.join(fs.realpathSync(path.dirname(lock)),path.basename(lock))];
    for(const filename of physical)if(within(next.directory,filename)||within(prior.directory,filename))throw fail('SHARED_STATE_OUTSIDE_RELEASE_REQUIRED');
    if(lock===envFile||lock===storage.filename||!fs.statSync(path.dirname(lock)).isDirectory())throw fail('DEPLOYMENT_LOCK_INVALID');
    const port=Number(env.PORT||3000);if(!Number.isSafeInteger(port)||port<1||port>65535)throw fail('PORT_INVALID');
    return {next,prior,envFile,lock,env,healthUrl:'http://127.0.0.1:'+port,steps:['pm2-single-process-check','nginx-test','production-preflight','previous-health','npm-ci-with-test-dependencies','syntax-check','active-application-tests','npm-ci-production','runtime-dependencies','verified-backup','independent-backup-verification','nginx-test','activate-candidate','health-and-readiness','local-and-public-smoke','pm2-path-check','pm2-save'],rollback:'Restart the previous code release and verify health; keep the current database.'};
}
async function run(command,args,{cwd,env}){
    return new Promise((resolve,reject)=>{
        const child=spawn(command,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false});let stdout='';
        child.stdout.on('data',chunk=>{stdout=(stdout+chunk).slice(-32*1024*1024);});child.stderr.on('data',()=>{});
        child.once('error',()=>reject(fail('COMMAND_START_FAILED')));child.once('exit',code=>code===0?resolve(stdout):reject(fail('COMMAND_FAILED')));
    });
}
async function health(base){
    for(const route of ['/health','/ready']){
        let ok=false;for(let attempt=0;attempt<20;attempt++){
            try{const response=await fetch(base+route,{redirect:'error',signal:AbortSignal.timeout(2000)});ok=response.ok&&(await response.json()).status==='ok';}catch{}
            if(ok)break;await new Promise(resolve=>setTimeout(resolve,250));
        }if(!ok)throw fail('HEALTH_CHECK_FAILED');
    }
}
async function execute(p,{dryRun=true,runner=run,probe=health}={}){
    if(dryRun)return {status:'dry-run',version:p.next.version,steps:p.steps,rollback:p.rollback};
    const fd=fs.openSync(p.lock,'wx',0o600),owned=fs.fstatSync(fd);let activated=false;
    const call=(command,args,directory=p.next.directory)=>runner(command,args,{cwd:directory,env:{...process.env,...p.env}});
    const pm2=(args)=>call('pm2',args);
    const assertProcess=async directory=>{
        const rows=JSON.parse(await pm2(['jlist']));
        const relevant=rows.filter(row=>row.name==='web2'||[p.next.directory,p.prior.directory].some(dir=>row.pm2_env?.pm_exec_path===path.join(dir,'server.js')));
        if(relevant.length!==1||relevant[0].name!=='web2'||relevant[0].pm2_env?.status!=='online'||fs.realpathSync(relevant[0].pm2_env.pm_cwd)!==directory||relevant[0].pm2_env.pm_exec_path!==path.join(directory,'server.js'))throw fail('PM2_PROCESS_STATE_INVALID');
        const stored=relevant[0].pm2_env;
        for(const name of ['NODE_ENV','HOST','PORT','TRUST_PROXY','APP_ORIGIN','STORAGE_DRIVER','DATABASE_PATH','SQLITE_PATH','SEED_DATA_PATH','ADMIN_USERNAME','ADMIN_PASSWORD','ADMIN_TOTP_SECRET','ACCOUNT_TOTP_KEY','TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','SMS_PROVIDER','SMS_API_KEY','SMS_API_URL','BACKUP_DIR']){
            const value=stored[name]??stored.env?.[name];
            if(value!==undefined&&String(value)!==String(p.env[name]||''))throw fail('PM2_STORED_ENVIRONMENT_MISMATCH');
        }
    };
    const activate=release=>pm2(['startOrRestart',release.config,'--only','web2','--env','production','--update-env']);
    try{
        fs.writeFileSync(fd,JSON.stringify({pid:process.pid,started:new Date().toISOString(),id:crypto.randomUUID()}));
        await assertProcess(p.prior.directory);
        await call('sudo',['-n','nginx','-t']);
        await call(process.execPath,['scripts/release-check.cjs','--env-file',p.envFile]);
        await probe(p.healthUrl);
        await call('npm',['ci','--ignore-scripts','--include=dev','--no-audit','--no-fund']);
        await call('npm',['run','check:production']);await call('npm',['run','test:production']);
        await call('npm',['ci','--ignore-scripts','--omit=dev','--no-audit','--no-fund']);
        await call(process.execPath,['-e',"for(const name of Object.keys(require('./package.json').dependencies))require(name);require('node:sqlite');"]);
        const backup=JSON.parse(await call(process.execPath,['scripts/backup.cjs','--no-retention']));
        if(backup.status!=='ok'||!/^web2-[\w-]+\.sqlite$/.test(backup.backup||'')||!Number.isSafeInteger(backup.bytes)||backup.bytes<1||!/^[a-f0-9]{64}$/.test(backup.sha256||''))throw fail('VERIFIED_BACKUP_REQUIRED');
        await call(process.execPath,['-e',"const fs=require('node:fs'),crypto=require('node:crypto'),file=process.argv[1];if(!fs.lstatSync(file).isFile()||fs.statSync(file).size!==Number(process.argv[3])||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==process.argv[2])process.exit(1);require('./scripts/backup.cjs').verify(file);",path.join(p.env.BACKUP_DIR,backup.backup),backup.sha256,String(backup.bytes)]);
        await call('sudo',['-n','nginx','-t']);
        activated=true;await activate(p.next);await probe(p.healthUrl);await assertProcess(p.next.directory);
        await call(process.execPath,['scripts/production-smoke.cjs','--base',p.healthUrl]);
        await call(process.execPath,['scripts/production-smoke.cjs','--base',p.env.APP_ORIGIN]);
        await pm2(['save']);
        return {status:'deployed',version:p.next.version,backup:backup.backup};
    }catch(error){
        if(!activated)throw error;
        try{await activate(p.prior);await probe(p.healthUrl);await assertProcess(p.prior.directory);await pm2(['save']);}
        catch{throw fail('DEPLOY_FAILED_ROLLBACK_FAILED');}
        throw fail('DEPLOY_FAILED_ROLLED_BACK');
    }finally{
        fs.closeSync(fd);const current=fs.lstatSync(p.lock);if(current.dev===owned.dev&&current.ino===owned.ino)fs.unlinkSync(p.lock);
    }
}
if(require.main===module)(async()=>{try{
    const args=process.argv.slice(2),options={};let dryRun=true;
    while(args.length){const arg=args.shift();if(arg==='--apply')dryRun=false;else if(arg==='--dry-run')dryRun=true;else if(['--candidate','--previous','--env-file','--lock'].includes(arg)&&args[0])options[{'--candidate':'candidate','--previous':'previous','--env-file':'envFile','--lock':'lock'}[arg]]=args.shift();else throw fail('ARGUMENTS_INVALID');}
    if(!dryRun&&process.platform!=='linux')throw fail('APPLY_REQUIRES_LINUX');
    const result=await execute(plan(options),{dryRun});console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({status:'failed',code:/^[A-Z_]+$/.test(error.code||'')?error.code:'DEPLOYMENT_FAILED'}));process.exitCode=1;}})();
module.exports={plan,execute};
