'use strict';
const {createState,backupSummary}=require('./ops-state.cjs'),log=require('./operational-log.cjs');
const {notify}=require('../scripts/ops-alert.cjs');
function record({ok,bytes,snapshot},{state,env=process.env,now=Date.now()}={}){
    try{
        state=state||createState({env});
        const value=state.update('backup',old=>{
            const previous=backupSummary(old),at=new Date(now).toISOString();
            return ok?{...previous,lastSuccessAt:at,bytes,integrity:'ok',consecutiveFailures:0,snapshot}:{...previous,snapshot:old?.snapshot,lastFailureAt:at,consecutiveFailures:Math.min(100000,previous.consecutiveFailures+1)};
        });
        log.write(ok?'backup-success':'backup-failure',{category:'backup',level:ok?'info':'error'});
        notify('backup-failure',value.consecutiveFailures>=3?'CRITICAL':'WARNING',!ok,{state,env,now});
        return value;
    }catch{log.write('monitoring-unavailable',{category:'monitoring',level:'warn'});return null;}
}
module.exports={record};
