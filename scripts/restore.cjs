'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {verify}=require('./backup.cjs');
function restore(backup,target,{offline=false}={}){
    if(!offline)throw Error('Stop the application and pass --offline-confirmed before restoring.');
    if(!backup||!target)throw Error('Backup and target paths are required.');
    backup=path.resolve(backup);target=path.resolve(target);
    if(backup===target||!fs.existsSync(backup)||!fs.existsSync(target)||!fs.lstatSync(backup).isFile()||!fs.lstatSync(target).isFile())throw Error('Backup and existing target must be distinct regular files.');
    verify(backup);verify(target);
    const suffix=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex');
    const safety=target+'.safety-'+suffix+'.sqlite',staged=target+'.restore-'+suffix+'.tmp',parked=target+'.pre-restore-'+suffix;
    const db=new DatabaseSync(target);
    try{const checkpoint=db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();if(Object.values(checkpoint)[0]!==0)throw Error('Database is busy; stop all writers.');db.prepare('VACUUM INTO ?').run(safety);}finally{db.close();}
    verify(safety);fs.chmodSync(safety,0o600);
    fs.copyFileSync(backup,staged,fs.constants.COPYFILE_EXCL);verify(staged);fs.chmodSync(staged,0o600);
    fs.renameSync(target,parked);
    try{fs.renameSync(staged,target);verify(target);}catch(error){
        if(fs.existsSync(target))fs.renameSync(target,staged);
        fs.renameSync(parked,target);throw error;
    }
    console.log(JSON.stringify({status:'ok',safety:path.basename(safety),previous:path.basename(parked)}));
    return {safety,parked};
}
if(require.main===module){
    try{const args=process.argv.slice(2),get=name=>{const at=args.indexOf(name);return at>=0?args[at+1]:null;};
        restore(get('--backup'),get('--target'),{offline:args.includes('--offline-confirmed')});
    }catch(error){console.error(`Restore failed: ${error.message}`);process.exitCode=1;}
}
module.exports={restore};
