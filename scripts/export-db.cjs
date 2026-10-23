'use strict';
try {
    const args=process.argv.slice(2);
    if(args.length!==4||args[0]!=='--source'||args[2]!=='--target')throw Object.assign(new Error('Use --source REHEARSAL.sqlite --target NEW-PRIVATE.json.'),{code:'EXPORT_ARGUMENTS'});
    const report=require('../storage/migration/export.cjs').exportRehearsal(args[1],args[3]);console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({ok:false,code:/^[A-Z0-9_]{1,50}$/.test(error.code||'')?error.code:'EXPORT_FAILED'}));process.exitCode=1;}
