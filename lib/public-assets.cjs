'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

function publicAsset(root, extensions, files) {
    const resolvedRoot = fs.realpath(root);
    return async (req,res,next) => {
        let decoded;
        try {decoded=decodeURIComponent(req.path);} catch {return res.status(404).end();}
        if (/[\\\u0000-\u001f\u007f]/.test(decoded)
            || decoded.split('/').slice(1).some(part=>!part||part.startsWith('.'))
            || !extensions.includes(path.extname(decoded).toLowerCase())
            || /(?:backup|\.map$)/i.test(decoded) || files&&!files.has(decoded.toLowerCase())) return res.status(404).end();
        try {
            const [base,filename]=await Promise.all([resolvedRoot,fs.realpath(path.join(root,decoded.slice(1)))]);
            const relative=path.relative(base,filename);
            if (!relative || relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)
                || !(await fs.stat(filename)).isFile()) return res.status(404).end();
            next();
        } catch {res.status(404).end();}
    };
}
module.exports={publicAsset};
