'use strict';
// Allowlisted source transfer only. Never reads .env, live SQLite, or local backups.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {lockfile,assets,secretScan}=require('./release-check.cjs');
const root=path.resolve(__dirname,'..');
const topFiles=['package.json','package-lock.json','.env.example','README.md','server.js','script.js','products.js','style.css',
    'index.html','catalog.html','404.html','product.html','cart.html','checkout.html','profile.html','admin.html','admin-login.html'];
const directories={lib:/\.cjs$/,storage:/\.(?:cjs|json|sql)$/,scripts:/\.(?:cjs|ps1|sh)$/,tests:/\.(?:cjs|json)$/,deploy:/\.(?:cjs|example|md)$/,js:/\.js$/,css:/\.css$/,img:/\.(?:png|jpe?g|webp|gif|svg|avif|ico)$/i};
const excluded=part=>part.startsWith('.')||/^(?:node_modules|coverage|dist|backups?|logs?)$/i.test(part)||/\.(?:log|sqlite(?:-wal|-shm)?|db|bak|pem|key|pfx|p12|map)$/i.test(part);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function allowed(name){
    if(topFiles.includes(name)||name==='data.json')return true;
    const parts=name.split('/'),filter=directories[parts[0]];
    return parts.length>1&&!!filter&&parts.every(part=>!excluded(part))&&filter.test(parts.at(-1));
}
function list(directory){
    const files=[];
    for(const name of topFiles){if(!fs.lstatSync(path.join(directory,name)).isFile())throw Error('RELEASE_FILE_INVALID');files.push(name);}
    function walk(folder,filter){
        for(const item of fs.readdirSync(path.join(directory,folder),{withFileTypes:true})){
            if(excluded(item.name))continue;
            if(item.isSymbolicLink())throw Error('RELEASE_LINK_NOT_ALLOWED');
            const name=folder+'/'+item.name;
            if(item.isDirectory())walk(name,filter);else if(item.isFile()&&filter.test(item.name))files.push(name);
        }
    }
    for(const [folder,filter]of Object.entries(directories))walk(folder,filter);
    return files.sort();
}
function stage(directory,destination){
    directory=fs.realpathSync(directory);destination=path.resolve(destination);
    const relative=path.relative(directory,destination);
    if(relative===''||relative==='..'||relative.startsWith('..'+path.sep))throw Error('STAGE_MUST_BE_INSIDE_WORKSPACE');
    if(!lockfile(directory)||assets(directory).status!=='pass'||secretScan(directory).status!=='pass')throw Error('RELEASE_SOURCE_CHECK_FAILED');
    const files=list(directory),seed=JSON.parse(fs.readFileSync(path.join(directory,'data.json'),'utf8'));
    if(!Array.isArray(seed.products)||!seed.products.length)throw Error('CATALOG_SEED_INVALID');
    fs.mkdirSync(destination,{mode:0o700});
    const manifest={format:1,version:JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8')).version,files:[]};
    for(const name of [...files,'data.json']){
        // Local orders, messages, users, sessions and settings are never a release seed.
        const bytes=name==='data.json'?Buffer.from(JSON.stringify({products:seed.products},null,2)+'\n'):fs.readFileSync(path.join(directory,name));
        const target=path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});
        manifest.files.push({path:name,bytes:bytes.length,sha256:hash(bytes)});
    }
    fs.writeFileSync(path.join(destination,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    verify(destination);return manifest;
}
function verify(directory){
    directory=fs.realpathSync(directory);
    const manifestFile=path.join(directory,'release-manifest.json');if(!fs.lstatSync(manifestFile).isFile())throw Error('MANIFEST_INVALID');
    const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    if(manifest.format!==1||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('MANIFEST_INVALID');
    const expected=new Set(['release-manifest.json']);
    for(const entry of manifest.files){
        if(typeof entry.path!=='string'||!allowed(entry.path)||entry.path.includes('\\')||entry.path.startsWith('/')||entry.path.split('/').some(part=>!part||part==='..'||part==='.')||expected.has(entry.path))throw Error('MANIFEST_PATH_INVALID');
        expected.add(entry.path);
        const file=path.join(directory,entry.path),stat=fs.lstatSync(file);
        if(!stat.isFile()||stat.size!==entry.bytes||hash(fs.readFileSync(file))!==entry.sha256)throw Error('RELEASE_HASH_MISMATCH');
    }
    function walk(folder=''){
        for(const item of fs.readdirSync(path.join(directory,folder),{withFileTypes:true})){
            const name=folder?folder+'/'+item.name:item.name;
            if(item.isSymbolicLink())throw Error('RELEASE_LINK_NOT_ALLOWED');
            if(item.isDirectory())walk(name);else if(!item.isFile()||!expected.delete(name))throw Error('UNEXPECTED_RELEASE_FILE');
        }
    }walk();if(expected.size)throw Error('RELEASE_FILE_MISSING');
    if(!lockfile(directory)||assets(directory).status!=='pass')throw Error('RELEASE_SOURCE_CHECK_FAILED');
    return {status:'ok',version:manifest.version,files:manifest.files.length};
}
if(require.main===module){try{
    const args=process.argv.slice(2);
    if(args.length===2&&args[0]==='--verify'){console.log(JSON.stringify(verify(path.resolve(args[1]))));}
    else if(args.length===2&&args[0]==='--output'){
        const output=path.resolve(root,args[1]),relative=path.relative(path.join(root,'.runtime'),output);
        if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('NEW_RUNTIME_OUTPUT_REQUIRED');
        fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(output,{mode:0o700});
        const source=path.join(output,'source'),manifest=stage(root,source),archive=path.join(output,'web2-release.tgz');
        const packed=spawnSync('tar',['-czf',archive,'-C',source,'.'],{windowsHide:true,stdio:'pipe'});if(packed.status!==0)throw Error('ARCHIVE_FAILED');
        const sha256=hash(fs.readFileSync(archive)),checksum=archive+'.sha256';fs.writeFileSync(checksum,sha256+'  web2-release.tgz\n',{flag:'wx',mode:0o600});
        console.log(JSON.stringify({status:'ok',version:manifest.version,source,archive,checksum,sha256,files:manifest.files.length}));
    }else throw Error('Use --output .runtime/NEW_DIRECTORY or --verify RELEASE_DIRECTORY.');
}catch(error){console.error(JSON.stringify({status:'failed',code:/^[A-Z_]+$/.test(error.message)?error.message:'PACKAGE_RELEASE_FAILED'}));process.exitCode=1;}}
module.exports={stage,verify,list};
