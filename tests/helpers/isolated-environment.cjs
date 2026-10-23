'use strict';
// npm test must not load a deployment's real .env in any spawned server/tool.
// Clear application configuration once; child tests may then explicitly test
// production settings with synthetic credentials and disposable storage.
const path=require('node:path'),fs=require('node:fs');
if(process.env.WEB2_TEST_ENV_ISOLATED!=='1'){
    const example=fs.readFileSync(path.resolve(__dirname,'../../.env.example'),'utf8');
    const names=[...example.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]*)=/gm)].map(match=>match[1]);
    for(const name of [...names,'NODE_ENV','DATABASE_PATH','SQLITE_PATH','SEED_DATA_PATH','DATABASE_URL','CAPTCHA_SITE_KEY','CAPTCHA_SECRET_KEY','CAPTCHA_TEST_MODE','SMS_TEMPLATE','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','MAIL_FROM','PAYMENT_PROVIDER','PAYMENT_API_KEY','PAYMENT_CALLBACK_URL','ALLOW_PRODUCTION_HTTP','DEV_ADMIN_PASSWORD_ENABLED'])delete process.env[name];
    Object.assign(process.env,{WEB2_TEST_ENV_ISOLATED:'1',NODE_ENV:'test',SMS_PROVIDER:'mock',PAYMENT_MODE:'test'});
}
process.loadEnvFile=()=>{};
const preload='--require='+JSON.stringify(__filename);
if(!(process.env.NODE_OPTIONS||'').includes(preload))process.env.NODE_OPTIONS=[process.env.NODE_OPTIONS||'',preload].filter(Boolean).join(' ');
