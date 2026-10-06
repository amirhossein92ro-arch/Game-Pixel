"use strict";
const profileEscape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profilePrice = value => `${Number(value || 0).toLocaleString('fa-IR')} تومان`;
const profileDate = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('fa-IR',{year:'numeric',month:'short',day:'numeric'}) : '—';
const accountLabels = {pending:'در انتظار',paid:'پرداخت‌شده',processing:'در حال آماده‌سازی',shipped:'ارسال‌شده',delivered:'تحویل‌شده',cancelled:'لغوشده',open:'باز',answered:'پاسخ‌داده‌شده',closed:'بسته'};
const accountCategories = {order:'سفارش',payment:'پرداخت',product:'محصول',account:'حساب کاربری',other:'سایر'};
const accountIcons = {gamepad:'fa-gamepad',astronaut:'fa-user-astronaut',dragon:'fa-dragon',robot:'fa-robot',bolt:'fa-bolt',headset:'fa-headset'};
const accountMenu = [['dashboard','داشبورد','fa-gauge-high'],['info','اطلاعات حساب','fa-user'],['orders','سفارش‌های من','fa-bag-shopping'],['addresses','آدرس‌های من','fa-location-dot'],['wishlist','علاقه‌مندی‌ها','fa-heart'],['security','امنیت حساب','fa-shield-halved'],['notifications','اعلان‌ها','fa-bell'],['support','پشتیبانی','fa-headset']];
const accountState = {userId:null,section:'dashboard',dashboard:null,unread:0,addresses:[],ticket:null,reads:new Map(),busy:new Set(),generation:0,boot:null};
const accountBadge = status => `<span class="account-badge ${Object.hasOwn(accountLabels,status)?status:'closed'}">${profileEscape(accountLabels[status]||'نامشخص')}</span>`;
const accountEmpty = (text,icon='fa-box-open',shop=false) => `<div class="account-empty"><i class="fa-solid ${icon}" aria-hidden="true"></i><p>${profileEscape(text)}</p>${shop?'<a class="secondary-button" href="index.html#products">دیدن محصولات فروشگاه</a>':''}</div>`;
const accountAvatar = user => `<span class="account-avatar" aria-hidden="true"><i class="fa-solid ${accountIcons[user.avatar]||'fa-gamepad'}"></i></span>`;
function accountNotice(text,kind='success') {
    const el=document.getElementById('profileNotice');if(!el)return;
    el.textContent=text;el.dataset.kind=kind;el.hidden=!text;
}
async function profileRequest(url,options={}) {
    const read=!options.method||options.method==='GET';
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
    return `<label class="field${wide?' account-full':''}"><span>${label}</span><input name="${name}" value="${profileEscape(value)}" ${attributes}></label>`;
}
function accountAuth() {
    const app=document.getElementById('profileApp');
    app.innerHTML=`<section class="account-auth account-panel glass-panel"><div class="auth-brand rgb-text rgb-text-glow"><i class="fa-solid fa-gamepad" aria-hidden="true"></i> WEB 2</div><h1 class="rgb-text">به حساب خود وارد شوید</h1><p class="account-muted">سفارش‌ها، علاقه‌مندی‌ها و پشتیبانی فروشگاه، در یک جا.</p><div id="profileNotice" class="account-notice" role="status" aria-live="polite" hidden></div><form id="profileAuth" class="account-form"><label class="field"><span>ورود یا ثبت‌نام</span><select name="mode" id="profileAuthMode"><option value="login">ورود به حساب</option><option value="register">ساخت حساب جدید</option></select></label><div id="accountRegisterFields" class="account-form" hidden>${accountField('نام','name','','minlength="2" maxlength="100" autocomplete="given-name"')}${accountField('موبایل','phone','','pattern="09[0-9]{9}" maxlength="11" inputmode="tel" dir="ltr" autocomplete="tel"')}</div>${accountField('ایمیل','email','','type="email" required maxlength="200" dir="ltr" autocomplete="email"')}${accountField('رمز عبور','password','','type="password" required maxlength="72" autocomplete="current-password"')}<small class="account-muted" id="accountPasswordHint">رمز حساب خود را وارد کنید.</small><button class="primary-button" type="submit">ادامه <i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button></form><a class="account-muted" href="index.html">بازگشت به فروشگاه</a></section>`;
    if(new URLSearchParams(location.search).has('loggedout'))accountNotice('از حساب خارج شدید.');
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
    return orders.length?`<div class="account-list">${orders.map(o=>`<article class="account-row"><div><strong dir="ltr">${profileEscape(o.code)}</strong><small class="account-muted">${profileDate(o.createdAt)} · ${Number((o.items||[]).reduce((s,i)=>s+Number(i.quantity||0),0)).toLocaleString('fa-IR')} کالا</small></div><strong class="account-price">${profilePrice(o.total)}</strong><div class="account-actions">${accountBadge(o.status)}<button class="secondary-button" type="button" data-account-action="order" data-id="${profileEscape(o.id)}">مشاهده جزئیات</button></div></article>`).join('')}</div>`:accountEmpty('هنوز سفارشی ثبت نکرده‌اید.','fa-bag-shopping',true);
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
function safeImage(value) {return /^(?:img\/[\w./-]+|https:\/\/[^\s<>"']+|data:image\/(?:png|jpeg|webp|gif);base64,[\w+/=]+)$/.test(value||'')?value:'img/product-placeholder.svg';}
function accountSecurity(sessions) {
    return `<section class="account-panel"><h2>تغییر رمز عبور</h2><p class="account-muted">حداقل ۱۲ کاراکتر و حداکثر ۷۲ بایت UTF-8. پس از تغییر رمز، نشست‌های قبلی پایان می‌یابند.</p><form id="accountPasswordForm" class="account-form">${accountField('رمز عبور فعلی','currentPassword','','type="password" required maxlength="72" autocomplete="current-password"',true)}${accountField('رمز عبور جدید','newPassword','','type="password" required minlength="12" maxlength="72" autocomplete="new-password"')}${accountField('تکرار رمز عبور جدید','confirmPassword','','type="password" required minlength="12" maxlength="72" autocomplete="new-password"')}<div class="account-actions account-full"><button class="primary-button" type="submit">تغییر رمز عبور</button></div></form></section><section class="account-panel"><h2>نشست‌های فعال</h2><div class="account-list">${sessions.map(s=>`<article class="account-row"><div><strong>${profileEscape(s.device)}</strong><small class="account-muted">شروع: ${profileDate(s.createdAt)} · اعتبار تا ${profileDate(s.expiresAt)}</small></div>${s.current?'<span class="account-badge shipped">نشست فعلی</span>':'<span class="account-muted">نشست دیگر</span>'}</article>`).join('')}</div><div class="account-actions"><button class="secondary-button" type="button" data-account-action="logout">خروج از نشست فعلی</button></div></section>`;
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
        if(section==='orders')html=`<section class="account-panel"><h2>سفارش‌های من</h2>${accountOrderRows((await profileRequest('/api/orders')).slice().reverse())}</section>`;
        if(section==='addresses'){addresses=await profileRequest('/api/users/me/addresses');html=accountAddresses(addresses);}
        if(section==='wishlist')html=accountWishlist(await profileRequest('/api/users/me/wishlist'));
        if(section==='security')html=accountSecurity(await profileRequest('/api/users/me/sessions'));
        if(section==='notifications'){const data=await profileRequest('/api/users/me/notifications');unread=data.unread;html=accountNotifications(data);}
        if(section==='support'){accountState.ticket=null;html=accountSupport(await profileRequest('/api/tickets'));}
        if(generation!==accountState.generation||!Web2.user)return;
        if(dashboard){accountState.dashboard=dashboard;accountState.unread=dashboard.stats.unread;}
        if(user)Web2.user=user;
        if(addresses){accountState.addresses=addresses;Web2.user.addresses=addresses;}
        if(unread!==undefined){accountState.unread=unread;if(accountState.dashboard)accountState.dashboard.stats.unread=unread;}
        target.innerHTML=html;target.removeAttribute('aria-busy');accountUpdateIdentity();
    }catch(error){if(generation!==accountState.generation)return;target.removeAttribute('aria-busy');target.innerHTML=accountEmpty(error.message,'fa-triangle-exclamation');accountNotice(error.message,'error');}
}
async function accountBoot() {
    if(!Web2.user){accountState.userId=null;accountState.dashboard=null;accountState.unread=0;accountState.addresses=[];accountState.ticket=null;accountState.reads.clear();accountState.generation++;accountState.boot=null;document.getElementById('accountDialog')?.close();accountAuth();return;}
    if(accountState.boot&&accountState.userId===Web2.user.id)return accountState.boot;
    accountState.userId=Web2.user.id;accountState.section='dashboard';accountState.dashboard=null;accountState.unread=0;accountState.addresses=[];accountState.ticket=null;accountShell();
    const task=accountLoadSection('dashboard').finally(()=>{if(accountState.boot===task)accountState.boot=null;});accountState.boot=task;return task;
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
    try{await fn();}catch(error){accountNotice(error.message,'error');const dialogBody=document.getElementById('accountDialogBody');if(document.getElementById('accountDialog')?.open)dialogBody.textContent=error.message;}
    finally{buttons.forEach((b,i)=>b.disabled=previous[i]);element?.removeAttribute('aria-busy');accountState.busy.delete(key);}
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
function accountJSON(method,body={}) {return {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};}
function accountBind() {
    const app=document.getElementById('profileApp');
    app.addEventListener('change',e=>{
        if(e.target.id!=='profileAuthMode')return;
        const register=e.target.value==='register';
        document.getElementById('accountRegisterFields').hidden=!register;
        app.querySelectorAll('#accountRegisterFields input').forEach(i=>{i.required=register;i.disabled=!register;});
        const password=app.querySelector('[name="password"]');password.minLength=register?12:1;password.autocomplete=register?'new-password':'current-password';
        document.getElementById('accountPasswordHint').textContent=register?'حداقل ۱۲ کاراکتر و حداکثر ۷۲ بایت UTF-8.':'رمز حساب خود را وارد کنید.';
    });
    app.addEventListener('submit',async e=>{
        const form=e.target.closest('form');if(!form)return;e.preventDefault();
        if(!form.reportValidity())return;
        const data=Object.fromEntries(new FormData(form));
        await accountBusy(form.id,form,async()=>{
            if(form.id==='profileAuth'){await Web2.authenticate(data.mode,data);await accountBoot();return;}
            if(form.id==='profileEdit'){Web2.user=await profileRequest('/api/users/me',accountJSON('PUT',data));await accountLoadSection('info');}
            if(form.id==='profileAddressForm'){const id=data.id;delete data.id;data.isDefault=data.isDefault==='true';await profileRequest('/api/users/me/addresses'+(id?'/'+encodeURIComponent(id):''),accountJSON(id?'PUT':'POST',data));await accountLoadSection('addresses');}
            if(form.id==='accountPasswordForm'){
                if(data.newPassword!==data.confirmPassword)throw new Error('تکرار رمز عبور یکسان نیست.');
                if(new TextEncoder().encode(data.newPassword).length>72)throw new Error('رمز جدید باید حداکثر ۷۲ بایت UTF-8 باشد.');
                const result=await profileRequest('/api/users/me/password',accountJSON('PUT',data));Web2.csrfToken=result.csrfToken;await accountLoadSection('security');accountNotice(result.message);return;
            }
            if(form.id==='accountTicketForm'){const t=await profileRequest('/api/tickets',accountJSON('POST',data));await accountOpenTicket(t.id);}
            if(form.id==='accountReplyForm'){const t=await profileRequest('/api/tickets/'+encodeURIComponent(accountState.ticket.id)+'/messages',accountJSON('POST',data));accountState.ticket=t;document.getElementById('accountSection').innerHTML=accountTicket(t);}
            accountNotice('اطلاعات با موفقیت ذخیره شد.');
        });
    });
    app.addEventListener('click',async e=>{
        const nav=e.target.closest('[data-account-section]');
        if(nav){accountNotice('');if(nav.dataset.accountSection===accountState.section&&!accountState.ticket)return;await accountLoadSection(nav.dataset.accountSection);return;}
        const button=e.target.closest('[data-account-action]');if(!button)return;
        const action=button.dataset.accountAction,id=button.dataset.id;
        await accountBusy(action+(id||''),button,async()=>{
            if(action==='logout'){await Web2.logout();location.replace('profile.html?loggedout=1');return;}
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
    // Refresh server-driven sections on focus without replacing profile/address forms while editing.
    window.addEventListener('focus',()=>{
        if(Web2.user&&['dashboard','orders','notifications'].includes(accountState.section))accountLoadSection();
        else if(Web2.user&&accountState.section==='support'&&accountState.ticket&&!document.querySelector('#accountReplyForm textarea')?.value)accountOpenTicket(accountState.ticket.id).catch(e=>accountNotice(e.message,'error'));
    });
    window.addEventListener('pageshow',e=>{if(e.persisted){Web2.user=null;Web2.csrfToken=null;accountBoot();Web2.refresh().then(()=>accountBoot()).catch(()=>{Web2.user=null;accountBoot();});}});
    window.setInterval(async()=>{
        if(!Web2.user||document.visibilityState!=='visible'||accountState.busy.size||accountState.reads.size)return;
        try {
            if(['dashboard','notifications'].includes(accountState.section))await accountLoadSection();
            else {
                const data=await profileRequest('/api/account/dashboard');accountState.dashboard=data;accountState.unread=data.stats.unread;accountUpdateIdentity();
                if(accountState.section==='orders')await accountLoadSection('orders');
                if(accountState.section==='support'&&accountState.ticket&&!document.querySelector('#accountReplyForm textarea')?.value)await accountOpenTicket(accountState.ticket.id);
            }
        }catch { /* The next manual refresh remains available after a transient failure. */ }
    },60000);
});
