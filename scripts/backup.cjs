'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {publishFile}=require('../lib/atomic-file.cjs');
const root=path.resolve(__dirname,'..');
if(fs.existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
const source=path.resolve(require('../storage/config.cjs').configuration(process.env,root).filename);
const folder=path.resolve(process.env.BACKUP_DIR||(process.platform==='win32'?path.join(os.homedir(),'web2-backups'):'/var/backups/web2'));
const log=require('../lib/operational-log.cjs'),backupStatus=require('../lib/backup-status.cjs');
function verify(filename){
    if(!fs.statSync(filename).size)throw Error('Empty backup.');
    const db=new DatabaseSync(filename,{readOnly:true});
    try{if(db.prepare('PRAGMA integrity_check').all().map(row=>Object.values(row)[0]).join()!=='ok')throw Error('Backup integrity check failed.');
        if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup foreign-key check failed.');
        for(const table of ['accounts','orders','products','settings','audit_logs'])db.prepare(`SELECT count(*) FROM ${table}`).get();
    }finally{db.close();}
}
function safeNumber(name,fallback,min,max){const value=process.env[name]===undefined?fallback:Number(process.env[name]);if(!Number.isSafeInteger(value)||value<min||value>max)throw Error(`Invalid ${name}.`);return value;}
function retain(){
    const daily=safeNumber('BACKUP_DAILY_DAYS',7,1,365),weekly=safeNumber('BACKUP_WEEKLY_WEEKS',4,0,52),now=Date.now();
    const files=fs.readdirSync(folder).filter(name=>/^web2-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{12}\.sqlite$/.test(name)).sort().reverse();
    const weeks=new Set();let kept=0;
    for(const name of files){const file=path.join(folder,name),stat=fs.lstatSync(file);if(!stat.isFile())continue;
        const age=(now-stat.mtimeMs)/86400000,week=Math.floor(age/7);
        if(age<=daily||week<weekly&&week>=0&&!weeks.has(week)||kept<2){weeks.add(week);kept++;continue;}
        fs.unlinkSync(file);
    }
}
function snapshot({retainSnapshots=true}={}){
    if(!fs.existsSync(source))throw Error('Database does not exist.');
    if(!fs.statSync(source).isFile())throw Error('Database must be a regular file.');
    if(folder===root||folder.startsWith(root+path.sep))throw Error('Backup directory must be outside the application directory.');
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    if(!fs.lstatSync(folder).isDirectory())throw Error('Backup directory must be a real directory.');
    const real=fs.realpathSync(folder);if(real===root||real.startsWith(root+path.sep))throw Error('Backup directory resolves inside the application directory.');
    fs.chmodSync(folder,0o700);
    const stamp=new Date().toISOString().replace(/[:.]/g,'-'),name=`web2-${stamp}-${crypto.randomBytes(6).toString('hex')}.sqlite`;
    const target=path.join(folder,name),staged=path.join(folder,'.'+name+'.partial');
    const sourceBytes=fs.statSync(source).size,space=fs.statfsSync(folder);
    const minFree=safeNumber('BACKUP_MIN_FREE_MB',512,0,1048576)*1048576;
    if(space.bavail*space.bsize<Math.max(minFree,sourceBytes*2))throw Error('Insufficient free space for backup.');
    const previous=fs.readdirSync(folder).filter(file=>/^web2-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{12}\.sqlite$/.test(file)).sort().at(-1);
    const previousBytes=previous?fs.statSync(path.join(folder,previous)).size:0;
    try{
        const db=new DatabaseSync(source,{readOnly:true});
        try{db.prepare('VACUUM INTO ?').run(staged);}finally{db.close();}
        fs.chmodSync(staged,0o600);verify(staged);
        const bytes=fs.statSync(staged).size;
        const maxMb=safeNumber('BACKUP_MAX_SIZE_MB',2048,1,1048576);
        if(bytes>maxMb*1048576)throw Error('Backup exceeds configured size limit.');
        const hash=crypto.createHash('sha256').update(fs.readFileSync(staged)).digest('hex');
        publishFile(staged,target);if(retainSnapshots)retain();
        backupStatus.record({ok:true,bytes,snapshot:name});
        if(previousBytes&&bytes>previousBytes*3)log.write('backup-growth',{level:'warn',category:'backup'});
        console.log(JSON.stringify({status:'ok',backup:name,bytes,sha256:hash}));return target;
    }catch(error){if(fs.existsSync(staged))fs.unlinkSync(staged);throw error;}
}
function backup(options){try{return snapshot(options);}catch(error){backupStatus.record({ok:false});throw error;}}
if(require.main===module){try{const args=process.argv.slice(2);if(args.length>1||args.length===1&&args[0]!=='--no-retention')throw Error('Invalid arguments.');backup({retainSnapshots:!args.includes('--no-retention')});}catch{log.write('backup-failure',{level:'error',category:'backup'});process.exitCode=1;}}
module.exports={backup,verify};
