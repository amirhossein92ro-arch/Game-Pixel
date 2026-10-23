'use strict';
const net=require('node:net');
function normalizeOrigin(value){
    if(typeof value!=='string'||!value.trim())return null;
    try{const url=new URL(value.trim());return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&['','/'].includes(url.pathname)&&!url.search&&!url.hash?url.origin:null;}catch{return null;}
}
function validateBootstrapPassword(env){
    if(!env.ADMIN_PASSWORD)return;
    try{require('./request-security.cjs').password(env.ADMIN_PASSWORD);}catch{throw Error('ADMIN_PASSWORD must be strong, 12+ characters and at most 72 UTF-8 bytes.');}
}
function hstsOptions(env=process.env){
    const value=String(env.HSTS_MAX_AGE??'0');
    if(!/^(?:0|[1-9]\d*)$/.test(value)||Number(value)>31536000)throw Error('HSTS_MAX_AGE must be an integer between 0 and 31536000.');
    return env.NODE_ENV==='production'&&Number(value)>0?{maxAge:Number(value),includeSubDomains:false,preload:false}:false;
}
function originPolicy(env=process.env){
    const production=env.NODE_ENV==='production';
    const parse=(value,name)=>String(value||'').split(',').map(v=>v.trim()).filter(Boolean).map(value=>{
        const origin=normalizeOrigin(value);if(!origin)throw Error(name+' must contain valid HTTP(S) origins without paths or credentials.');return origin;
    });
    const appOrigin=env.APP_ORIGIN?normalizeOrigin(env.APP_ORIGIN):null;
    const appOriginUsesHttps=!!appOrigin&&appOrigin.startsWith('https:');
    const port=String(Number.parseInt(env.PORT||'3000',10)||3000);
    const defaults=[`http://localhost:${port}`,`http://127.0.0.1:${port}`,...['3000','5000','5500','5501'].flatMap(p=>[`http://localhost:${p}`,`http://127.0.0.1:${p}`])].join(',');
    const development=production?[]:parse(env.DEV_FRONTEND_ORIGINS??defaults,'DEV_FRONTEND_ORIGINS');
    if(development.some(origin=>!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname)))throw Error('DEV_FRONTEND_ORIGINS must contain loopback origins only.');
    const allowedOrigins=new Set([...parse(env.ALLOWED_ORIGINS,'ALLOWED_ORIGINS'),...(appOrigin?[appOrigin]:[]),...development]);
    if(production&&[...allowedOrigins].some(origin=>!origin.startsWith('https:')))throw Error('Production allows HTTPS origins only.');
    if(production&&!appOriginUsesHttps)throw Error('Production requires HTTPS APP_ORIGIN.');
    if(env.APP_ORIGIN&&!appOrigin)throw Error('APP_ORIGIN must be a valid origin.');
    return {appOrigin,appOriginUsesHttps,allowedOrigins};
}
function validateRuntime(env=process.env,nodeVersion=process.versions.node){
    const [major,minor]=nodeVersion.split('.').map(Number);
    if(major!==24||minor<15)throw Error('Node.js 24.15.0 or newer within Node 24 is required.');
    if(env.NODE_ENV&&!['development','test','production'].includes(env.NODE_ENV))throw Error('NODE_ENV must be development, test or production.');
    const port=Number(env.PORT??'3000'),host=env.HOST||'127.0.0.1',production=env.NODE_ENV==='production';
    if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('PORT must be an integer between 1 and 65535.');
    if(production&&!['127.0.0.1','::1','localhost'].includes(host))throw Error('Production HOST must be a loopback address behind HTTPS Nginx.');
    if(env.TRUST_PROXY)for(const value of env.TRUST_PROXY.split(',').map(v=>v.trim())){
        const [address,prefix,...extra]=value.split('/'),family=net.isIP(address);
        if(['loopback','linklocal','uniquelocal'].includes(value))continue;
        if(!family||extra.length||prefix!==undefined&&(!/^\d+$/.test(prefix)||Number(prefix)<1||Number(prefix)>(family===4?32:128)))throw Error('TRUST_PROXY must identify trusted addresses or bounded networks.');
    }
    const origins=originPolicy(env);
    hstsOptions(env);
    validateBootstrapPassword(env);
    if(production&&!env.ADMIN_PASSWORD)throw Error('Production requires ADMIN_PASSWORD.');
    if(env.ADMIN_TOTP_SECRET&&!/^[A-Z2-7]{16,}={0,6}$/i.test(env.ADMIN_TOTP_SECRET))throw Error('ADMIN_TOTP_SECRET must be valid Base32.');
    if(env.ACCOUNT_TOTP_KEY&&!/^[a-f0-9]{64}$/i.test(env.ACCOUNT_TOTP_KEY))throw Error('ACCOUNT_TOTP_KEY must contain 32 bytes encoded as hex.');
    if(env.STORE_TIMEZONE)new Intl.DateTimeFormat('en',{timeZone:env.STORE_TIMEZONE});
    require('./captcha.cjs').createCaptchaService(env);
    require('./sms.cjs').createSmsService(env);
    const storage=require('../storage/config.cjs').configuration(env);
    return {port,host,production,origins,storage};
}
function productionWarnings(env=process.env){
    if(env.NODE_ENV!=='production')return [];
    return [...(!String(env.TURNSTILE_SITE_KEY||env.CAPTCHA_SITE_KEY||'').trim()||!String(env.TURNSTILE_SECRET_KEY||env.CAPTCHA_SECRET_KEY||'').trim()?['CAPTCHA_UNCONFIGURED']:[]),
        ...(!String(env.SMS_PROVIDER||'').trim()||String(env.SMS_PROVIDER).trim().toLowerCase()==='mock'?['SMS_UNCONFIGURED']:[]),...(!env.ACCOUNT_TOTP_KEY?['CUSTOMER_2FA_UNCONFIGURED']:[]),'PAYMENTS_UNAVAILABLE'];
}
module.exports={normalizeOrigin,originPolicy,validateRuntime,validateBootstrapPassword,productionWarnings,hstsOptions};
