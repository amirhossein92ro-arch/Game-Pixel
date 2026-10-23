'use strict';
const path=require('node:path');
function main(args=process.argv.slice(2)) {
    const options={dryRun:false},seen=new Set();
    for(let index=0;index<args.length;index++) {
        const arg=args[index];if(seen.has(arg))throw Object.assign(new Error('Duplicate argument.'),{code:'IMPORT_ARGUMENTS'});seen.add(arg);
        if(arg==='--dry-run')options.dryRun=true;
        else if(['--source','--target'].includes(arg)&&args[index+1]&&!args[index+1].startsWith('--'))options[arg.slice(2)]=path.resolve(args[++index]);
        else throw Object.assign(new Error('Use --source file.json --dry-run, or --source file.json --target NEW.sqlite --apply.'),{code:'IMPORT_ARGUMENTS'});
    }
    options.source??=path.join(__dirname,'../data.json');
    const report=require('../storage/migration/import.cjs').importJSON(options);
    console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=2;
}
if(require.main===module){try{
    const args=process.argv.slice(2),apply=args.includes('--apply');
    if(!apply&&!args.includes('--dry-run'))throw Object.assign(new Error('Choose --dry-run or --apply; target databases are never selected automatically.'),{code:'IMPORT_ARGUMENTS'});
    if(apply&&args.includes('--dry-run'))throw Object.assign(new Error('Choose exactly one mode.'),{code:'IMPORT_ARGUMENTS'});
    main(args.filter(arg=>arg!=='--apply'));
}catch(error){console.error(JSON.stringify({ok:false,code:/^[A-Z0-9_]{1,50}$/.test(error.code||'')?error.code:'IMPORT_FAILED'}));process.exitCode=1;}}
module.exports={main};
