'use strict';
// Offline transport audit only. No DNS, database, provider or service changes.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{parseEnv}=require('node:util');
const {validateRuntime,originPolicy}=require('../lib/runtime-config.cjs');
const transportNames=['NODE_ENV','HOST','PORT','APP_ORIGIN','TRUST_PROXY','ALLOWED_ORIGINS','HSTS_MAX_AGE'];
function configuration(env,domain,{nodeVersion=process.versions.node}={}){
    const findings=[];
    const add=(code,names=[])=>findings.push({code,names});
    if(typeof domain!=='string'||domain!==domain.toLowerCase()||domain.length>253||net.isIP(domain)||!domain.includes('.')||!domain.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))add('REAL_CANONICAL_DOMAIN_REQUIRED');
    if(env.NODE_ENV!=='production')add('PRODUCTION_MODE_REQUIRED',['NODE_ENV']);
    if(env.HOST!=='127.0.0.1')add('IPV4_LOOPBACK_BIND_REQUIRED',['HOST']);
    if(String(env.PORT)!=='3000')add('UPSTREAM_PORT_MISMATCH',['PORT']);
    if(env.TRUST_PROXY!=='loopback')add('LOCAL_PROXY_TRUST_REQUIRED',['TRUST_PROXY']);
    if(env.APP_ORIGIN!=='https://'+domain)add('APP_ORIGIN_MISMATCH',['APP_ORIGIN']);
    try{
        const policy=originPolicy(env);
        if([...policy.allowedOrigins].some(origin=>origin!=='https://'+domain))add('SAME_ORIGIN_ALLOWLIST_REQUIRED',['ALLOWED_ORIGINS']);
    }catch{add('ORIGIN_POLICY_INVALID',['APP_ORIGIN','ALLOWED_ORIGINS']);}
    try{validateRuntime(env,nodeVersion);}catch{add('RUNTIME_CONFIG_INVALID');}
    return {status:findings.length?'failed':'ok',scope:'offline-https-configuration',findings};
}
function effectiveConfiguration(env,rows,{root=path.resolve(__dirname,'..')}={}){
    const matches=Array.isArray(rows)?rows.filter(row=>row.name==='web2'):[];
    if(matches.length!==1||matches[0].pm2_env?.status!=='online')throw Error('ONE_ONLINE_WEB2_PROCESS_REQUIRED');
    const entry=matches[0].pm2_env;
    if(path.resolve(entry.pm_cwd||'')!==path.resolve(root)||path.resolve(entry.pm_exec_path||'')!==path.join(path.resolve(root),'server.js'))throw Error('PM2_RELEASE_PATH_MISMATCH');
    const effective={...env},mismatches=[];
    for(const name of transportNames){
        const value=entry[name]??entry.env?.[name];
        if(value!==undefined){
            effective[name]=String(value);
            if(String(env[name]??(name==='HSTS_MAX_AGE'?'0':''))!==String(value))mismatches.push(name);
        }
    }
    return {effective,mismatches};
}
if(require.main===module){try{
    const args=process.argv.slice(2);
    if(![4,5].includes(args.length)||args[0]!=='--env-file'||args[2]!=='--domain'||args.length===5&&args[4]!=='--pm2-stdin')throw Error('ARGUMENTS_INVALID');
    const env=parseEnv(fs.readFileSync(args[1],'utf8'));
    let effective=env,mismatches=[];
    if(args[4])({effective,mismatches}=effectiveConfiguration(env,JSON.parse(fs.readFileSync(0,'utf8'))));
    const result=configuration(effective,args[3]);
    if(mismatches.length){result.status='failed';result.findings.push({code:'PM2_ENVIRONMENT_MISMATCH',names:mismatches});}
    console.log(JSON.stringify(result,null,2));if(result.status!=='ok')process.exitCode=1;
}catch(error){console.error(JSON.stringify({status:'failed',scope:'offline-https-configuration',code:/^[A-Z0-9_]+$/.test(error.message)?error.message:'HTTPS_PREFLIGHT_FAILED'}));process.exitCode=1;}}
module.exports={configuration,effectiveConfiguration};
