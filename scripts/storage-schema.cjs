'use strict';
const path=require('node:path');
const {newTarget}=require('../storage/migration/target.cjs');
const {openRehearsal}=require('../storage/migration/sqlite.cjs');
try {
    const args=process.argv.slice(2);
    if(args.length!==3||args[0]!=='--target'||args[2]!=='--apply')throw Object.assign(new Error('Use --target NEW.sqlite --apply. This creates only a new rehearsal database.'),{code:'SCHEMA_ARGUMENTS'});
    newTarget(path.resolve(args[1]),null,staged=>{const store=openRehearsal(staged,{initialize:true});try{if(!store.ready())throw Error('Schema readiness failed.');}finally{store.close();}});
    console.log(JSON.stringify({ok:true,format:'web2-normalized/v1',schemaVersion:1}));
} catch(error){console.error(JSON.stringify({ok:false,code:/^[A-Z0-9_]{1,50}$/.test(error.code||'')?error.code:'SCHEMA_FAILED'}));process.exitCode=1;}
