'use strict';
const fs=require('node:fs'),path=require('node:path');
const {alert}=require('./ops-alert.cjs');
function threshold(name,fallback,env){const value=env[name]===undefined?fallback:Number(env[name]);if(!Number.isInteger(value)||value<1||value>99)throw Error(`Invalid ${name}.`);return value;}
function check(folder,{env=process.env,statfs=fs.statfsSync}={}){
    const warning=threshold('DISK_WARN_PERCENT',80,env),critical=threshold('DISK_CRITICAL_PERCENT',90,env);
    if(warning>=critical)throw Error('Disk warning threshold must be below critical threshold.');
    const stat=statfs(folder),total=stat.blocks*stat.bsize,free=stat.bavail*stat.bsize;
    if(total<=0)throw Error('Disk capacity unavailable.');
    const usedPercent=Math.floor((1-free/total)*100+1e-8);
    return {usedPercent,freeBytes:free,status:usedPercent>=critical?'critical':usedPercent>=warning?'warning':'ok'};
}
if(require.main===module){try{const result=check(path.resolve(process.argv[2]||process.cwd()));console.log(JSON.stringify(result));if(result.status==='critical'){alert('disk-critical');process.exitCode=2;}else if(result.status==='warning')process.exitCode=1;}catch{console.error('Disk check failed.');process.exitCode=2;}}
module.exports={check};
