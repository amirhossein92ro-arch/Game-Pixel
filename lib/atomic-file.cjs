'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function syncDirectory(directory) {
    // Windows does not support opening a directory for fsync through Node.
    if (process.platform === 'win32') return;
    const fd = fs.openSync(directory, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function publishFile(staged, target) {
    if (path.dirname(path.resolve(staged)) !== path.dirname(path.resolve(target))) throw Error('Atomic publication requires the same directory.');
    if (!fs.lstatSync(staged).isFile()) throw Error('Staged file must be a regular file.');
    const fd = fs.openSync(staged, 'r+');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(staged, target);
    syncDirectory(path.dirname(target));
}
function atomicWriteJson(filename, value, validate = () => {}, {expectedContents} = {}) {
    validate(value);
    const serialized = JSON.stringify(value, null, 2) + '\n';
    validate(JSON.parse(serialized));
    const target = path.resolve(filename), directory = path.dirname(target);
    const staged = path.join(directory, '.' + path.basename(target) + '-' + crypto.randomUUID() + '.tmp');
    const lock=path.join(directory,'.'+path.basename(target)+'.write-lock');
    let fd, owned = false, lockFd;
    try {
        try{lockFd=fs.openSync(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Object.assign(new Error('File update already in progress; inspect stale locks after a stopped writer.'),{code:'STORAGE_BUSY',status:503});throw error;}
        fd = fs.openSync(staged, 'wx', 0o600); owned = true;
        fs.writeFileSync(fd, serialized, 'utf8'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
        // Offline seed tools must refuse to replace a source changed since it was read.
        if (expectedContents !== undefined && fs.readFileSync(target, 'utf8') !== expectedContents) throw Error('Source changed during update.');
        publishFile(staged, target); owned = false;
    } finally {
        if (fd !== undefined) fs.closeSync(fd);
        if (owned) fs.unlinkSync(staged);
        if(lockFd!==undefined){fs.closeSync(lockFd);fs.unlinkSync(lock);}
    }
}
module.exports = {atomicWriteJson, publishFile, syncDirectory};
