const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--production'))throw Error('Use --production to check only the active application.');
function sources(folder){return fs.readdirSync(path.join(root,folder),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()&&entry.name!=='node_modules'?sources(folder+'/'+entry.name):entry.isFile()&&/\.(c?js|jsx)$/.test(entry.name)&&!entry.name.endsWith('.jsx')?[folder+'/'+entry.name]:[]);}
const files=['server.js','script.js',...['lib','js','scripts','tests'].flatMap(dir=>sources(dir))];
files.push(...sources('storage'),...sources('deploy'));
if(!args.includes('--production'))files.push(...sources('backend/src'),'gaming-store/backend/server.js');
for(const file of files){const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});if(result.status){process.stderr.write(result.stderr);process.exit(1);}}
for(const file of ['index.html','product.html','catalog.html','404.html','cart.html','checkout.html','admin.html','admin-login.html','profile.html']) {
    const html=fs.readFileSync(path.join(root,file),'utf8');
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    const scripts=[...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(m=>m[1]);
    if(new Set(scripts).size!==scripts.length)throw Error('Duplicate script includes: '+file);
    if(new Set(ids).size!==ids.length)throw Error('Duplicate element IDs: '+file);
    if(/<script(?![^>]*\bsrc=)[^>]*>\s*\S/.test(html))throw Error('Inline script conflicts with CSP: '+file);
    for(const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
        const ref=match[1];if(/^(https?:|mailto:|data:|\/)/.test(ref))continue;
        if(!fs.existsSync(path.join(root,ref)))throw Error(`Broken local reference ${file}: ${ref}`);
    }
}
console.log('JavaScript syntax, page IDs, CSP script compatibility and local asset/page references passed.');
