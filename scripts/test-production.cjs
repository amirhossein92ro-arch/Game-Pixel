'use strict';
// Archived applications have separate dependencies and are never shipped to the VPS.
// All active suites still run with disposable storage and synthetic configuration.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function productionTests(directory=root){
    return fs.readdirSync(path.join(directory,'tests')).filter(name=>name.endsWith('.test.cjs')&&name!=='legacy-security.test.cjs').sort().map(name=>'tests/'+name);
}
if(require.main===module){
    if(process.argv.length!==2)throw Error('Arguments are not supported.');
    const files=productionTests();if(!files.length)throw Error('Active application tests are missing.');
    const result=spawnSync(process.execPath,['--require','./tests/helpers/isolated-environment.cjs','--test','--test-concurrency=1',...files],{cwd:root,stdio:'inherit',windowsHide:true});
    process.exitCode=result.status??1;
}
module.exports={productionTests};
