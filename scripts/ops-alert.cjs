'use strict';
const path=require('node:path'),{execFileSync}=require('node:child_process');
const {createState,conditions,integer}=require('../lib/ops-state.cjs'),log=require('../lib/operational-log.cjs');
function notify(condition,severity,active,{env=process.env,state,now=Date.now(),deliver,allowDelivery=true}={}){
    if(!conditions.includes(condition)||!['WARNING','CRITICAL'].includes(severity))return {status:'ignored'};
    try{
        state=state||createState({env});
        const cooldown=integer(env,'OPS_ALERT_COOLDOWN_SECONDS',1800,60,86400)*1000;
        let notification=null;
        state.update('alert-'+condition,old=>{
            const previous=old&&typeof old==='object'?old:{};
            const next={active:!!active,severity,lastAlertAt:Number(previous.lastAlertAt)||0,notified:!!previous.notified};
            const escalation=severity==='CRITICAL'&&previous.severity==='WARNING';
            if(active&&allowDelivery&&(!next.lastAlertAt||now-next.lastAlertAt>=cooldown||escalation)){
                notification={condition,severity,state:'problem'};next.lastAlertAt=now;next.notified=true;
            }else if(!active&&previous.active&&previous.notified&&allowDelivery){
                notification={condition,severity:'INFO',state:'recovery'};next.notified=false;
            }
            if(!active&&!previous.active&&!old)return undefined;
            return next;
        });
        if(!notification)return {status:'suppressed'};
        log.write('ops-alert',{...notification,level:notification.severity==='CRITICAL'?'error':notification.severity==='WARNING'?'warn':'info',category:'alert'});
        if(deliver)deliver(notification);
        else if(env.OPS_ALERT_HOOK){
            if(!path.isAbsolute(env.OPS_ALERT_HOOK))throw Error('Invalid hook.');
            const event=condition==='disk'?'disk-'+(severity==='CRITICAL'?'critical':'warning'):condition;
            execFileSync(env.OPS_ALERT_HOOK,[event,notification.severity,notification.state],{timeout:2000,stdio:'ignore',windowsHide:true,
                env:{PATH:process.env.PATH||'',...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{})}});
        }
        return {status:'sent',notification};
    }catch{log.write('alert-hook-failed',{level:'warn',category:'alert'});return {status:'unavailable'};}
}
function alert(event,options={}){
    const mapped={'backup-failure':['backup-failure','WARNING'],'health-failure':['health-failure','CRITICAL'],'disk-critical':['disk','CRITICAL'],'repeated-crash':['repeated-crash','CRITICAL']}[event];
    return mapped?notify(mapped[0],mapped[1],true,options):{status:'ignored'};
}
module.exports={alert,notify};
