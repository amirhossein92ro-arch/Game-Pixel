'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createCaptchaService, SITEVERIFY_URL} = require('../lib/captcha.cjs');
const {createSmsService, KAVENEGAR_BASE_URL} = require('../lib/sms.cjs');

test('unconfigured Turnstile fails closed outside test mode and production requires keys', async () => {
    const development = createCaptchaService({NODE_ENV:'development'});
    assert.equal(development.required, true);
    assert.match(development.developmentMessage, /TURNSTILE_SITE_KEY/);
    assert.equal(await development.verify('', '127.0.0.1', 'login'), false);
    assert.throws(() => createCaptchaService({NODE_ENV:'production',APP_ORIGIN:'https://shop.example'}), /Production requires/);
    assert.throws(() => createCaptchaService({NODE_ENV:'development',TURNSTILE_SITE_KEY:'public-only'}), /configured together/);
});

test('Turnstile sends tokens only to official Siteverify and checks action and hostname', async () => {
    const calls=[];
    const fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({success:true,action:'login',hostname:'shop.example'})};};
    const service=createCaptchaService({NODE_ENV:'production',APP_ORIGIN:'https://shop.example',TURNSTILE_SITE_KEY:'public-site-key',TURNSTILE_SECRET_KEY:'server-secret'}, {fetch});
    assert.equal(await service.verify('', '203.0.113.10', 'login'), false);
    assert.equal(await service.verify('browser-token', '203.0.113.10', 'login'), true);
    assert.equal(calls.length,1);assert.equal(calls[0].url,SITEVERIFY_URL);
    assert.equal(calls[0].options.body.get('secret'),'server-secret');
    assert.equal(calls[0].options.body.get('response'),'browser-token');
    assert.equal(calls[0].options.body.get('remoteip'),'203.0.113.10');
    assert.match(calls[0].options.body.get('idempotency_key'),/^[0-9a-f-]{36}$/i);
    const wrongAction=createCaptchaService({NODE_ENV:'production',APP_ORIGIN:'https://shop.example',TURNSTILE_SITE_KEY:'public',TURNSTILE_SECRET_KEY:'secret'},{fetch:async()=>({ok:true,json:async()=>({success:true,action:'register',hostname:'shop.example'})})});
    assert.equal(await wrongAction.verify('token', '', 'login'),false);
    const wrongHost=createCaptchaService({NODE_ENV:'production',APP_ORIGIN:'https://shop.example',TURNSTILE_SITE_KEY:'public',TURNSTILE_SECRET_KEY:'secret'},{fetch:async()=>({ok:true,json:async()=>({success:true,action:'login',hostname:'attacker.example'})})});
    assert.equal(await wrongHost.verify('token', '', 'login'),false);
});

test('SMS mock is development-only and never exposes an OTP in production', async () => {
    const mock=createSmsService({NODE_ENV:'development'});
    assert.equal((await mock.sendOtp({phone:'09120000000',code:'123456',expiresInSeconds:120})).mockCode,'123456');
    assert.throws(()=>createSmsService({NODE_ENV:'production'}),/real SMS_PROVIDER/);
});

test('Kavenegar adapter uses official Verify Lookup contract', async () => {
    const calls=[];
    const fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>({return:{status:200},entries:[{messageid:42}]})};};
    const sms=createSmsService({NODE_ENV:'production',SMS_PROVIDER:'kavenegar',SMS_API_KEY:'private-api-key',SMS_TEMPLATE_ID:'web2otp'},{fetch});
    const result=await sms.sendOtp({phone:'09120000000',code:'654321',expiresInSeconds:120});
    assert.deepEqual(result,{provider:'kavenegar',delivered:true,deliveryId:42});
    assert.equal(calls[0].url,`${KAVENEGAR_BASE_URL}/private-api-key/verify/lookup.json`);
    assert.equal(calls[0].options.body.get('receptor'),'09120000000');
    assert.equal(calls[0].options.body.get('token'),'654321');
    assert.equal(calls[0].options.body.get('template'),'web2otp');
    assert.equal('mockCode' in result,false);
});

test('generic SMS adapter keeps credentials server-side and uses template parameters', async () => {
    let call;
    const sms=createSmsService({NODE_ENV:'production',SMS_PROVIDER:'generic',SMS_API_KEY:'private-key',SMS_API_URL:'https://sms.example/send',SMS_SENDER:'WEB2',SMS_TEMPLATE_ID:'otp-template'},{fetch:async(url,options)=>{call={url,options};return {ok:true,status:202};}});
    await sms.sendOtp({phone:'09120000000',code:'112233',expiresInSeconds:120});
    assert.equal(call.url,'https://sms.example/send');
    assert.equal(call.options.headers.Authorization,'Bearer private-key');
    assert.deepEqual(JSON.parse(call.options.body),{to:'09120000000',sender:'WEB2',templateId:'otp-template',parameters:{code:'112233',expiresInSeconds:120}});
});

test('SMS provider failures are surfaced internally without echoing OTP or credentials', async () => {
    const sms=createSmsService({NODE_ENV:'production',SMS_PROVIDER:'generic',SMS_API_KEY:'secret-must-not-leak',SMS_API_URL:'https://sms.example/send',SMS_TEMPLATE_ID:'otp'},{fetch:async()=>({ok:false,status:503,json:async()=>({error:'private response detail'})})});
    await assert.rejects(sms.sendOtp({phone:'09120000000',code:'998877',expiresInSeconds:120}),error=>{
        assert.match(error.message,/503/);
        assert.doesNotMatch(error.message,/998877|secret-must-not-leak|private response detail/);
        return true;
    });
});
