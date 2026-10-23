'use strict';
const fs=require('node:fs'),path=require('node:path');
const {publishFile}=require('./atomic-file.cjs');
const conditions=['health-failure','storage-failure','disk','backup-stale','backup-failure','pm2-unavailable','repeated-crash','cpu-high','memory-high','error-burst','storage-burst','provider-burst','payment-burst','admin-auth-burst','event-loop-lag','slow-health','certificate-expiring','nginx-failure','runtime-stale'];
const names=new Set(['runtime','backup','monitor','last-crash','monitor-run',...conditions.map(value=>'alert-'+value)]);
function integer(env,name,fallback,min,max){const value=env[name]===undefined?fallback:Number(env[name]);if(!Number.isSafeInteger(value)||value<min||value>max)throw Error('MONITOR_CONFIGURATION_INVALID');return value;}
function createState({env=process.env,root=path.resolve(__dirname,'..'),directory}={}){
    const filename=require('../storage/config.cjs').configuration(env,root).filename;
    const configured=directory||env.MONITOR_STATE_DIR;
    if(configured&&!path.isAbsolute(configured))throw Error('MONITOR_PRIVATE_DIRECTORY_REQUIRED');
    const dir=path.resolve(configured||path.join(path.dirname(filename),'monitoring'));
    if([path.parse(dir).root,path.resolve(root),path.resolve(path.dirname(filename))].includes(dir))throw Error('MONITOR_PRIVATE_DIRECTORY_REQUIRED');
    const file=name=>{if(!names.has(name))throw Error('MONITOR_STATE_NAME_INVALID');return path.join(dir,name+'.json');};
    function ensure(){
        fs.mkdirSync(dir,{recursive:true,mode:0o700});const stat=fs.lstatSync(dir);
        if(!stat.isDirectory()||process.platform!=='win32'&&(stat.mode&0o077))throw Error('MONITOR_PRIVATE_DIRECTORY_REQUIRED');
    }
    function read(name){
        const target=file(name);let stat;
        try{const parent=fs.lstatSync(dir);if(!parent.isDirectory()||process.platform!=='win32'&&(parent.mode&0o077))throw Error('MONITOR_STATE_INVALID');stat=fs.lstatSync(target);}catch(error){if(error.code==='ENOENT')return null;throw error;}
        if(!stat.isFile()||stat.size>65536||process.platform!=='win32'&&(stat.mode&0o077))throw Error('MONITOR_STATE_INVALID');
        return JSON.parse(fs.readFileSync(target,'utf8'));
    }
    function lock(name){
        file(name);ensure();const target=path.join(dir,'.'+name+'.lock');
        // A killed writer may leave a lock. Reclaim only a private regular lock
        // whose process is confirmed absent; never steal a live/unknown lock.
        if(fs.existsSync(target)){
            const stat=fs.lstatSync(target);
            if(!stat.isFile()||stat.size>1024)throw Error('MONITOR_STATE_INVALID');
            const owner=JSON.parse(fs.readFileSync(target,'utf8'));
            if(Number.isSafeInteger(owner.pid)&&owner.pid>0){try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')fs.unlinkSync(target);else throw error;}}
        }
        const fd=fs.openSync(target,'wx',0o600);
        try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,time:new Date().toISOString()}));}catch(error){fs.closeSync(fd);fs.unlinkSync(target);throw error;}
        return ()=>{try{fs.closeSync(fd);}finally{fs.unlinkSync(target);}};
    }
    function update(name,fn){
        const release=lock(name),target=file(name),partial=path.join(dir,'.'+name+'.partial');
        try{
            const value=fn(read(name));if(value===undefined)return;
            const contents=JSON.stringify(value)+'\n';if(Buffer.byteLength(contents)>65536)throw Error('MONITOR_STATE_TOO_LARGE');
            if(fs.existsSync(partial)&&!fs.lstatSync(partial).isFile())throw Error('MONITOR_STATE_INVALID');
            fs.writeFileSync(partial,contents,{mode:0o600,flag:'w'});fs.chmodSync(partial,0o600);publishFile(partial,target);return value;
        }finally{release();}
    }
    return {read,update,lock,directory:dir};
}
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))?value:null;
function backupSummary(value){return {lastSuccessAt:timestamp(value?.lastSuccessAt),lastFailureAt:timestamp(value?.lastFailureAt),bytes:finite(value?.bytes),integrity:value?.integrity==='ok'?'ok':'unknown',consecutiveFailures:Math.min(100000,finite(value?.consecutiveFailures)||0)};}
module.exports={createState,conditions,integer,finite,timestamp,backupSummary};
