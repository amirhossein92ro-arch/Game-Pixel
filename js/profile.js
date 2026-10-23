"use strict";
const profileEscape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profilePrice = value => `${Number(value || 0).toLocaleString('fa-IR')} تومان`;
const profileDate = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('fa-IR',{year:'numeric',month:'short',day:'numeric'}) : '—';
const accountLabels = {pending:'در انتظار',paid:'پرداخت‌شده',processing:'در حال آماده‌سازی',shipped:'ارسال‌شده',delivered:'تحویل‌شده',cancelled:'لغوشده',open:'باز',answered:'پاسخ‌داده‌شده',closed:'بسته'};
const accountCategories = {order:'سفارش',payment:'پرداخت',product:'محصول',account:'حساب کاربری',other:'سایر'};
const accountIcons = {gamepad:'fa-gamepad',astronaut:'fa-user-astronaut',dragon:'fa-dragon',robot:'fa-robot',bolt:'fa-bolt',headset:'fa-headset'};
const accountMenu = [['dashboard','داشبورد','fa-gauge-high'],['info','اطلاعات حساب','fa-user'],['orders','سفارش‌های من','fa-bag-shopping'],['addresses','آدرس‌های من','fa-location-dot'],['wishlist','علاقه‌مندی‌ها','fa-heart'],['security','امنیت حساب','fa-shield-halved'],['notifications','اعلان‌ها','fa-bell'],['support','پشتیبانی','fa-headset']];
const accountState = {userId:null,section:'dashboard',dashboard:null,unread:0,addresses:[],ticket:null,reads:new Map(),busy:new Set(),generation:0,boot:null,orderPage:1};
const accountBadge = status => `<span class="account-badge ${Object.hasOwn(accountLabels,status)?status:'closed'}">${profileEscape(accountLabels[status]||'نامشخص')}</span>`;
const accountEmpty = (text,icon='fa-box-open',shop=false) => `<div class="account-empty"><i class="fa-solid ${icon}" aria-hidden="true"></i><p>${profileEscape(text)}</p>${shop?'<a class="secondary-button" href="index.html#products">دیدن محصولات فروشگاه</a>':''}</div>`;
const accountAvatar = user => `<span class="account-avatar" aria-hidden="true"><i class="fa-solid ${accountIcons[user.avatar]||'fa-gamepad'}"></i></span>`;
function accountNotice(text,kind='success') {
    const el=document.getElementById('profileNotice');if(!el)return;
    el.textContent=text;el.dataset.kind=kind;el.hidden=!text;
}
async function profileRequest(url,options={}) {
    const read=!options.method||options.method==='GET';
    if(!read){await Web2.refresh();++Web2.sessionVersion;}
    if(read&&accountState.reads.has(url))return accountState.reads.get(url);
    const owner=Web2.user?.id;
    const promise=Web2.request(url,options).then(data=>{
        if(owner&&Web2.user?.id!==owner)throw new Error('نشست حساب تغییر کرده است؛ دوباره وارد شوید.');
        return data;
    }).catch(error=>{
        if(error.status===401&&Web2.user?.id===owner&&!url.startsWith('/api/auth/')) {
            Web2.user=null;Web2.csrfToken=null;
            accountBoot();
            window.dispatchEvent(new Event('web2:auth'));
        }
        throw error;
    }).finally(()=>{if(read&&accountState.reads.get(url)===promise)accountState.reads.delete(url);});
    if(read)accountState.reads.set(url,promise);
    return promise;
}
function accountField(label,name,value='',attributes='',wide=false) {
    return `<label class="field${wide?' account-full':''}"><span>${label}</span><input id="account-field-${name}" name="${name}" value="${profileEscape(value)}" ${attributes}></label>`;
}
function accountReturnPath() {
    const value=new URLSearchParams(location.search).get('returnTo');
    if(!value||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020]/.test(value))return '';
    try{const url=new URL(value,location.origin);if(url.origin!==location.origin||!/^\/(?:products|product(?:\.html)?|cart(?:\.html)?|checkout(?:\.html)?|categories\/[^/]+)?$/.test(url.pathname))return '';return url.pathname+url.search;}catch{return '';}
}
function accountFieldError(field,message='') {
    if(!field)return;field.setAttribute('aria-invalid',String(!!message));
    const wrapper=field.closest('.field');if(!wrapper)return;
    let note=wrapper.querySelector('.field-error');if(!note){note=document.createElement('small');note.className='field-error';note.id='account-error-'+field.name;wrapper.append(note);}
    note.textContent=message;note.hidden=!message;field.setAttribute('aria-describedby',note.id);
}
function accountAuth() {
    const app=document.getElementById('profileApp');
    app.innerHTML=`<section class="account-auth account-panel glass-panel"><div class="auth-brand rgb-text rgb-text-glow"><i class="fa-solid fa-gamepad" aria-hidden="true"></i> WEB 2</div><h1 class="rgb-text">به حساب خود وارد شوید</h1><p class="account-muted">سفارش‌ها، علاقه‌مندی‌ها و پشتیبانی فروشگاه، در یک جا.</p><div id="profileNotice" class="account-notice" role="status" aria-live="polite" hidden></div><form id="profileAuth" class="account-form"><label class="field"><span>ورود یا ثبت‌نام</span><select name="mode" id="profileAuthMode"><option value="login">ورود به حساب</option><option value="register">ساخت حساب جدید</option></select></label><div id="accountRegisterFields" class="account-form" hidden>${accountField('نام','name','','minlength="2" maxlength="100" autocomplete="given-name"')}${accountField('موبایل','phone','','pattern="09[0-9]{9}" maxlength="11" inputmode="tel" dir="ltr" autocomplete="tel"')}</div>${accountField('ایمیل','email','','type="email" required maxlength="200" dir="ltr" autocomplete="email"')}${accountField('رمز عبور','password','','type="password" required maxlength="72" autocomplete="current-password"')}<small class="account-muted" id="accountPasswordHint">رمز حساب خود را وارد کنید.</small><button class="primary-button" type="submit">ادامه <i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button></form><a class="account-muted" href="index.html">بازگشت به فروشگاه</a></section>`;
    if(new URLSearchParams(location.search).has('loggedout'))accountNotice('از حساب خارج شدید.');
}
function accountTwoFactorAuth(){
    const app=document.getElementById('profileApp');
    app.innerHTML=`<section class="account-auth account-panel glass-panel"><h1>تأیید دومرحله‌ای</h1><p class="account-muted">کد برنامه احراز هویت یا یکی از کدهای بازیابی را وارد کنید.</p><div id="profileNotice" class="account-notice" role="status" aria-live="polite" hidden></div><form id="accountTwoFactorLogin" class="account-form">${accountField('کد تأیید یا بازیابی','code','','required autocomplete="one-time-code" dir="ltr" maxlength="23"')}<button class="primary-button" type="submit">تأیید و ورود</button></form><button class="secondary-button" type="button" data-account-auth="login">بازگشت به ورود</button></section>`;
}
const accountRecoveryState={phone:'',challengeId:'',resetToken:'',resendAt:0,timer:null};
let accountCaptchaConfigPromise;
function accountCaptchaConfig(){return accountCaptchaConfigPromise||(accountCaptchaConfigPromise=Web2.request('/api/auth/config').catch(error=>{accountCaptchaConfigPromise=null;throw error;}));}
function accountTurnstileReady(){
    if(window.turnstile)return Promise.resolve();
    return new Promise((resolve,reject)=>{
        const old=document.querySelector('script[data-web2-turnstile]');
        if(old){old.addEventListener('load',resolve,{once:true});old.addEventListener('error',reject,{once:true});return;}
        const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;script.dataset.web2Turnstile='true';script.onload=resolve;script.onerror=()=>reject(new Error('بارگذاری تأیید امنیتی ممکن نشد.'));document.head.append(script);
    });
}
function accountCaptchaAction(form){
    if(form?.id==='profileAuth')return form.elements.mode?.value==='register'?'register':'login';
    return ({forgotRequest:'forgot_password',forgotVerify:'forgot_password',forgotReset:'password_reset'})[form?.id]||'account_action';
}
function accountCaptchaSubmit(form,enabled){const button=form?.querySelector('button[type="submit"]');if(button)button.disabled=!enabled;}
function accountCaptchaStatus(form,message,kind=''){const status=form?.querySelector('[data-captcha-status]');if(!status)return;status.textContent=message;status.dataset.kind=kind;}
async function accountRenderCaptcha(form){
    if(!form)return;
    const host=form.querySelector('[data-captcha]'),input=form.querySelector('[name="captchaToken"]');if(!host||!input)return;
    try{
        const config=await accountCaptchaConfig();
        if(!form.isConnected)return;
        if(config.captchaTestMode){input.value='test-valid-captcha';host.textContent='تأیید امنیتی حالت آزمایشی';accountCaptchaSubmit(form,true);return;}
        if(!config.captchaRequired){input.value='';host.textContent='';accountCaptchaStatus(form,'');accountCaptchaSubmit(form,true);return;}
        if(!config.captchaConfigured){host.textContent=config.developmentMessage||'تأیید امنیتی روی سرور تنظیم نشده است.';accountCaptchaStatus(form,'تأیید امنیتی روی سرور باید تنظیم شود.','error');accountCaptchaSubmit(form,false);return;}
        accountCaptchaSubmit(form,false);
        await accountTurnstileReady();if(!form.isConnected)return;
        host.textContent='';const action=accountCaptchaAction(form);host.dataset.action=action;
        host.dataset.widgetId=window.turnstile.render(host,{sitekey:config.turnstileSiteKey||config.captchaSiteKey,action,theme:document.body.classList.contains('light-theme')?'light':'dark',language:'fa',size:'flexible',appearance:'always','response-field':false,callback:token=>{input.value=token;accountCaptchaStatus(form,'تأیید امنیتی انجام شد.','success');accountCaptchaSubmit(form,true);},'expired-callback':()=>{input.value='';accountCaptchaStatus(form,'تأیید امنیتی منقضی شد؛ دوباره تأیید کنید.','error');accountCaptchaSubmit(form,false);},'error-callback':()=>{input.value='';accountCaptchaStatus(form,'بارگذاری تأیید امنیتی ناموفق بود؛ دوباره تلاش کنید.','error');accountCaptchaSubmit(form,false);}});
    }catch(error){host.textContent=error.message;host.dataset.error='true';accountCaptchaStatus(form,'بارگذاری CAPTCHA ممکن نشد.','error');accountCaptchaSubmit(form,false);}
}
async function accountCaptchaToken(form,data){
    await Web2.refresh();
    const config=await accountCaptchaConfig();
    const token=form.querySelector('[name="captchaToken"]')?.value||'';
    if(config.captchaRequired&&!token)throw new Error('لطفاً تأیید کنید ربات نیستید.');
    data.captchaToken=token;return data;
}
function accountResetCaptcha(form){
    if(!form?.isConnected)return;
    const host=form?.querySelector('[data-captcha]'),input=form?.querySelector('[name="captchaToken"]');if(input)input.value='';
    if(host?.dataset.widgetId&&window.turnstile){window.turnstile.reset(host.dataset.widgetId);accountCaptchaSubmit(form,false);accountCaptchaStatus(form,'لطفاً تأیید کنید که ربات نیستید.');}
    else if(form?.isConnected)accountRenderCaptcha(form);
}
function accountCaptchaMarkup(){return '<div class="account-captcha account-full" data-captcha role="group" aria-label="تأیید امنیتی"><span class="account-muted">در حال آماده‌سازی تأیید امنیتی…</span></div><small class="account-captcha-status account-full" data-captcha-status role="status" aria-live="polite">لطفاً تأیید کنید که ربات نیستید.</small><input type="hidden" name="captchaToken">';}
function accountAuthSecure(message='',kind='success'){
    clearInterval(accountRecoveryState.timer);
    const app=document.getElementById('profileApp');
    app.innerHTML=`<section class="account-auth account-panel glass-panel"><div class="auth-brand rgb-text rgb-text-glow"><i class="fa-solid fa-gamepad" aria-hidden="true"></i> WEB 2</div><h1 class="rgb-text">به حساب خود وارد شوید</h1><p class="account-muted">نشست شما پس از ورود، پنج ساعت معتبر خواهد بود.</p><div id="profileNotice" class="account-notice" role="status" aria-live="polite" hidden></div><form id="profileAuth" class="account-form"><label class="field"><span>ورود یا ثبت‌نام</span><select name="mode" id="profileAuthMode"><option value="login">ورود به حساب</option><option value="register">ساخت حساب جدید</option></select></label><div id="accountRegisterFields" class="account-form" hidden>${accountField('نام','name','','minlength="2" maxlength="100" autocomplete="given-name"')}${accountField('موبایل','phone','','pattern="09[0-9]{9}" maxlength="11" inputmode="tel" dir="ltr" autocomplete="tel"')}</div>${accountField('ایمیل','email','','type="email" required maxlength="200" dir="ltr" autocomplete="email"')}${accountField('رمز عبور','password','','type="password" required maxlength="72" autocomplete="current-password"')}<small class="account-muted" id="accountPasswordHint">رمز حساب خود را وارد کنید.</small>${accountCaptchaMarkup()}<button class="primary-button" type="submit">ادامه <i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button><button class="account-link-button" type="button" data-account-auth="forgot">فراموشی رمز عبور</button></form><a class="account-muted account-back-link" href="index.html">بازگشت به فروشگاه</a></section>`;
    accountRenderCaptcha(document.getElementById('profileAuth'));
    const form=document.getElementById('profileAuth');form.querySelector('[type="submit"]').textContent='ورود به حساب';
    const destination=accountReturnPath();if(destination){const back=app.querySelector('.account-back-link');back.href=destination;back.textContent='بازگشت و ادامه خرید';}
    if(message)accountNotice(message,kind);else if(new URLSearchParams(location.search).has('loggedout'))accountNotice('از حساب خارج شدید.');
}
function accountForgot(step='request',payload={}){
    clearInterval(accountRecoveryState.timer);
    const app=document.getElementById('profileApp');let body='';
    if(step==='request')body=`<h1 class="rgb-text">فراموشی رمز عبور</h1><p class="account-muted">شماره موبایل ثبت‌شده را وارد کنید. پاسخ این مرحله وجود یا عدم وجود حساب را نمایش نمی‌دهد.</p><form id="forgotRequest" class="account-form">${accountField('شماره موبایل','phone',accountRecoveryState.phone,'required pattern="09[0-9]{9}" maxlength="11" inputmode="tel" dir="ltr" autocomplete="tel"')}${accountCaptchaMarkup()}<button class="primary-button" type="submit">ارسال کد یک‌بارمصرف</button></form>`;
    if(step==='verify')body=`<h1 class="rgb-text">تأیید کد پیامک</h1><p class="account-muted">کد شش‌رقمی را وارد کنید. این کد فقط یک بار قابل استفاده است.</p><form id="forgotVerify" class="account-form">${accountField('کد تأیید','otp','','required pattern="[0-9]{6}" minlength="6" maxlength="6" inputmode="numeric" dir="ltr" autocomplete="one-time-code"')}${accountCaptchaMarkup()}<button class="primary-button" type="submit">تأیید کد</button><button class="account-link-button" id="forgotResend" type="button" data-account-auth="resend" disabled>ارسال مجدد کد تا 02:00</button></form>`;
    if(step==='reset')body=`<h1 class="rgb-text">تعیین رمز جدید</h1><p class="account-muted">رمز جدید حداقل ۱۲ کاراکتر و حداکثر ۷۲ بایت باشد.</p><form id="forgotReset" class="account-form">${accountField('رمز عبور جدید','password','','type="password" required minlength="12" maxlength="72" autocomplete="new-password"')}${accountField('تکرار رمز عبور','confirmPassword','','type="password" required minlength="12" maxlength="72" autocomplete="new-password"')}${accountCaptchaMarkup()}<button class="primary-button" type="submit">ذخیره رمز جدید</button></form>`;
    app.innerHTML=`<section class="account-auth account-panel glass-panel"><div class="auth-brand rgb-text rgb-text-glow"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> WEB 2</div><div id="profileNotice" class="account-notice" role="status" aria-live="polite" hidden></div>${body}<button class="account-link-button account-back-link" type="button" data-account-auth="login">بازگشت به ورود</button></section>`;
    const form=app.querySelector('form');accountRenderCaptcha(form);
    if(payload.message)accountNotice(payload.message,'success');
    if(payload.mockOtp)accountNotice(`${payload.message} کد آزمایشی توسعه: ${payload.mockOtp}`,'success');
    if(step==='verify'){
        accountRecoveryState.resendAt=Date.now()+Number(payload.resendAfter||120)*1000;
        const tick=()=>{const button=document.getElementById('forgotResend');if(!button){clearInterval(accountRecoveryState.timer);return;}const left=Math.max(0,Math.ceil((accountRecoveryState.resendAt-Date.now())/1000));button.disabled=left>0;button.textContent=left?`ارسال مجدد کد تا ${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`:'ارسال مجدد کد';};tick();accountRecoveryState.timer=setInterval(tick,1000);
    }
}
function accountShell() {
    const user=Web2.user;
    document.getElementById('profileApp').innerHTML=`<div class="account-layout"><aside class="account-sidebar glass-panel"><div class="account-identity">${accountAvatar(user)}<strong data-account-name>${profileEscape(user.displayName||user.name)}</strong><small dir="ltr" data-account-email>${profileEscape(user.email)}</small></div><nav class="account-nav" aria-label="منوی حساب کاربری">${accountMenu.map(([key,label,icon])=>`<button type="button" data-account-section="${key}" ${key===accountState.section?'aria-current="page"':''}><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span>${key==='notifications'?'<span id="accountUnread" class="account-count" hidden>۰</span>':''}</button>`).join('')}<button type="button" class="account-logout" data-account-action="logout"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> خروج از حساب</button></nav></aside><div class="account-content"><header class="account-topbar"><div><span class="account-eyebrow" dir="ltr">PLAYER ACCOUNT / WEB 2</span><h1 id="accountTitle" class="rgb-text">داشبورد</h1></div><button class="secondary-button" type="button" data-account-action="refresh"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> به‌روزرسانی</button></header><div id="profileNotice" class="account-notice" role="status" aria-live="polite" hidden></div><div id="accountSection" class="account-section" aria-live="polite"></div></div></div><dialog id="accountDialog" class="account-dialog" aria-labelledby="accountDialogTitle"><header><h2 id="accountDialogTitle">جزئیات</h2><button class="icon-button" type="button" data-account-action="close-dialog" aria-label="بستن"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header><div id="accountDialogBody"></div></dialog>`;
}
function accountUpdateIdentity() {
    document.querySelectorAll('[data-account-name]').forEach(el=>el.textContent=Web2.user.displayName||Web2.user.name);
    document.querySelectorAll('[data-account-email]').forEach(el=>el.textContent=Web2.user.email);
    const badge=document.getElementById('accountUnread');
    if(badge){const n=accountState.unread;badge.textContent=n.toLocaleString('fa-IR');badge.hidden=!n;}
}
function accountOrderRows(orders) {
    return orders.length?`<div class="account-list">${orders.map(o=>`<article class="account-row"><div><strong dir="ltr">${profileEscape(o.code)}</strong><small class="account-muted">${profileDate(o.createdAt)} · ${Number(o.itemCount??(o.items||[]).reduce((s,i)=>s+Number(i.quantity||0),0)).toLocaleString('fa-IR')} کالا</small></div><strong class="account-price">${profilePrice(o.total)}</strong><div class="account-actions">${accountBadge(o.status)}<button class="secondary-button" type="button" data-account-action="order" data-id="${profileEscape(o.id)}">مشاهده جزئیات</button></div></article>`).join('')}</div>`:accountEmpty('هنوز سفارشی ثبت نکرده‌اید.','fa-bag-shopping',true);
}
function accountDashboard(data) {
    const {user,stats,recentOrders}=data;
    return `<section class="account-panel account-welcome">${accountAvatar(user)}<div><span class="account-eyebrow">به فضای شخصی خود خوش آمدید</span><h2 class="rgb-text rgb-text-glow">سلام ${profileEscape(user.displayName||user.name)} 👋</h2><p class="account-muted">از اینجا خریدها و حساب خود را مدیریت کنید. بازی بعدی از همین‌جا شروع می‌شود.</p></div></section><div class="account-stats">${[['orders','کل سفارش‌ها','fa-bag-shopping'],['pending','در انتظار بررسی','fa-hourglass-half'],['completed','تحویل‌شده','fa-circle-check'],['wishlist','علاقه‌مندی‌ها','fa-heart']].map(([key,label,icon])=>`<article class="account-stat"><i class="fa-solid ${icon}" aria-hidden="true"></i><strong>${Number(stats[key]).toLocaleString('fa-IR')}</strong><span>${label}</span></article>`).join('')}</div><div class="account-grid"><section class="account-panel"><h2>کارت بازیکن</h2><dl class="account-definition"><div><dt>نام</dt><dd>${profileEscape(user.name)}</dd></div><div><dt>ایمیل</dt><dd dir="ltr">${profileEscape(user.email)}</dd></div><div><dt>موبایل</dt><dd dir="ltr">${profileEscape(user.phone)}</dd></div><div><dt>تاریخ عضویت</dt><dd>${profileDate(user.joinDate)}</dd></div></dl></section><section class="account-panel"><h2>همه چیز در دسترس شما</h2><p class="account-muted">اطلاعات گیرنده را ذخیره کنید، محصولات محبوب خود را نگه دارید و وضعیت سفارش را دنبال کنید.</p><div class="account-actions"><button class="secondary-button" type="button" data-account-section="addresses">دفترچه آدرس</button><button class="secondary-button" type="button" data-account-section="support">تماس با پشتیبانی</button></div></section></div><section class="account-panel" style="margin-top:20px"><h2>آخرین سفارش‌های شما</h2>${accountOrderRows(recentOrders)}</section>`;
}
function accountInfo(user) {
    return `<section class="account-panel"><h2>اطلاعات حساب</h2><p class="account-muted">برای تغییر ایمیل یا موبایل، رمز فعلی لازم است. آواتارهای فروشگاه قابل انتخاب‌اند.</p><form id="profileEdit" class="account-form">${accountField('نام','firstName',user.firstName||user.name,'required minlength="2" maxlength="50" autocomplete="given-name"')}${accountField('نام خانوادگی','lastName',user.lastName||'','maxlength="50" autocomplete="family-name"')}${accountField('نام نمایشی','displayName',user.displayName||user.name,'maxlength="60" autocomplete="nickname"')}<label class="field"><span>آواتار</span><select name="avatar">${Object.entries({gamepad:'گیم‌پد',astronaut:'فضانورد',dragon:'اژدها',robot:'ربات',bolt:'برق',headset:'هدست'}).map(([key,label])=>`<option value="${key}" ${key===user.avatar?'selected':''}>${label}</option>`).join('')}</select></label>${accountField('ایمیل','email',user.email,'type="email" required maxlength="200" dir="ltr" autocomplete="email"')}${accountField('موبایل','phone',user.phone,'required pattern="09[0-9]{9}" maxlength="11" dir="ltr" inputmode="tel" autocomplete="tel"')}${accountField('رمز فعلی (فقط برای تغییر ایمیل یا موبایل)','currentPassword','','type="password" maxlength="72" autocomplete="current-password"',true)}<div class="account-actions account-full"><button class="primary-button" type="submit">ذخیره تغییرات</button></div></form></section>`;
}
function accountAddressForm(a={}) {
    return `<section class="account-panel" id="accountAddressEditor"><h2>${a.id?'ویرایش آدرس':'افزودن آدرس جدید'}</h2><form id="profileAddressForm" class="account-form"><input type="hidden" name="id" value="${profileEscape(a.id||'')}">${accountField('عنوان آدرس','title',a.title||'','required minlength="2" maxlength="60" placeholder="خانه یا محل کار"')}${accountField('نام گیرنده','name',a.name||Web2.user.name,'required minlength="2" maxlength="100" autocomplete="name"')}${accountField('موبایل گیرنده','phone',a.phone||Web2.user.phone,'required pattern="09[0-9]{9}" maxlength="11" dir="ltr" inputmode="tel"')}${accountField('استان','province',a.province||'','required minlength="2" maxlength="60" autocomplete="address-level1"')}${accountField('شهر','city',a.city||'','required minlength="2" maxlength="60" autocomplete="address-level2"')}${accountField('کد پستی (اختیاری)','postalCode',a.postalCode||'','pattern="[0-9]{10}" maxlength="10" dir="ltr" inputmode="numeric" autocomplete="postal-code"')}<label class="field account-full"><span>نشانی کامل</span><textarea name="address" required minlength="10" maxlength="1000" autocomplete="street-address">${profileEscape(a.address||'')}</textarea></label><label class="field"><span>آدرس پیش‌فرض</span><select name="isDefault"><option value="false">خیر</option><option value="true" ${a.isDefault?'selected':''}>بله</option></select></label><div class="account-actions account-full"><button class="primary-button" type="submit">${a.id?'ذخیره آدرس':'افزودن آدرس'}</button>${a.id?'<button class="secondary-button" type="button" data-account-action="cancel-address">انصراف</button>':''}</div></form></section>`;
}
function accountAddresses(rows) {
    return `<section class="account-panel"><h2>دفترچه آدرس شما</h2><div class="account-list">${rows.length?rows.map(a=>`<article class="account-row account-address-card ${a.isDefault?'is-default':''}"><div><strong>${profileEscape(a.title||'آدرس')} ${a.isDefault?'<span class="account-badge shipped">پیش‌فرض</span>':''}</strong><p>${profileEscape(a.name)} · <bdi>${profileEscape(a.phone)}</bdi></p><p class="account-muted">${profileEscape([a.province,a.city,a.address].filter(Boolean).join('، '))}</p>${a.postalCode?`<small class="account-muted">کد پستی: ${profileEscape(a.postalCode)}</small>`:''}</div><div class="account-actions"><button class="secondary-button" type="button" data-account-action="edit-address" data-id="${profileEscape(a.id)}">ویرایش</button>${a.isDefault?'':`<button class="secondary-button" type="button" data-account-action="default-address" data-id="${profileEscape(a.id)}">پیش‌فرض</button>`}<button class="secondary-button" type="button" data-account-action="delete-address" data-id="${profileEscape(a.id)}">حذف</button></div></article>`).join(''):accountEmpty('برای ارسال سریع‌تر، اولین آدرس خود را ثبت کنید.','fa-location-dot')}</div></section>${accountAddressForm()}`;
}
function accountWishlist(rows) {
    return `<section class="account-panel"><h2>محصولات محبوب شما</h2>${rows.length?`<div class="account-wishlist">${rows.map(({productId,product:p})=>`<article class="account-wish-card">${p?`<img src="${profileEscape(safeImage(p.image))}" alt="${profileEscape(p.name)}" loading="lazy"><h3><a href="product.html?id=${encodeURIComponent(p.id)}">${profileEscape(p.name)}</a></h3><strong class="account-price">${profilePrice(Math.round(p.price*(100-Number(p.discount||0))/100))}</strong><small class="account-muted">${p.stock>0?'موجود در فروشگاه':'فعلاً ناموجود'}</small>`:'<h3>این محصول در حال حاضر در دسترس نیست.</h3>'}<div class="account-actions">${p?`<button class="primary-button" type="button" data-add-to-cart="${profileEscape(p.id)}" ${p.stock>0?'':'disabled'}><i class="fa-solid fa-cart-plus" aria-hidden="true"></i> افزودن به سبد</button>`:''}<button class="secondary-button" type="button" data-account-action="remove-wish" data-id="${profileEscape(productId)}">حذف</button></div></article>`).join('')}</div>`:accountEmpty('محصولات دلخواهتان را با دکمه قلب در فروشگاه ذخیره کنید.','fa-heart',true)}</section>`;
}
function safeImage(value) {return (window.Web2SafeURL?.image(value)||'img/product-placeholder.svg');}
function accountSecurity({sessions,twoFactor,events}) {
    return `<section class="account-panel"><h2>تغییر رمز عبور</h2><p class="account-muted">حداقل ۱۲ کاراکتر و حداکثر ۷۲ بایت UTF-8. پس از تغییر رمز، نشست‌های قبلی پایان می‌یابند.</p><form id="accountPasswordForm" class="account-form">${accountField('رمز عبور فعلی','currentPassword','','type="password" required maxlength="72" autocomplete="current-password"',true)}${accountField('رمز عبور جدید','newPassword','','type="password" required minlength="12" maxlength="72" autocomplete="new-password"')}${accountField('تکرار رمز عبور جدید','confirmPassword','','type="password" required minlength="12" maxlength="72" autocomplete="new-password"')}<div class="account-actions account-full"><button class="primary-button" type="submit">تغییر رمز عبور</button></div></form></section><section class="account-panel"><h2>تأیید دومرحله‌ای</h2><p class="account-muted">وضعیت: ${twoFactor.enabled?'فعال':'غیرفعال'}${twoFactor.enabled?` · ${Number(twoFactor.recoveryCodesRemaining).toLocaleString('fa-IR')} کد بازیابی باقی مانده`:''}</p>${twoFactor.enabled?`<form id="accountRecoveryCodesForm" class="account-form">${accountField('رمز عبور فعلی','currentPassword','','type="password" required autocomplete="current-password"')}${accountField('کد تأیید یا بازیابی','code','','required autocomplete="one-time-code" dir="ltr"')}<button class="secondary-button" type="submit">ساخت کدهای بازیابی تازه</button></form><form id="accountDisableTwoFactor" class="account-form">${accountField('رمز عبور فعلی','currentPassword','','type="password" required autocomplete="current-password"')}${accountField('کد تأیید یا بازیابی','code','','required autocomplete="one-time-code" dir="ltr"')}<button class="secondary-button" type="submit">غیرفعال کردن تأیید دومرحله‌ای</button></form>`:twoFactor.setupAvailable?`<form id="accountStartTwoFactor" class="account-form">${accountField('رمز عبور فعلی','currentPassword','','type="password" required autocomplete="current-password"')}<button class="secondary-button" type="submit">فعال‌سازی با برنامه احراز هویت</button></form><div id="accountFactorSetup"></div>`:'<p class="account-muted">تنظیمات تأیید دومرحله‌ای روی سرور هنوز آماده نیست.</p>'}</section><section class="account-panel"><h2>دستگاه‌ها و نشست‌های فعال</h2><div class="account-list">${sessions.map(s=>`<article class="account-row"><div><strong>${profileEscape(s.device)}</strong><small class="account-muted">شروع: ${profileDate(s.createdAt)} · آخرین فعالیت: ${profileDate(s.lastActivity)}${s.ip?' · IP تقریبی: '+profileEscape(s.ip):''}</small></div>${s.current?'<span class="account-badge shipped">نشست فعلی</span>':`<button class="secondary-button" type="button" data-account-action="revoke-session" data-id="${profileEscape(s.id)}">بستن نشست</button>`}</article>`).join('')}</div><div class="account-actions"><button class="secondary-button" type="button" data-account-action="logout">خروج از نشست فعلی</button><button class="secondary-button" type="button" data-account-action="logout-others">خروج از دستگاه‌های دیگر</button></div></section><section class="account-panel"><h2>رویدادهای امنیتی اخیر</h2><div class="account-list">${events.length?events.map(e=>`<div class="account-row"><strong dir="ltr">${profileEscape(e.action)}</strong><small>${profileDate(e.createdAt)}</small></div>`).join(''):'<p class="account-muted">رویدادی ثبت نشده است.</p>'}</div></section>`;
}
function accountNotifications(data) {
    return `<section class="account-panel"><div class="account-topbar"><h2>اعلان‌های شما</h2>${data.unread?'<button class="secondary-button" type="button" data-account-action="read-all">خواندن همه</button>':''}</div><div class="account-list">${data.items.length?data.items.map(n=>`<article class="account-row account-notification ${n.readAt?'is-read':''}"><div><strong>${profileEscape(n.title)}</strong><p class="account-muted">${profileEscape(n.message)}</p><small class="account-muted">${profileDate(n.createdAt)}</small></div><div class="account-actions">${n.type==='order'&&n.resourceId?`<button class="secondary-button" type="button" data-account-action="order" data-id="${profileEscape(n.resourceId)}">مشاهده سفارش</button>`:''}${n.type==='ticket'&&n.resourceId?`<button class="secondary-button" type="button" data-account-action="ticket" data-id="${profileEscape(n.resourceId)}">مشاهده پاسخ</button>`:''}${n.readAt?'<span class="account-muted">خوانده‌شده</span>':`<button class="secondary-button" type="button" data-account-action="read-notification" data-id="${profileEscape(n.id)}">خواندم</button>`}</div></article>`).join(''):accountEmpty('هنوز اعلان جدیدی برای شما ثبت نشده است.','fa-bell')}</div></section>`;
}
function accountSupport(rows) {
    return `<section class="account-panel"><h2>یک پیام تا پشتیبانی</h2><p class="account-muted">موضوع و شرح درخواست را بنویسید؛ پاسخ تیم فروشگاه در همین بخش نمایش داده می‌شود.</p><form id="accountTicketForm" class="account-form">${accountField('موضوع','subject','','required minlength="3" maxlength="150"')}<label class="field"><span>دسته‌بندی</span><select name="category">${Object.entries(accountCategories).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label class="field account-full"><span>متن پیام</span><textarea name="message" required minlength="5" maxlength="4000" placeholder="چطور می‌توانیم کمک کنیم؟"></textarea></label><div class="account-actions account-full"><button class="primary-button" type="submit">ثبت درخواست پشتیبانی</button></div></form></section><section class="account-panel"><h2>درخواست‌های قبلی شما</h2><div class="account-list">${rows.length?rows.map(t=>`<article class="account-row"><div><strong>${profileEscape(t.subject)}</strong><small class="account-muted">${profileEscape(accountCategories[t.category])} · ${profileDate(t.updatedAt)}</small></div><div class="account-actions">${accountBadge(t.status)}<button class="secondary-button" type="button" data-account-action="ticket" data-id="${profileEscape(t.id)}">مشاهده گفتگو</button></div></article>`).join(''):accountEmpty('هنوز درخواست پشتیبانی ثبت نکرده‌اید.','fa-headset')}</div></section>`;
}
function accountTicket(t) {
    return `<section class="account-panel"><div class="account-topbar"><h2>${profileEscape(t.subject)}</h2><button class="secondary-button" type="button" data-account-section="support">بازگشت</button></div>${accountBadge(t.status)} <span class="account-muted">${profileEscape(accountCategories[t.category])} · ${profileDate(t.createdAt)}</span>${t.messages.map(m=>`<article class="account-message ${m.author==='admin'?'admin':''}"><strong>${m.author==='admin'?'پشتیبانی WEB 2':'شما'}</strong><p>${profileEscape(m.message)}</p><small class="account-muted">${profileDate(m.createdAt)}</small></article>`).join('')}${t.status==='closed'?'<p class="account-muted">این گفتگو بسته شده است. برای موضوع جدید، درخواست دیگری ثبت کنید.</p>':`<form id="accountReplyForm" class="account-form"><label class="field account-full"><span>پیام جدید</span><textarea name="message" required minlength="5" maxlength="4000"></textarea></label><div class="account-actions account-full"><button class="primary-button" type="submit">ارسال پیام</button></div></form>`}</section>`;
}
async function accountLoadSection(section=accountState.section) {
    if(!Web2.user)return;
    const generation=++accountState.generation;
    accountState.section=section;
    const target=document.getElementById('accountSection');if(!target)return;
    document.getElementById('accountTitle').textContent=accountMenu.find(m=>m[0]===section)?.[1]||'داشبورد';
    document.querySelectorAll('.account-nav [data-account-section]').forEach(b=>{if(b.dataset.accountSection===section)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    target.innerHTML='<div class="account-loading" role="status">در حال دریافت اطلاعات…</div>';target.setAttribute('aria-busy','true');
    try {
        let html,dashboard,user,addresses,unread;
        if(section==='dashboard'){dashboard=await profileRequest('/api/account/dashboard');user=dashboard.user;html=accountDashboard(dashboard);}
        if(section==='info'){user=await profileRequest('/api/users/me');html=accountInfo(user);}
        if(section==='orders'){const data=await profileRequest('/api/orders?'+new URLSearchParams({page:String(accountState.orderPage),pageSize:'20'}));const rows=Array.isArray(data)?data:data.items;html=`<section class="account-panel"><h2>سفارش‌های من</h2>${accountOrderRows(rows)}${data.pages>1?`<nav class="catalog-pagination" aria-label="صفحه‌بندی سفارش‌ها"><button class="secondary-button" data-account-action="order-prev" ${accountState.orderPage<=1?'disabled':''}>قبلی</button><span>${accountState.orderPage} / ${data.pages}</span><button class="secondary-button" data-account-action="order-next" ${accountState.orderPage>=data.pages?'disabled':''}>بعدی</button></nav>`:''}</section>`;}
        if(section==='addresses'){addresses=await profileRequest('/api/users/me/addresses');html=accountAddresses(addresses);}
        if(section==='wishlist')html=accountWishlist(await profileRequest('/api/users/me/wishlist'));
        if(section==='security'){const [sessions,security]=await Promise.all([profileRequest('/api/users/me/sessions'),profileRequest('/api/users/me/security')]);html=accountSecurity({sessions,...security});}
        if(section==='notifications'){const data=await profileRequest('/api/users/me/notifications');unread=data.unread;html=accountNotifications(data);}
        if(section==='support'){accountState.ticket=null;html=accountSupport(await profileRequest('/api/tickets'));}
        if(generation!==accountState.generation||!Web2.user)return;
        if(dashboard){accountState.dashboard=dashboard;accountState.unread=dashboard.stats.unread;}
        if(user)Web2.user=user;
        if(addresses){accountState.addresses=addresses;Web2.user.addresses=addresses;}
        if(unread!==undefined){accountState.unread=unread;if(accountState.dashboard)accountState.dashboard.stats.unread=unread;}
        target.innerHTML=html;target.removeAttribute('aria-busy');accountUpdateIdentity();
    }catch(error){if(generation!==accountState.generation)return;target.removeAttribute('aria-busy');target.innerHTML=accountEmpty(error.message,'fa-triangle-exclamation')+'<button class="secondary-button" type="button" data-account-action="refresh">تلاش دوباره</button>';accountNotice(error.message,'error');}
}
async function accountBoot() {
    if(!Web2.user){accountState.userId=null;accountState.dashboard=null;accountState.unread=0;accountState.addresses=[];accountState.ticket=null;accountState.reads.clear();accountState.generation++;accountState.boot=null;document.getElementById('accountDialog')?.close();accountAuthSecure();return;}
    if(accountState.boot&&accountState.userId===Web2.user.id)return accountState.boot;
    accountState.userId=Web2.user.id;accountState.orderPage=1;accountState.section='dashboard';accountState.dashboard=null;accountState.unread=0;accountState.addresses=[];accountState.ticket=null;accountShell();
    const section=new URLSearchParams(location.search).get('section');
    const task=accountLoadSection(accountMenu.some(([key])=>key===section)?section:'dashboard').finally(()=>{if(accountState.boot===task)accountState.boot=null;});accountState.boot=task;return task;
}
async function accountOpenOrder(id) {
    const dialog=document.getElementById('accountDialog');dialog.showModal();
    document.getElementById('accountDialogTitle').textContent='جزئیات سفارش';
    document.getElementById('accountDialogBody').innerHTML='<div class="account-loading">در حال دریافت سفارش…</div>';
    const o=await profileRequest('/api/orders/'+encodeURIComponent(id));
    if(!Web2.user||!dialog.isConnected)return;
    document.getElementById('accountDialogBody').innerHTML=`<div class="account-actions"><strong dir="ltr">${profileEscape(o.code)}</strong>${accountBadge(o.status)}<span class="account-muted">${profileDate(o.createdAt)}</span></div>${o.paymentStatus==='test'?'<p class="account-muted">پرداخت این سفارش آزمایشی بوده و وجهی دریافت نشده است.</p>':''}<div class="account-table-wrap"><table class="account-table"><thead><tr><th>محصول</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>${o.items.map(i=>`<tr><td>${profileEscape(i.name)}</td><td>${Number(i.quantity).toLocaleString('fa-IR')}</td><td>${profilePrice(i.unitPrice??i.price)}</td><td>${profilePrice(i.lineTotal??i.price*i.quantity)}</td></tr>`).join('')}</tbody></table></div><dl class="account-definition"><div><dt>جمع کالاها</dt><dd>${profilePrice(o.subtotal)}</dd></div><div><dt>تخفیف ${profileEscape(o.discountCode||'')}</dt><dd>${profilePrice(o.discount)}</dd></div><div><dt>هزینه ارسال</dt><dd>${profilePrice(o.shippingCost||0)}</dd></div><div><dt>مبلغ نهایی</dt><dd><strong>${profilePrice(o.total)}</strong></dd></div><div><dt>گیرنده</dt><dd>${profileEscape(o.recipientName)}</dd></div><div><dt>موبایل</dt><dd dir="ltr">${profileEscape(o.recipientPhone)}</dd></div><div><dt>آدرس ارسال</dt><dd>${profileEscape(o.recipientAddress)}</dd></div></dl>`;
}
async function accountOpenTicket(id) {
    const owner=Web2.user?.id,generation=accountState.generation;
    const t=await profileRequest('/api/tickets/'+encodeURIComponent(id));
    if(Web2.user?.id!==owner||generation!==accountState.generation)return;
    accountState.ticket=t;accountState.section='support';accountState.generation++;
    document.getElementById('accountTitle').textContent='پشتیبانی';
    document.querySelectorAll('.account-nav [data-account-section]').forEach(b=>{if(b.dataset.accountSection==='support')b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    document.getElementById('accountSection').innerHTML=accountTicket(t);
}
async function accountBusy(key,element,fn) {
    if(accountState.busy.has(key))return;
    accountState.busy.add(key);
    const buttons=element?.tagName==='FORM'?[...element.querySelectorAll('button')]:element?[element]:[];
    const previous=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);element?.setAttribute('aria-busy','true');
    const submit=element?.tagName==='FORM'?element.querySelector('[type="submit"]'):null,original=submit?.innerHTML;
    if(submit)submit.textContent=element.id==='profileAuth'?(element.elements.mode.value==='register'?'در حال ساخت حساب…':'در حال ورود…'):'در حال ذخیره…';
    try{await fn();}catch(error){accountNotice(error.message,'error');if(error.field&&element?.tagName==='FORM')accountFieldError(element.elements.namedItem(error.field),error.message);const dialogBody=document.getElementById('accountDialogBody');if(document.getElementById('accountDialog')?.open)dialogBody.textContent=error.message;}
    finally{buttons.forEach((b,i)=>b.disabled=previous[i]);if(submit)submit.innerHTML=original;element?.removeAttribute('aria-busy');accountState.busy.delete(key);if(element?.tagName==='FORM'&&element.querySelector('[data-captcha]'))accountResetCaptcha(element);}
}
function accountConfirm(message) {
    const dialog=document.getElementById('accountDialog');
    document.getElementById('accountDialogTitle').textContent='تأیید حذف';
    document.getElementById('accountDialogBody').innerHTML=`<p>${profileEscape(message)}</p><div class="account-actions" style="margin-top:20px"><button class="secondary-button" type="button" id="accountCancel">انصراف</button><button class="primary-button" type="button" id="accountConfirm">حذف آدرس</button></div>`;
    dialog.showModal();document.getElementById('accountCancel').focus();
    return new Promise(resolve=>{
        let result=false;
        dialog.addEventListener('close',()=>resolve(result),{once:true});
        document.getElementById('accountCancel').onclick=()=>dialog.close();
        document.getElementById('accountConfirm').onclick=()=>{result=true;dialog.close();};
    });
}
function accountShowRecoveryCodes(codes){
    const dialog=document.getElementById('accountDialog');
    document.getElementById('accountDialogTitle').textContent='کدهای بازیابی';
    document.getElementById('accountDialogBody').innerHTML=`<p>این کدها فقط همین یک بار نمایش داده می‌شوند. آن‌ها را در جای امن نگه دارید. هر کد یک بار قابل استفاده است.</p><ul dir="ltr">${codes.map(code=>`<li><code>${profileEscape(code)}</code></li>`).join('')}</ul><button type="button" class="primary-button" data-account-action="close-dialog">ذخیره کردم</button>`;
    dialog.showModal();dialog.querySelector('button').focus();
}
function accountJSON(method,body={}) {return {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};}
function accountBind() {
    const app=document.getElementById('profileApp');
    app.addEventListener('invalid',event=>{const field=event.target;if(!field.matches('input,select,textarea'))return;event.preventDefault();const label=field.closest('.field')?.querySelector('span')?.textContent||'این فیلد';const first=!field.form?.querySelector('[aria-invalid="true"]');accountFieldError(field,field.validity.valueMissing?`${label} را تکمیل کنید.`:field.name==='phone'?'موبایل را به صورت ۰۹ و یازده رقم وارد کنید.':`${label} معتبر نیست؛ مقدار و طول آن را بررسی کنید.`);if(first)field.focus();},true);
    app.addEventListener('input',event=>{if(event.target.matches('input,textarea'))accountFieldError(event.target);});
    app.addEventListener('change',e=>{
        if(e.target.id!=='profileAuthMode')return;
        const register=e.target.value==='register';
        document.getElementById('accountRegisterFields').hidden=!register;
        app.querySelectorAll('#accountRegisterFields input').forEach(i=>{i.required=register;i.disabled=!register;});
        const password=app.querySelector('[name="password"]');password.minLength=register?12:1;password.autocomplete=register?'new-password':'current-password';
        document.getElementById('accountPasswordHint').textContent=register?'حداقل ۱۲ کاراکتر و حداکثر ۷۲ بایت UTF-8.':'رمز حساب خود را وارد کنید.';
        document.getElementById('profileAuth').querySelector('[type="submit"]').textContent=register?'ساخت حساب':'ورود به حساب';accountNotice('');
        const form=e.target.form,host=form?.querySelector('[data-captcha]');
        if(host?.dataset.widgetId&&window.turnstile)window.turnstile.remove(host.dataset.widgetId);
        if(host){delete host.dataset.widgetId;host.textContent='در حال آماده‌سازی تأیید امنیتی…';form.querySelector('[name="captchaToken"]').value='';accountRenderCaptcha(form);}
    });
    app.addEventListener('submit',async e=>{
        const form=e.target.closest('form');if(!form)return;e.preventDefault();
        if(!form.reportValidity())return;
        const data=Object.fromEntries(new FormData(form));
        await accountBusy(form.id,form,async()=>{
            if(form.id==='profileAuth'){await accountCaptchaToken(form,data);const mode=data.mode;delete data.mode;const result=await Web2.authenticate(mode,data);if(result.twoFactorRequired){accountTwoFactorAuth();return;}const destination=accountReturnPath();if(destination){location.assign(destination);return;}await accountBoot();return;}
            if(form.id==='accountTwoFactorLogin'){await Web2.verifyTwoFactor(data.code);const destination=accountReturnPath();if(destination){location.assign(destination);return;}await accountBoot();return;}
            if(form.id==='forgotRequest'){await accountCaptchaToken(form,data);accountRecoveryState.phone=data.phone;const result=await Web2.request('/api/auth/forgot-password/request',accountJSON('POST',data));accountRecoveryState.challengeId=result.challengeId;accountForgot('verify',result);return;}
            if(form.id==='forgotVerify'){await accountCaptchaToken(form,data);data.challengeId=accountRecoveryState.challengeId;const result=await Web2.request('/api/auth/forgot-password/verify',accountJSON('POST',data));accountRecoveryState.resetToken=result.resetToken;accountForgot('reset',result);return;}
            if(form.id==='forgotReset'){if(data.password!==data.confirmPassword)throw new Error('تکرار رمز عبور یکسان نیست.');await accountCaptchaToken(form,data);data.challengeId=accountRecoveryState.challengeId;data.resetToken=accountRecoveryState.resetToken;const result=await Web2.request('/api/auth/forgot-password/reset',accountJSON('POST',data));accountRecoveryState.phone='';accountRecoveryState.challengeId='';accountRecoveryState.resetToken='';accountAuthSecure(result.message);return;}
            if(form.id==='profileEdit'){const updated=await profileRequest('/api/users/me',accountJSON('PUT',data));if(updated.csrfToken){Web2.csrfToken=updated.csrfToken;delete updated.csrfToken;}Web2.user=updated;await accountLoadSection('info');}
            if(form.id==='profileAddressForm'){const id=data.id;delete data.id;data.isDefault=data.isDefault==='true';await profileRequest('/api/users/me/addresses'+(id?'/'+encodeURIComponent(id):''),accountJSON(id?'PUT':'POST',data));await accountLoadSection('addresses');}
            if(form.id==='accountPasswordForm'){
                if(data.newPassword!==data.confirmPassword)throw new Error('تکرار رمز عبور یکسان نیست.');
                if(new TextEncoder().encode(data.newPassword).length>72)throw new Error('رمز جدید باید حداکثر ۷۲ بایت UTF-8 باشد.');
                const result=await profileRequest('/api/users/me/password',accountJSON('PUT',data));Web2.csrfToken=result.csrfToken;await accountLoadSection('security');accountNotice(result.message);return;
            }
            if(form.id==='accountStartTwoFactor'){
                const result=await profileRequest('/api/users/me/2fa/setup',accountJSON('POST',data));
                document.getElementById('accountFactorSetup').innerHTML=`<p>این کلید را فقط در برنامه احراز هویت خود وارد کنید و سپس کد شش رقمی را تأیید کنید.</p><code dir="ltr">${profileEscape(result.secret)}</code><form id="accountConfirmTwoFactor" class="account-form">${accountField('کد شش رقمی','code','','required pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" dir="ltr"')}<button class="primary-button" type="submit">تأیید و فعال‌سازی</button></form>`;
                form.reset();return;
            }
            if(form.id==='accountConfirmTwoFactor'){const result=await profileRequest('/api/users/me/2fa/confirm',accountJSON('POST',data));await accountLoadSection('security');accountShowRecoveryCodes(result.recoveryCodes);return;}
            if(form.id==='accountRecoveryCodesForm'){const result=await profileRequest('/api/users/me/2fa/recovery-codes',accountJSON('POST',data));await accountLoadSection('security');accountShowRecoveryCodes(result.recoveryCodes);return;}
            if(form.id==='accountDisableTwoFactor'){await profileRequest('/api/users/me/2fa/disable',accountJSON('POST',data));await accountLoadSection('security');accountNotice('تأیید دومرحله‌ای غیرفعال شد.');return;}
            if(form.id==='accountTicketForm'){const t=await profileRequest('/api/tickets',accountJSON('POST',data));await accountOpenTicket(t.id);}
            if(form.id==='accountReplyForm'){const t=await profileRequest('/api/tickets/'+encodeURIComponent(accountState.ticket.id)+'/messages',accountJSON('POST',data));accountState.ticket=t;document.getElementById('accountSection').innerHTML=accountTicket(t);}
            accountNotice('اطلاعات با موفقیت ذخیره شد.');
        });
    });
    app.addEventListener('click',async e=>{
        const auth=e.target.closest('[data-account-auth]');
        if(auth){const action=auth.dataset.accountAuth;if(action==='forgot'){accountForgot();return;}if(action==='login'){accountAuthSecure();return;}if(action==='resend'){await accountBusy('forgot-resend',auth,async()=>{const data={phone:accountRecoveryState.phone};const temp=document.getElementById('forgotVerify');await accountCaptchaToken(temp,data);const result=await Web2.request('/api/auth/forgot-password/request',accountJSON('POST',data));accountRecoveryState.challengeId=result.challengeId;accountForgot('verify',result);});return;}}
        const nav=e.target.closest('[data-account-section]');
        if(nav){accountNotice('');if(nav.dataset.accountSection===accountState.section&&!accountState.ticket)return;await accountLoadSection(nav.dataset.accountSection);return;}
        const button=e.target.closest('[data-account-action]');if(!button)return;
        const action=button.dataset.accountAction,id=button.dataset.id;
        await accountBusy(action+(id||''),button,async()=>{
            if(action==='logout'){await Web2.logout();location.replace('profile.html?loggedout=1');return;}
            if(action==='revoke-session'){await profileRequest('/api/users/me/sessions/'+encodeURIComponent(id),accountJSON('DELETE'));await accountLoadSection('security');return;}
            if(action==='logout-others'){await profileRequest('/api/users/me/sessions/logout-others',accountJSON('POST'));await accountLoadSection('security');accountNotice('نشست‌های دیگر بسته شدند.');return;}
            if(action==='order-prev'||action==='order-next'){accountState.orderPage=Math.max(1,accountState.orderPage+(action==='order-next'?1:-1));await accountLoadSection('orders');return;}
            if(action==='refresh'){accountNotice('');if(accountState.ticket)await accountOpenTicket(accountState.ticket.id);else await accountLoadSection();return;}
            if(action==='close-dialog'){document.getElementById('accountDialog').close();return;}
            if(action==='order'){await accountOpenOrder(id);return;}
            if(action==='ticket'){await accountOpenTicket(id);return;}
            if(action==='edit-address'){const a=accountState.addresses.find(a=>a.id===id);if(!a)return;document.getElementById('accountAddressEditor').outerHTML=accountAddressForm(a);document.getElementById('accountAddressEditor').scrollIntoView({behavior:'smooth',block:'start'});return;}
            if(action==='cancel-address'){document.getElementById('accountAddressEditor').outerHTML=accountAddressForm();return;}
            if(action==='delete-address'){if(!await accountConfirm('این آدرس از دفترچه شما حذف شود؟'))return;await profileRequest('/api/users/me/addresses/'+encodeURIComponent(id),accountJSON('DELETE'));await accountLoadSection('addresses');}
            if(action==='default-address'){await profileRequest('/api/users/me/addresses/'+encodeURIComponent(id),accountJSON('PUT',{isDefault:true}));await accountLoadSection('addresses');}
            if(action==='remove-wish'){await profileRequest('/api/users/me/wishlist/'+encodeURIComponent(id),accountJSON('DELETE'));window.dispatchEvent(new Event('web2:wishlist'));await accountLoadSection('wishlist');}
            if(action==='read-notification'||action==='read-all'){await profileRequest('/api/users/me/notifications/'+(action==='read-all'?'read':encodeURIComponent(id)+'/read'),accountJSON('PUT'));await accountLoadSection('notifications');}
            accountNotice('عملیات با موفقیت انجام شد.');
        });
    });
}
document.addEventListener('DOMContentLoaded',async()=>{
    if(document.body.dataset.page!=='profile')return;
    await Web2.ready;accountBind();
    window.addEventListener('web2:auth',()=>{if((Web2.user?.id||null)!==accountState.userId)accountBoot();});
    await accountBoot();
    if(Web2.sessionError)accountNotice(Web2.sessionError.message,'error');
    // Refresh server-driven sections on focus without replacing profile/address forms while editing.
    window.addEventListener('focus',()=>{
        if(Web2.user&&['dashboard','orders','notifications'].includes(accountState.section))accountLoadSection();
        else if(Web2.user&&accountState.section==='support'&&accountState.ticket&&!document.querySelector('#accountReplyForm textarea')?.value)accountOpenTicket(accountState.ticket.id).catch(e=>accountNotice(e.message,'error'));
    });
    window.addEventListener('pageshow',e=>{if(e.persisted){Web2.user=null;Web2.csrfToken=null;accountBoot();Web2.refresh().then(()=>accountBoot()).catch(()=>{Web2.user=null;accountBoot();});}});
});
