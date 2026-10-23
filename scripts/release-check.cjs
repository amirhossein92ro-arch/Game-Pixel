'use strict';
// Read-only checks. Never opens the live database, loads .env into process.env,
// contacts a provider, restarts a process or writes a deployment marker.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{parseEnv}=require('node:util');
const {validateRuntime,productionWarnings}=require('../lib/runtime-config.cjs');
const root=path.resolve(__dirname,'..');
function lockfile(directory=root){
    try{
        const {isDeepStrictEqual}=require('node:util');
        const pkg=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8')),lock=JSON.parse(fs.readFileSync(path.join(directory,'package-lock.json'),'utf8')),entry=lock.packages?.[''];
        return lock.lockfileVersion===3&&pkg.version===lock.version&&pkg.version===entry?.version&&pkg.name===lock.name&&pkg.name===entry?.name&&
            ['dependencies','devDependencies','optionalDependencies','engines'].every(name=>isDeepStrictEqual(pkg[name]||{},entry[name]||{}));
    }catch{return false;}
}
const required=['NODE_ENV','HOST','PORT','APP_ORIGIN','TRUST_PROXY','ADMIN_USERNAME','ADMIN_PASSWORD','ACCOUNT_TOTP_KEY','TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','SMS_PROVIDER','SMS_API_KEY','BACKUP_DIR'];
const obsolete=['ALLOW_PRODUCTION_HTTP','DEV_ADMIN_PASSWORD_ENABLED','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','MAIL_FROM','PAYMENT_PROVIDER','PAYMENT_API_KEY','PAYMENT_CALLBACK_URL','DATABASE_URL'];
function environment(env,{production=true,nodeVersion=process.versions.node}={}){
    const findings=[],missing=[];
    if(production){
        for(const name of required)if(!String(env[name]||'').trim())missing.push(name);
        if(!env.DATABASE_PATH&&!env.SQLITE_PATH)missing.push('DATABASE_PATH or SQLITE_PATH');
        if(env.SMS_PROVIDER==='generic'&&!env.SMS_API_URL)missing.push('SMS_API_URL');
        if(env.SMS_PROVIDER==='kavenegar'&&!env.SMS_TEMPLATE_ID&&!env.SMS_TEMPLATE)missing.push('SMS_TEMPLATE_ID');
        if(missing.length)findings.push({severity:'high',code:'MISSING_PRODUCTION_VARIABLES',names:missing});
        if(env.NODE_ENV!=='production')findings.push({severity:'high',code:'PRODUCTION_MODE_REQUIRED',names:['NODE_ENV']});
        if(!['127.0.0.1','::1','localhost'].includes(env.HOST||''))findings.push({severity:'high',code:'LOOPBACK_BIND_REQUIRED',names:['HOST']});
        if(env.TRUST_PROXY!=='loopback')findings.push({severity:'high',code:'LOCAL_PROXY_TRUST_REQUIRED',names:['TRUST_PROXY']});
        if([env.DATABASE_PATH,env.SQLITE_PATH,env.BACKUP_DIR].filter(Boolean).some(value=>!path.isAbsolute(value)))findings.push({severity:'high',code:'ABSOLUTE_STORAGE_PATHS_REQUIRED',names:['DATABASE_PATH','SQLITE_PATH','BACKUP_DIR']});
        for(const code of productionWarnings({...env,NODE_ENV:'production'}))findings.push({severity:code==='CUSTOMER_2FA_UNCONFIGURED'?'medium':'high',code});
    }
    try{validateRuntime(env,nodeVersion);}catch(error){findings.push({severity:'high',code:'RUNTIME_CONFIG_INVALID',names:[...required,'HSTS_MAX_AGE','STORAGE_DRIVER','SQLITE_PATH','DATABASE_PATH','ADMIN_TOTP_SECRET','CAPTCHA_PROVIDER','ALLOWED_ORIGINS','DEV_FRONTEND_ORIGINS','STORE_TIMEZONE','SMS_API_URL','SMS_TEMPLATE_ID'].filter(name=>error.message.includes(name))});}
    return {status:findings.some(f=>f.severity==='high')?'NO-GO':'GO',scope:production?'production-configuration':'local-configuration',missing,unusedVariables:obsolete.filter(name=>Object.hasOwn(env,name)),findings};
}
function assets(directory=root){
    const failures=[];
    for(const page of ['index.html','catalog.html','404.html','product.html','cart.html','checkout.html','profile.html','admin.html','admin-login.html']){
        for(const match of fs.readFileSync(path.join(directory,page),'utf8').matchAll(/\b(?:src|href)="(\/?(?:js\/|css\/)?[a-zA-Z0-9_-]+\.(?:js|css))\?v=([a-f0-9]+)"/g)){
            const filename=path.resolve(directory,match[1].replace(/^\//,''));
            if(!fs.existsSync(filename)||crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex').slice(0,16)!==match[2])failures.push({page,asset:match[1]});
        }
    }
    return {status:failures.length?'fail':'pass',failures};
}
function secretScan(directory=root){
    const findings=[],files=[];
    function walk(folder){for(const item of fs.readdirSync(folder,{withFileTypes:true})){
        if(item.isSymbolicLink()||/^(?:node_modules|\.git|var|\$HOME|\.backup.*)$/.test(item.name))continue;
        const filename=path.join(folder,item.name);
        if(item.isDirectory()){if(item.name!=='.runtime'&&item.name!=='img')walk(filename);}
        else if(item.isFile()&&item.name!=='.env'&&/\.(?:c?js|jsx|json|md|html|example|txt|conf|ya?ml|sh)$/.test(item.name)&&fs.statSync(filename).size<2*1024*1024)files.push(filename);
    }}walk(directory);
    const rules=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['provider-token',/\b(?:AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk_live_[A-Za-z0-9]{16,})\b/],
        ['credential-literal',/(?<![\w-])["']?(?:password|secret|api_?key|smtp_pass(?:word)?)["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']/i]];
    for(const filename of files){const relative=path.relative(directory,filename).split(path.sep).join('/');
        fs.readFileSync(filename,'utf8').split(/\r?\n/).forEach((line,index)=>{for(const [rule,pattern]of rules){
            if(rule==='credential-literal'&&(/^(?:tests|docs)\//.test(relative)||relative==='scripts/benchmark.cjs'))continue;
            const match=pattern.exec(line);if(match){
                // Expressions and references are not literal credential values.
                if(rule==='credential-literal'&&/[{}()$]|process\.env|example|fixture|test-|mock|undefined/i.test(match[1]))continue;
                findings.push({path:relative,line:index+1,rule});
            }
        }});
    }
    return {status:findings.length?'review-required':'pass',scannedFiles:files.length,findings};
}
function check({envFile=path.join(root,'.env'),production=true}={}){
    const env={...parseEnv(fs.readFileSync(envFile,'utf8'))};
    const configuration=environment(env,{production}),assetChecks=assets(),secrets=secretScan();
    const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
    const lockMatches=lockfile();
    return {releaseStatus:configuration.status==='GO'&&assetChecks.status==='pass'&&secrets.status==='pass'&&lockMatches?'GO':'NO-GO',scope:configuration.scope,version:pkg.version,configuration,assets:assetChecks,secrets,packageLockMatches:lockMatches};
}
if(require.main===module){try{
    const args=process.argv.slice(2);let envFile,production=true;
    while(args.length){const arg=args.shift();if(arg==='--env-file'&&args[0])envFile=path.resolve(args.shift());else if(arg==='--local')production=false;else throw Error('Invalid arguments.');}
    const result=check({envFile,production});console.log(JSON.stringify(result,null,2));if(result.releaseStatus!=='GO')process.exitCode=1;
}catch{console.error(JSON.stringify({releaseStatus:'NO-GO',code:'RELEASE_CHECK_FAILED'}));process.exitCode=1;}}
module.exports={environment,assets,secretScan,check,lockfile};
