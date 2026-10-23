'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),tls=require('node:tls'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {check}=require('./disk-check.cjs'),{notify}=require('./ops-alert.cjs');
const {createState,integer,backupSummary,conditions}=require('../lib/ops-state.cjs');
const log=require('../lib/operational-log.cjs'),root=path.resolve(__dirname,'..');
function healthUrl(value,{local=false}={}){
    const url=new URL(value);
    if(url.username||url.password||url.search||url.hash||!['/health','/ready'].includes(url.pathname)||
        (local?url.protocol!=='http:'||url.hostname!=='127.0.0.1':url.protocol!=='https:'&&(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw Error('MONITOR_HEALTH_URL_INVALID');
    return url;
}
async function probeHealth(url){
    const started=performance.now();
    try{
        const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(5000),headers:{'Cache-Control':'no-cache'}});
        let body='';const reader=response.body?.getReader();
        if(reader){try{while(true){const part=await reader.read();if(part.done)break;body+=Buffer.from(part.value).toString('utf8');if(body.length>1024)throw Error('Health response too large.');}}finally{await reader.cancel().catch(()=>{});}}
        return {ok:response.status===200&&JSON.parse(body).status==='ok',durationMs:Math.round(performance.now()-started)};
    }catch{return {ok:false,durationMs:Math.round(performance.now()-started)};}
}
function storageAccess(filename){try{if(!fs.statSync(filename).isFile())return false;fs.accessSync(filename,fs.constants.R_OK|fs.constants.W_OK);fs.accessSync(path.dirname(filename),fs.constants.R_OK|fs.constants.W_OK);return true;}catch{return false;}}
function pm2Status(){
    try{
        // jlist contains environment values. Parse in memory and return only these fields.
        const rows=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:5000,maxBuffer:4*1024*1024,windowsHide:true,stdio:['ignore','pipe','ignore']}));
        const apps=rows.filter(row=>row.name==='web2');
        if(apps.length!==1)return {status:apps.length?'duplicate':'missing',restarts:0,unstable:0};
        const item=apps[0].pm2_env||{},statuses=['online','stopped','errored','launching','waiting restart','stopping','one-launch-status'];
        return {status:statuses.includes(item.status)?item.status:'unavailable',restarts:Math.max(0,Number(item.restart_time)||0),unstable:Math.max(0,Number(item.unstable_restarts)||0)};
    }catch{return {status:'unavailable',restarts:0,unstable:0};}
}
function nginxStatus(){try{return execFileSync('systemctl',['is-active','nginx'],{encoding:'utf8',timeout:3000,stdio:['ignore','pipe','ignore']}).trim()==='active';}catch{return false;}}
function certificateExpiry(url){
    return new Promise(resolve=>{
        let socket,done=false;const finish=value=>{if(done)return;done=true;socket?.destroy();resolve(value);};
        try{socket=tls.connect({host:url.hostname,port:Number(url.port)||443,servername:url.hostname,rejectUnauthorized:true},()=>{
            const expiresAt=Date.parse(socket.getPeerCertificate().valid_to);finish({ok:socket.authorized&&Number.isFinite(expiresAt),expiresAt:Number.isFinite(expiresAt)?expiresAt:null});
        });socket.setTimeout(5000,()=>finish({ok:false,expiresAt:null}));socket.on('error',()=>finish({ok:false,expiresAt:null}));}catch{finish({ok:false,expiresAt:null});}
    });
}
function restartWindow(previous,current,now,threshold){
    const prior=previous?.pm2Baseline,last=Number(prior?.restarts),lastAt=Number(prior?.at);
    const samples=Array.isArray(previous?.restartSamples)?previous.restartSamples.filter(row=>Number.isFinite(row.at)&&row.at>now-30*60000&&row.at<=now&&Number.isFinite(row.count)&&row.count>=0).slice(-59):[];
    if(Number.isFinite(last)&&Number.isFinite(lastAt)&&lastAt<=now&&now-lastAt<=30*60000&&current.restarts>=last)samples.push({at:now,count:Math.min(100000,current.restarts-last)});
    const count=Math.min(100000,samples.reduce((sum,row)=>sum+row.count,0));
    return {samples,count,active:count>=threshold||current.unstable>=threshold};
}
async function run({env=process.env,state,now=Date.now(),platform=process.platform,probe=probeHealth,diskCheck=check,storageCheck=storageAccess,pm2Check=pm2Status,nginxCheck=nginxStatus,certificateCheck=certificateExpiry,notifyAlert=notify}={}){
    state=state||createState({env});const release=state.lock('monitor-run');
    try{
        const production=env.NODE_ENV==='production',filename=path.resolve(require('../storage/config.cjs').configuration(env,root).filename);
        const local=healthUrl(env.HEALTH_URL||'http://127.0.0.1:3000/ready',{local:true});
        const publicUrl=env.NGINX_HEALTH_URL?healthUrl(env.NGINX_HEALTH_URL):null;
        const pm2Required=env.MONITOR_PM2_REQUIRED==='1'||production&&env.MONITOR_PM2_REQUIRED!=='0';
        const backupRequired=env.MONITOR_BACKUP_REQUIRED==='1'||production&&env.MONITOR_BACKUP_REQUIRED!=='0';
        const previous=state.read('monitor')||{},backupState=state.read('backup'),backup=backupSummary(backupState),runtime=state.read('runtime');
        const health=await probe(new URL('/health',local)),ready=await probe(new URL('/ready',local)),publicHealth=publicUrl?await probe(publicUrl):null;
        const storage=storageCheck(filename),folder=path.resolve(env.BACKUP_DIR||(platform==='win32'?path.join(os.homedir(),'web2-backups'):'/var/backups/web2'));
        const diskFolders=[path.dirname(filename),folder,path.join(root,'var/logs')].filter((value,index,array)=>index===0||fs.existsSync(value)&&array.indexOf(value)===index);
        let disk;try{const disks=diskFolders.map(value=>diskCheck(value,{env}));disk={usedPercent:Math.max(...disks.map(value=>value.usedPercent)),freeBytes:Math.min(...disks.map(value=>value.freeBytes)),status:disks.some(value=>value.status==='critical')?'critical':disks.some(value=>value.status==='warning')?'warning':'ok'};}catch{disk={usedPercent:null,freeBytes:null,status:'unknown'};}
        const minFree=integer(env,'MONITOR_MIN_FREE_MB',512,0,1048576)*1048576;
        const pm2=pm2Required?pm2Check():{status:'skipped',restarts:0,unstable:0};
        const restart=restartWindow(previous,pm2,now,integer(env,'PM2_RESTART_ALERT_COUNT',5,1,1000));
        const nginx=env.MONITOR_NGINX_SERVICE==='1'?(platform==='linux'?nginxCheck():false):null;
        const maxAge=integer(env,'BACKUP_MAX_AGE_HOURS',36,1,8760)*3600000;
        let backupAvailable=null;
        if(backup.lastSuccessAt){try{if(!/^web2-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{12}\.sqlite$/.test(backupState.snapshot||''))throw Error('Invalid snapshot.');const file=path.join(folder,backupState.snapshot),stat=fs.lstatSync(file);fs.accessSync(file,fs.constants.R_OK);backupAvailable=stat.isFile()&&stat.size===backup.bytes;}catch{backupAvailable=false;}}
        const stale=!!(backupRequired||backup.lastSuccessAt)&&(!backup.lastSuccessAt||now-Date.parse(backup.lastSuccessAt)>maxAge||Date.parse(backup.lastSuccessAt)>now||backup.integrity!=='ok'||backupAvailable===false);
        const runtimeAge=now-Date.parse(runtime?.time),runtimeFresh=Number.isFinite(runtimeAge)&&runtimeAge>=0&&runtimeAge<=180000;
        const runtimeRequired=env.MONITOR_RUNTIME_REQUIRED==='1'||production&&env.MONITOR_RUNTIME_REQUIRED!=='0';
        const slowThreshold=integer(env,'MONITOR_HEALTH_WARN_MS',1500,100,30000);
        const slow=[health,ready,publicHealth].some(value=>value?.ok&&value.durationMs>=slowThreshold);
        const recent=now-Date.parse(previous.time)>=0&&now-Date.parse(previous.time)<=15*60000;
        const slowSamples=slow?Math.min(100,(recent?Number(previous.slowSamples)||0:0)+1):0;
        let certificate=null;
        if(publicUrl?.protocol==='https:'){
            const target=crypto.createHash('sha256').update(publicUrl.origin).digest('hex');
            const old=previous.certificate;
            certificate=old?.target===target&&now-old.checkedAt>=0&&now-old.checkedAt<86400000?old:{...await certificateCheck(publicUrl),checkedAt:now,target};
            certificate.daysRemaining=Number.isFinite(certificate.expiresAt)?Math.floor((certificate.expiresAt-now)/86400000):null;
        }
        const active=new Map(),problem=(name,severity,condition)=>{if(condition)active.set(name,severity);};
        problem('health-failure','CRITICAL',!health.ok||!ready.ok||publicHealth?.ok===false);
        problem('storage-failure','CRITICAL',!storage);
        problem('disk',disk.status==='critical'||disk.freeBytes<minFree?'CRITICAL':'WARNING',disk.status!=='ok'||disk.freeBytes<minFree);
        problem('backup-stale','WARNING',stale);
        problem('backup-failure',backup.consecutiveFailures>=3?'CRITICAL':'WARNING',backup.consecutiveFailures>0);
        problem('pm2-unavailable','CRITICAL',pm2Required&&pm2.status!=='online');
        problem('repeated-crash','CRITICAL',pm2Required&&restart.active);
        problem('nginx-failure','CRITICAL',nginx===false);
        problem('slow-health','WARNING',slowSamples>=3);
        problem('runtime-stale','WARNING',runtimeRequired&&(!runtimeFresh||runtime?.monitoringAvailable!==true));
        problem('certificate-expiring',certificate?.ok?'WARNING':'CRITICAL',certificate&&(!certificate.ok||certificate.daysRemaining<=integer(env,'CERT_WARN_DAYS',30,1,90)));
        if(runtimeFresh){
            problem('cpu-high','WARNING',runtime.cpuHighSamples>=3);problem('memory-high','WARNING',runtime.memoryHighSamples>=3);problem('event-loop-lag','WARNING',runtime.loopHighSamples>=3);
            for(const [name,key,setting,limit,severity]of [['error-burst','errors','MONITOR_ERROR_BURST_COUNT',10,'CRITICAL'],['storage-burst','storage','MONITOR_STORAGE_BURST_COUNT',3,'CRITICAL'],['provider-burst','provider','MONITOR_PROVIDER_BURST_COUNT',5,'WARNING'],['payment-burst','payment','MONITOR_PAYMENT_BURST_COUNT',3,'CRITICAL'],['admin-auth-burst','adminAuth','MONITOR_AUTH_BURST_COUNT',10,'WARNING']])problem(name,severity,runtime.counts?.[key]>=integer(env,setting,limit,1,1000000));
        }
        let alertFailure=false;
        for(const condition of conditions){const outcome=notifyAlert(condition,active.get(condition)||'WARNING',active.has(condition),{env,state,now});if(outcome?.status==='unavailable')alertFailure=true;}
        const status=active.size||alertFailure?'degraded':'ok',critical=[...active.values()].includes('CRITICAL');
        const result={time:new Date(now).toISOString(),status,health:health.ok,ready:ready.ok,nginx:publicHealth?.ok??null,nginxService:nginx,storage,pm2:pm2.status,restarts:pm2.restarts,restartsLast30Minutes:restart.count,
            freeBytes:disk.freeBytes,diskPercent:disk.usedPercent,diskStatus:disk.status,backup:{...backup,available:backupAvailable,stale},runtimeFresh,
            responseMs:{health:health.durationMs,ready:ready.durationMs,public:publicHealth?.durationMs??null},certificate:certificate?{ok:certificate.ok,daysRemaining:certificate.daysRemaining}:null,
            problems:[...active].map(([condition,severity])=>({condition,severity})),alertDelivery:alertFailure?'unavailable':'ok'};
        state.update('monitor',()=>({...result,pm2Baseline:{restarts:pm2.restarts,at:now},restartSamples:restart.samples,slowSamples,certificate}));
        return {...result,exitCode:critical||alertFailure?2:active.size?1:0};
    }finally{release();}
}
async function main(){
    try{
        if(fs.existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
        if(process.argv.length!==2)throw Error('MONITOR_ARGUMENTS_INVALID');
        const result=await run();console.log(JSON.stringify(result));process.exitCode=result.exitCode;
    }catch{log.write('monitoring-unavailable',{category:'monitoring',level:'error'});console.log(JSON.stringify({status:'failed',exitCode:2}));process.exitCode=2;}
}
if(require.main===module)main();
module.exports={run,healthUrl,probeHealth,storageAccess,pm2Status,nginxStatus,certificateExpiry,restartWindow};
