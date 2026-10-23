'use strict';
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
function assertRuntimeFormat(filename) {
    if(filename===':memory:'||!fs.existsSync(filename)||!fs.statSync(filename).size)return;
    const probe=new DatabaseSync(filename,{readOnly:true});
    try {
        if(probe.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='migration_readiness_meta'").get())throw Object.assign(new Error('A rehearsal database cannot be used as runtime storage.'),{code:'STORAGE_FORMAT_UNSUPPORTED'});
    } finally {probe.close();}
}
module.exports={assertRuntimeFormat};
