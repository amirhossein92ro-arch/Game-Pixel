'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('real Turnstile widgets render for login, register and every recovery step', async () => {
    const dom=new JSDOM('<!doctype html><body data-page="profile"><main id="profileApp"></main></body>',{url:'http://localhost/profile.html',runScripts:'outside-only',pretendToBeVisual:true});
    const {window}=dom;const actions=[],removed=[];
    window.Web2={user:null,ready:Promise.resolve(),request:async url=>{
        assert.equal(url,'/api/auth/config');
        return {turnstileSiteKey:'public-site-key',captchaRequired:true,captchaConfigured:true};
    }};
    window.turnstile={
        render(_host,options){actions.push(options.action);options.callback(`token-${options.action}`);return actions.length-1;},
        reset(){},remove(id){removed.push(String(id));}
    };
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/profile.js'),'utf8'),dom.getInternalVMContext(),{filename:'profile.js'});
    await new Promise(resolve=>setTimeout(resolve,20));
    const login=window.document.getElementById('profileAuth');
    assert.ok(login.querySelector('[data-captcha]'));
    assert.equal(login.elements.captchaToken.value,'token-login');
    assert.equal(login.querySelector('[type="submit"]').disabled,false);

    login.elements.mode.value='register';login.elements.mode.dispatchEvent(new window.Event('change',{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(login.elements.captchaToken.value,'token-register');
    window.document.querySelector('[data-account-auth="forgot"]').click();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.ok(window.document.querySelector('#forgotRequest [name="phone"]'),'forgot password collects a mobile number');
    assert.match(window.document.querySelector('#forgotRequest button[type="submit"]').textContent,/ارسال کد/);
    assert.equal(window.document.getElementById('forgotRequest').elements.captchaToken.value,'token-forgot_password');
    vm.runInContext("accountForgot('verify',{resendAfter:2})",dom.getInternalVMContext());
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.ok(window.document.querySelector('#forgotVerify [name="otp"]'),'OTP entry appears after a successful send');
    assert.match(window.document.getElementById('forgotResend').textContent,/ارسال مجدد کد تا 00:0[12]/);
    assert.equal(window.document.getElementById('forgotVerify').elements.captchaToken.value,'token-forgot_password');
    await new Promise(resolve=>setTimeout(resolve,2200));
    assert.equal(window.document.getElementById('forgotResend').disabled,false,'resend activates after the countdown');
    assert.equal(window.document.getElementById('forgotResend').textContent,'ارسال مجدد کد');
    vm.runInContext("accountForgot('reset')",dom.getInternalVMContext());
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(window.document.getElementById('forgotReset').elements.captchaToken.value,'token-password_reset');
    assert.deepEqual(actions,['login','register','forgot_password','forgot_password','password_reset']);
    assert.ok(removed.length>=1,'changing login to register removes the old widget');
    vm.runInContext('clearInterval(accountRecoveryState.timer)',dom.getInternalVMContext());dom.window.close();
});
