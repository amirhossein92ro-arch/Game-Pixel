'use strict';
const fs=require('node:fs'),path=require('node:path');
const {performance,monitorEventLoopDelay}=require('node:perf_hooks');
const log=require('./operational-log.cjs');
const {createState,integer,backupSummary,timestamp,finite}=require('./ops-state.cjs');
const keys=['errors','storage','provider','payment','adminAuth'];
function category(error,status=500){
    const code=String(error?.code||'');
    if(code==='STORAGE_CONFLICT'||status===409)return 'conflict';
    if(code==='STORAGE_VALIDATION'||status===400||status===422)return 'validation';
    if(/^(STORAGE_|SQLITE_|ENOSPC$|EIO$|EACCES$)/.test(code)||error?.errcode)return 'storage';
    if(/^(SMS_|CAPTCHA_|PAYMENT|ECONN|ETIMEDOUT)/.test(code)||[502,504].includes(status))return 'provider';
    if([401,403,429].includes(status))return 'auth';
    return status>=500?'unexpected':'request';
}
function readiness(store,{filename,now=Date.now,ttl=2000,onFailure=()=>{}}={}){
    let checked=-Infinity,ok=false;
    return ()=>{
        const at=now();if(at-checked<ttl)return ok;checked=at;
        try{
            if(filename){if(!fs.statSync(filename).isFile())throw Error('Storage unavailable.');fs.accessSync(filename,fs.constants.R_OK|fs.constants.W_OK);fs.accessSync(path.dirname(filename),fs.constants.R_OK|fs.constants.W_OK);}
            ok=store.ready()===true;
            if(!ok)throw Error('Storage unavailable.');
        }catch(error){ok=false;onFailure(error);}
        return ok;
    };
}
// Fixed five-minute ring: no identity, URL, request body or per-client key.
function counters({now=Date.now}={}){
    const buckets=Array.from({length:5},()=>({minute:-1,counts:Object.fromEntries(keys.map(key=>[key,0]))}));
    function record(key){if(!keys.includes(key))return;const minute=Math.floor(now()/60000),bucket=buckets[minute%5];if(bucket.minute!==minute){bucket.minute=minute;for(const name of keys)bucket.counts[name]=0;}bucket.counts[key]=Math.min(1000000,bucket.counts[key]+1);}
    function totals(){const minute=Math.floor(now()/60000);return Object.fromEntries(keys.map(key=>[key,buckets.reduce((sum,b)=>sum+(b.minute<=minute&&b.minute>minute-5?b.counts[key]:0),0)]));}
    return {record,totals};
}
function createMonitoring({env=process.env,state,now=Date.now,clock=()=>performance.now(),cpu=()=>process.cpuUsage(),memory=()=>process.memoryUsage(),loopFactory=monitorEventLoopDelay}={}){
    const counts=counters({now});let timer,histogram,unsubscribe,previousCpu=cpu(),previousTime=clock(),lastWarning=-Infinity,available=true;
    let sample={cpuPercent:0,rssBytes:0,heapBytes:0,eventLoopMs:0,cpuHighSamples:0,memoryHighSamples:0,loopHighSamples:0};
    const version=require('../package.json').version;
    const unavailable=()=>{available=false;if(now()-lastWarning>=60000){lastWarning=now();log.write('monitoring-unavailable',{level:'warn',category:'monitoring'});}};
    let config;
    try{config={cpu:integer(env,'MONITOR_CPU_WARN_PERCENT',85,1,100),memory:integer(env,'MONITOR_MEMORY_WARN_MB',384,16,65536)*1048576,loop:integer(env,'MONITOR_LOOP_WARN_MS',500,100,60000),slow:integer(env,'MONITOR_SLOW_REQUEST_MS',2000,500,60000)};state=state||createState({env});}catch{unavailable();config={cpu:85,memory:384*1048576,loop:500,slow:2000};}
    function error(req,error,status=500){
        const kind=category(error,status);if(req)req.operationalCategory=kind;
        if(req?.operationalErrorLogged)return;
        if(req)req.operationalErrorLogged=true;
        if(status>=500||!['request','auth','validation','conflict'].includes(kind))log.write('server-error',{level:status>=500?'error':'warn',category:kind,code:error?.code,requestId:req?.requestId,method:req?.method,status});
        // Errors outside requests (maintenance, readiness) still count.
        if(!req){counts.record('errors');if(kind==='storage')counts.record('storage');}
    }
    function observe(req,res,next){
        const started=clock(),originalPath=req.path.toLowerCase().replace(/\/+$/,'');
        res.once('finish',()=>{try{
            const status=res.statusCode,kind=req.operationalCategory||category(null,status),durationMs=clock()-started;
            if(status>=500)counts.record('errors');
            if(status>=500&&kind==='storage')counts.record('storage');
            if(status>=500&&kind==='provider')counts.record('provider');
            if(/^\/api\/payments?\/(?:callback|webhook)$/.test(originalPath)&&status>=400)counts.record('payment');
            if(originalPath==='/api/admin/login'&&[401,403,429].includes(status))counts.record('adminAuth');
            if(status>=500&&!req.operationalErrorLogged)error(req,null,status);
            // Record slow application responses; provider calls are bounded separately.
            if(durationMs>=config.slow&&!['/health','/ready','/api/health'].includes(originalPath))log.write('slow-request',{level:'warn',category:'request',requestId:req.requestId,method:req.method,status,durationMs});
        }catch{unavailable();}});next();
    }
    function snapshot(){return {time:new Date(now()).toISOString(),status:'running',version,uptimeSeconds:Math.floor(process.uptime()),monitoringAvailable:available,...sample,counts:counts.totals()};}
    function flush(){try{
        if(!state)throw Error('Monitoring unavailable.');
        const current=cpu(),at=clock(),elapsed=Math.max(1,at-previousTime);
        const cpuPercent=Math.max(0,Math.min(10000,((current.user-previousCpu.user)+(current.system-previousCpu.system))/1000/elapsed*100));previousCpu=current;previousTime=at;
        const usage=memory(),eventLoopMs=histogram?Math.max(0,Number(histogram.percentile(99))/1e6):0;
        sample={cpuPercent:Math.round(cpuPercent*10)/10,rssBytes:usage.rss,heapBytes:usage.heapUsed,eventLoopMs:Math.round(eventLoopMs),
            cpuHighSamples:cpuPercent>=config.cpu?Math.min(100,sample.cpuHighSamples+1):0,memoryHighSamples:usage.rss>=config.memory?Math.min(100,sample.memoryHighSamples+1):0,loopHighSamples:eventLoopMs>=config.loop?Math.min(100,sample.loopHighSamples+1):0};
        histogram?.reset();available=true;state.update('runtime',()=>snapshot());
    }catch{unavailable();}}
    function start(){try{
        histogram=loopFactory({resolution:100});histogram.enable();
        unsubscribe=log.subscribe(row=>{if(row.event==='provider-failure')counts.record('provider');if(row.category==='storage'&&row.level==='error'&&row.event!=='server-error'){counts.record('storage');counts.record('errors');}});
        flush();timer=setInterval(flush,60000);timer.unref();
    }catch{unavailable();}}
    function stop(){clearInterval(timer);histogram?.disable();unsubscribe?.();}
    function status(){
        const current=snapshot();let backup=backupSummary(null),monitor=null;
        try{if(!state)throw Error('Monitoring unavailable.');backup=backupSummary(state.read('backup'));monitor=state.read('monitor');}catch{unavailable();}
        const checkedAt=timestamp(monitor?.time),fresh=checkedAt&&now()-Date.parse(checkedAt)>=0&&now()-Date.parse(checkedAt)<15*60000;
        return {status:available?'running':'degraded',version,uptimeSeconds:current.uptimeSeconds,monitoringAvailable:available,
            memory:{rssBytes:finite(current.rssBytes),heapBytes:finite(current.heapBytes)},cpuPercent:finite(current.cpuPercent),eventLoopMs:finite(current.eventLoopMs),recentCriticalErrors:current.counts.errors,windowMinutes:5,
            backup,checks:{checkedAt,stale:!fresh,disk:fresh&&['ok','warning','critical'].includes(monitor?.diskStatus)?monitor.diskStatus:'unknown',pm2:fresh&&['online','stopped','errored','missing','duplicate','unavailable','skipped','launching','waiting restart'].includes(monitor?.pm2)?monitor.pm2:'unknown'}};
    }
    return {observe,error,start,stop,flush,status,snapshot};
}
module.exports={createMonitoring,readiness,counters,category};
