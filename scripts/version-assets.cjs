'use strict';
const fs=require('node:fs'),path=require('node:path');
const {fingerprint}=require('../lib/asset-cache.cjs');
const root=path.resolve(__dirname,'..');
const pages=['index.html','catalog.html','product.html','404.html','cart.html','checkout.html','profile.html','admin.html','admin-login.html'];
for(const file of pages){
    const filename=path.join(root,file),before=fs.readFileSync(filename,'utf8');
    const after=before.replace(/\b(src|href)="(\/?(?:js\/|css\/)?[a-zA-Z0-9_-]+\.(?:js|css))(?:\?[^"#]*)?"/g,(match,attribute,url)=>{
        const target=path.resolve(root,url.replace(/^\//,''));
        if(path.relative(root,target).startsWith('..')||!fs.existsSync(target))throw Error('Invalid asset: '+url);
        return `${attribute}="${url}?v=${fingerprint(fs.readFileSync(target))}"`;
    });
    if(after!==before)fs.writeFileSync(filename,after);
}
console.log('Updated content fingerprints in '+pages.length+' HTML pages.');
