'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fingerprint=buffer=>crypto.createHash('sha256').update(buffer).digest('hex').slice(0,16);
function assetCache(root,files,immutable=true){
    // Deployment assets are immutable for the lifetime of the process, like the
    // preloaded HTML templates. Recompute on restart, never in a request handler.
    const versions=new Map(files.map(file=>[path.resolve(root,file),fingerprint(fs.readFileSync(path.join(root,file)))]));
    return (res,filename)=>{
        const version=versions.get(path.resolve(filename));
        const requested=new URL(res.req.originalUrl,'http://localhost').searchParams.get('v');
        res.setHeader('Cache-Control',immutable&&version&&requested===version?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate');
    };
}
module.exports={assetCache,fingerprint};
