const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const files=['server.js','script.js',...['lib','js','scripts','tests'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(f=>/\.(c?js)$/.test(f)).map(f=>dir+'/'+f))];
for(const file of files){const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});if(result.status){process.stderr.write(result.stderr);process.exit(1);}}
for(const file of ['index.html','product.html','cart.html','checkout.html','admin.html','profile.html']) {
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
