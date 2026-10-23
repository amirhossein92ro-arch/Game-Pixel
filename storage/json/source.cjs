'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const {TextDecoder} = require('node:util');
const MAX_BYTES = 64 * 1024 * 1024;
// Read-only legacy adapter: never becomes the live store, never rewrites data.json.
function readSource(filename) {
    const descriptor = fs.openSync(filename,fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
        const before = fs.fstatSync(descriptor);
        if (!before.isFile() || before.size > MAX_BYTES) throw Object.assign(new Error('Source must be a regular JSON file within the 64 MiB offline limit.'),{code:'IMPORT_SOURCE'});
        const bytes = fs.readFileSync(descriptor), after = fs.fstatSync(descriptor);
        if (bytes.length > MAX_BYTES || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw Object.assign(new Error('Source changed during reading.'),{code:'IMPORT_SOURCE_CHANGED'});
        let data;
        try { data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'')); }
        catch { throw Object.assign(new Error('Source is not valid UTF-8 JSON.'),{code:'IMPORT_JSON'}); }
        return Object.freeze({data,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
    } finally { fs.closeSync(descriptor); }
}
module.exports = {readSource};
