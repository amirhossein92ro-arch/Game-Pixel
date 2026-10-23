'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..');

async function launch(t,{production=false,hstsMaxAge='0'}={}) {
    const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
    const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'web2-phase19-')),database=path.join(directory,'test.sqlite'),seed=path.join(directory,'seed.json'),preload=path.join(directory,'preload.cjs');
    fs.writeFileSync(seed,JSON.stringify({products:[{id:'fixture-item',name:'Audit fixture',price:10000,stock:20,status:'active',category:'Audit'}]}));
    // Pause exactly one password operation after real bcrypt finishes. No HTTP test hook exists.
    fs.writeFileSync(preload,`process.loadEnvFile=()=>{};const passwords=require(${JSON.stringify(path.join(root,'lib/passwords.cjs'))});let next=null;const gates=new Map();
process.on('message',message=>{if(message.type==='arm'){let release;const promise=new Promise(resolve=>release=resolve);next={id:message.id,operation:message.operation,promise};gates.set(message.id,release);process.send({id:message.id,type:'armed'});}else if(message.type==='release'){gates.get(message.id)?.();gates.delete(message.id);process.send({id:message.id,type:'released'});}});
for(const operation of ['compare','hash']){const original=passwords[operation];passwords[operation]=async(...args)=>{const gate=next?.operation===operation?next:null;if(gate)next=null;const result=await original(...args);if(gate){process.send({id:gate.id,type:'paused'});await gate.promise;}return result;};}`);
    const base='http://127.0.0.1:'+port,origin=production?'https://shop.example.invalid':base;
    const child=spawn(process.execPath,['--require',preload,'server.js'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,
        NODE_ENV:production?'production':'test',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:origin,ALLOWED_ORIGINS:'',TRUST_PROXY:production?'loopback':'',
        HSTS_MAX_AGE:hstsMaxAge,
        STORAGE_DRIVER:'sqlite',DATABASE_PATH:database,SQLITE_PATH:database,SEED_DATA_PATH:seed,ADMIN_USERNAME:'audit-admin',ADMIN_PASSWORD:'Defensive audit administrator 2026!',
        ADMIN_TOTP_SECRET:'',ACCOUNT_TOTP_KEY:crypto.randomBytes(32).toString('hex'),CAPTCHA_PROVIDER:'turnstile',CAPTCHA_TEST_MODE:production?'false':'true',
        TURNSTILE_SITE_KEY:'',TURNSTILE_SECRET_KEY:'',CAPTCHA_SITE_KEY:'',CAPTCHA_SECRET_KEY:'',SMS_PROVIDER:production?'generic':'mock',SMS_API_KEY:'synthetic-only-key',
        SMS_API_URL:'https://sms.example.invalid/send',PAYMENT_MODE:'test'}});
    let stdout='',stderr='';const connections=[];child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr+=value);
    t.after(async()=>{
        for(const db of connections)db.close();
        if(child.exitCode===null&&child.signalCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}
        if(path.dirname(fs.realpathSync(directory))!==fs.realpathSync(os.tmpdir())||!path.basename(directory).startsWith('web2-phase19-'))throw Error('Unsafe security test cleanup.');
        fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    });
    await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Isolated security server did not start.')),20000);
        child.once('exit',()=>{clearTimeout(timer);reject(Error('Isolated security server exited before startup.'));});
        child.stdout.on('data',()=>{if(stdout.includes('Server is running')){clearTimeout(timer);resolve();}});
    });
    let gateId=0;const waits=new Map();
    child.on('message',message=>{const key=message.type+':'+message.id,wait=waits.get(key);if(wait){clearTimeout(wait.timer);waits.delete(key);wait.resolve();}});
    const wait=(type,id)=>new Promise((resolve,reject)=>{const key=type+':'+id,timer=setTimeout(()=>{waits.delete(key);reject(Error('Password gate timed out: '+type));},20000);waits.set(key,{resolve,timer});});
    async function gate(operation='compare') {
        const id=++gateId,armed=wait('armed',id),paused=wait('paused',id);child.send({type:'arm',operation,id});await armed;
        return {paused,async release(){const released=wait('released',id);child.send({type:'release',id});await released;}};
    }
    function client() {return {cookie:'',csrf:'',async call(url,method='GET',body,headers={}) {
        const requestHeaders={Origin:origin,...(production?{'X-Forwarded-Proto':'https'}:{}),...(this.cookie?{Cookie:this.cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':this.csrf}),...headers};
        for(const [key,value]of Object.entries(requestHeaders))if(value==null)delete requestHeaders[key];
        const response=await fetch(base+url,{method,redirect:'manual',signal:AbortSignal.timeout(20000),headers:requestHeaders,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
        const cookies=response.headers.getSetCookie();if(cookies.length){const jar=new Map(this.cookie.split('; ').filter(Boolean).map(cookie=>cookie.split('=')));for(const cookie of cookies){const [name,...value]=cookie.split(';')[0].split('=');if(value.join('='))jar.set(name,value.join('='));else jar.delete(name);}this.cookie=[...jar].map(([name,value])=>name+'='+value).join('; ');}
        const raw=await response.text(),data=/application\/json/.test(response.headers.get('Content-Type')||'')?JSON.parse(raw):raw;
        if(data?.csrfToken)this.csrf=data.csrfToken;return {status:response.status,response,raw,data};
    }};}
    async function register(client,index=1) {const fields={name:'Audit buyer '+index,email:'phase19-'+index+'@example.invalid',phone:'0912000'+String(index).padStart(4,'0'),password:'Defensive customer phrase 2026!',captchaToken:'test-valid-captcha'};const result=await client.call('/api/auth/register','POST',fields);if(result.status!==201)throw Error('Security fixture registration failed ('+result.status+').');return {...fields,id:result.data.user.id};}
    async function admin(client) {const result=await client.call('/api/admin/login','POST',{username:'audit-admin',password:'Defensive audit administrator 2026!',captchaToken:'test-valid-captcha'});if(result.status!==200)throw Error('Security fixture administrator login failed ('+result.status+').');return result.data;}
    return {base,origin,directory,database,client,register,admin,gate,openDatabase:()=>{const db=new DatabaseSync(database);connections.push(db);return db;},logs:()=>stdout+'\n'+stderr};
}
module.exports={launch};
