'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {syncDirectory}=require('../../lib/atomic-file.cjs');
function canonicalFuturePath(filename) {
    let candidate=path.resolve(filename);const tail=[];
    while(!fs.existsSync(candidate)){const parent=path.dirname(candidate);if(parent===candidate)break;tail.unshift(path.basename(candidate));candidate=parent;}
    return path.join(fs.realpathSync(candidate),...tail);
}
function targetProblem(filename,source) {
    if(typeof filename!=='string'||!filename||filename===':memory:')return 'TARGET_REQUIRED';
    const target=canonicalFuturePath(filename),root=canonicalFuturePath(path.resolve(__dirname,'../..'));
    const same=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
    if(source&&same(target,canonicalFuturePath(source)))return 'SOURCE_TARGET_CONFLICT';
    const active=process.env.SQLITE_PATH||process.env.DATABASE_PATH||path.join(root,'var/web2.sqlite');
    if(same(target,canonicalFuturePath(active)))return 'RUNTIME_TARGET_FORBIDDEN';
    const relative=path.relative(root,target);
    if(!relative.startsWith('..')&&!path.isAbsolute(relative)&&!['.runtime','var'].includes(relative.split(path.sep)[0]))return 'TARGET_NOT_PRIVATE';
    if([target,target+'-wal',target+'-shm',target+'-journal'].some(file=>fs.existsSync(file)))return 'TARGET_EXISTS';
    if(!/\.(sqlite|db)$/i.test(target))return 'TARGET_EXTENSION';
    return null;
}
function newTarget(filename,source,build) {
    const problem=targetProblem(filename,source);if(problem)throw Object.assign(new Error('Import requires a new, private, non-runtime target.'),{code:problem});
    const target=path.resolve(filename),folder=path.dirname(target);
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    const lock=path.join(folder,'.'+path.basename(target)+'.import-lock'),staged=path.join(folder,'.'+path.basename(target)+'-'+crypto.randomUUID()+'.staged');
    let lockFd,owned=false;
    try {
        lockFd=fs.openSync(lock,'wx',0o600);
        if(targetProblem(target,source))throw Object.assign(new Error('Target changed.'),{code:'TARGET_EXISTS'});
        fs.closeSync(fs.openSync(staged,'wx',0o600));owned=true;
        const result=build(staged);
        if([staged+'-wal',staged+'-shm',staged+'-journal'].some(file=>fs.existsSync(file)&&fs.statSync(file).size))throw Object.assign(new Error('Uncheckpointed staging data.'),{code:'STAGING_NOT_CLOSED'});
        const fd=fs.openSync(staged,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
        // An exclusive hard link publishes the fully closed database atomically and cannot replace a target.
        fs.linkSync(staged,target);fs.unlinkSync(staged);owned=false;syncDirectory(folder);
        return result;
    } finally {
        if(owned)for(const file of [staged,staged+'-wal',staged+'-shm',staged+'-journal'])if(fs.existsSync(file))fs.unlinkSync(file);
        if(lockFd!==undefined){fs.closeSync(lockFd);fs.unlinkSync(lock);}
    }
}
module.exports={newTarget,targetProblem,canonicalFuturePath};
