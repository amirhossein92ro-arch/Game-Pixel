(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Web2PC = api;
}(typeof window === 'object' ? window : globalThis, function (root) {
    'use strict';
    let timer, boundaryTimer, current, snapshot = [], verified = false, lastState;
    const number = value => new Intl.NumberFormat('fa-IR').format(value);
    const price = value => number(value) + ' تومان';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    function countdownParts(endAt, now = Date.now()) {
        const end = Date.parse(endAt);
        let seconds = Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 1000)) : 0;
        const days = Math.floor(seconds / 86400); seconds %= 86400;
        const hours = Math.floor(seconds / 3600); seconds %= 3600;
        return {days, hours, minutes: Math.floor(seconds / 60), seconds: seconds % 60};
    }
    function stopCountdown() { if (timer) root.clearTimeout(timer); timer = null; }
    function stop() { stopCountdown(); if (boundaryTimer) root.clearTimeout(boundaryTimer); boundaryTimer = null; }
    function watchBoundary() {
        if (!verified || !root.Web2ProductPricing || root.document?.hidden) return;
        const now = Date.now();
        const dates = snapshot.flatMap(product => {
            const campaign = root.Web2ProductPricing.normalizeCampaign(product.campaign);
            return campaign ? [Date.parse(campaign.startAt), Date.parse(campaign.endAt)] : [];
        }).filter(date => date > now);
        if (!dates.length) return;
        boundaryTimer = root.setTimeout(() => {
            render(snapshot, verified);
            root.document.dispatchEvent(new root.CustomEvent('web2:campaign-change'));
        }, Math.min(2147483647, Math.min(...dates) - now + 10));
    }
    function tick() {
        stopCountdown();
        const host = root.document?.getElementById('featuredPC');
        if (!host || !current || !root.Web2ProductPricing) return;
        const state = root.Web2ProductPricing.campaignState(current);
        if (state !== lastState) {
            render(snapshot, verified);
            root.document.dispatchEvent(new root.CustomEvent('web2:campaign-change'));
            return;
        }
        const parts = countdownParts(state === 'scheduled' ? current.campaign.startAt : current.campaign.endAt);
        for (const [key, value] of Object.entries(parts)) {
            const node = host.querySelector('[data-countdown="' + key + '"]');
            if (node) node.textContent = number(value).padStart(2, '۰');
        }
        if ((state === 'active' || state === 'scheduled') && !root.document.hidden) timer = root.setTimeout(tick, 1000);
    }
    function render(products, isVerified = false) {
        stop();
        snapshot = Array.isArray(products) ? products : []; verified = isVerified;
        const host = root.document?.getElementById('featuredPC');
        if (!host) { watchBoundary(); return; }
        const pricing = root.Web2ProductPricing;
        current = verified && snapshot.find(item => item.category === 'سیستم کامل گیمینگ' && pricing?.normalizeCampaign(item.campaign) && Array.isArray(item.components));
        host.setAttribute('aria-busy', 'false');
        if (!current || !root.Web2ProductPricing) {
            delete host.dataset.campaignState;
            host.innerHTML = '<div class="pc-unavailable"><span class="eyebrow">سیستم کامل WEB 2</span><h2 id="featuredPCTitle">یک سیستم؛ قطعات هماهنگ.</h2><p>پیشنهاد سیستم کامل پس از دریافت اطلاعات معتبر کاتالوگ نمایش داده می‌شود.</p><a class="secondary-button" href="/products">بررسی کاتالوگ</a></div>';
            return;
        }
        const state = pricing.campaignState(current);
        lastState = state;
        const unitPrice = pricing.unitPrice(current), discount = pricing.effectiveDiscount(current);
        const available = Number.isSafeInteger(current.stock) && current.stock > 0 && current.status !== 'inactive' && !current.discontinued && unitPrice > 0;
        const path = '/product.html?id=' + encodeURIComponent(current.id);
        const image = root.Web2SafeURL?.image(current.image, {allowData:false}) || 'img/product-placeholder.svg';
        const endDate = new Intl.DateTimeFormat('fa-IR', {dateStyle:'long', timeZone:'Asia/Tehran'}).format(new Date(current.campaign.endAt));
        const status = state === 'active' ? 'فروش ویژه فعال است' : state === 'scheduled' ? 'آغاز فروش ویژه به‌زودی' : 'این فروش ویژه به پایان رسیده است';
        host.dataset.campaignState = state;
        host.innerHTML = `
            <div class="pc-stage reveal reveal-scale">
                <span class="pc-orbit" aria-hidden="true"></span>
                <span class="pc-edition">WEB 2 / COMPLETE BUILD</span>
                <a class="pc-image-link" href="${path}"><img class="pc-system-image" src="${escape(image.startsWith('img/') ? '/' + image : image)}" width="560" height="520" loading="lazy" decoding="async" alt="${escape(current.name)}"></a>
                <div class="pc-floating-note glass-surface"><i class="fa-solid fa-microchip" aria-hidden="true"></i><span>قطعات هماهنگ<strong>آماده برای ستاپ بعدی شما</strong></span></div>
                ${state === 'active' && discount > 0 ? `<span class="pc-sale-badge">${number(discount)}٪<small>تخفیف کاتالوگ</small></span>` : ''}
            </div>
            <div class="pc-content reveal reveal-up">
                <span class="eyebrow">انتخاب ویژه • سیستم کامل</span>
                <h2 id="featuredPCTitle">سیستم کامل ویژه WEB 2</h2>
                <p class="pc-model">${escape(current.name)}</p>
                <p class="pc-description">${escape(current.shortDescription)}</p>
                <dl class="pc-components">${current.components.map(component => {
                    const item = snapshot.find(product => String(product.id) === String(component.productId));
                    return `<div><dt>${escape(component.label)}</dt><dd>${item ? `<a href="/product.html?id=${encodeURIComponent(item.id)}">${escape(component.value)}</a>` : escape(component.value)}</dd></div>`;
                }).join('')}</dl>
                <div class="pc-campaign-status" role="status">${status}</div>
                ${state !== 'expired' && state !== 'none' ? `<div class="pc-countdown" role="timer" aria-live="off" aria-label="${state === 'active' ? 'زمان باقی‌مانده فروش ویژه' : 'زمان باقی‌مانده تا شروع'}">${[['days','روز'],['hours','ساعت'],['minutes','دقیقه'],['seconds','ثانیه']].map(([key,label]) => `<div><strong data-countdown="${key}">۰۰</strong><span>${label}</span></div>`).join('')}</div><p class="pc-campaign-date">پایان کمپین: ${escape(endDate)} • قیمت نهایی در بررسی سفارش تأیید می‌شود.</p>` : '<p class="pc-campaign-date">قیمت عادی کاتالوگ نمایش داده می‌شود.</p>'}
                <div class="pc-purchase"><div class="pc-price">${discount > 0 ? `<del>${price(current.price)}</del>` : ''}<strong>${price(unitPrice)}</strong>${discount > 0 ? `<small>${price(current.price - unitPrice)} صرفه‌جویی</small>` : ''}</div><span class="pc-stock${available ? '' : ' out-of-stock'}">${available ? number(current.stock) + ' سیستم موجود' : 'ناموجود'}</span></div>
                <div class="pc-actions"><button class="primary-button" type="button" data-add-to-cart="${escape(current.id)}"${available ? '' : ' disabled'}><i class="fa-solid fa-cart-plus" aria-hidden="true"></i> ${available ? 'افزودن سیستم به سبد' : 'ناموجود'}</button><a class="secondary-button" href="${path}">مشخصات کامل <span aria-hidden="true">←</span></a></div>
                <p class="pc-warranty">${escape(current.guarantee)} • <a href="/profile.html?section=support">پرسش از پشتیبانی</a></p>
            </div>`;
        tick();
    }
    function renderHeaderPreviews({items = [], isVerified = false, signedIn = false} = {}) {
        const actions = root.document?.querySelector('.nav-actions');
        if (!actions) return;
        const bind = (trigger, id, label) => {
            if (!trigger) return null;
            let panel = root.document.getElementById(id);
            if (panel) return panel;
            panel = root.document.createElement('aside');
            panel.id = id; panel.className = 'header-preview glass-surface'; panel.hidden = true;
            panel.setAttribute('aria-label', label); actions.append(panel);
            trigger.setAttribute('aria-controls', id); trigger.setAttribute('aria-expanded', 'false');
            let closing;
            const hide = () => { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
            const show = () => {
                root.clearTimeout(closing);
                actions.querySelectorAll('.header-preview').forEach(other => { if (other !== panel) other.hidden = true; });
                actions.querySelectorAll('[aria-controls]').forEach(other => { if (other !== trigger) other.setAttribute('aria-expanded', 'false'); });
                panel.hidden = false; trigger.setAttribute('aria-expanded', 'true');
            };
            const leave = () => { closing = root.setTimeout(() => { if (!panel.contains(root.document.activeElement) && root.document.activeElement !== trigger) hide(); }, 180); };
            trigger.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(); });
            trigger.addEventListener('focus', show);
            trigger.addEventListener('pointerleave', leave);
            panel.addEventListener('pointerenter', () => root.clearTimeout(closing));
            panel.addEventListener('pointerleave', leave);
            [trigger, panel].forEach(node => node.addEventListener('focusout', event => { if (event.relatedTarget !== trigger && !panel.contains(event.relatedTarget)) hide(); }));
            panel.addEventListener('keydown', event => { if (event.key === 'Escape') { trigger.focus(); hide(); } });
            trigger.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
            root.document.addEventListener('click', event => { if (!panel.contains(event.target) && !trigger.contains(event.target)) hide(); });
            return panel;
        };
        const cart = bind(actions.querySelector('.cart-button'), 'headerCartPreview', 'خلاصه سبد خرید');
        if (cart) cart.innerHTML = `<strong>سبد خرید شما</strong>${isVerified && items.length ? `<ul>${items.slice(0, 3).map(item => `<li><a href="/product.html?id=${encodeURIComponent(item.id)}">${escape(item.name)}</a><small>${number(item.quantity)} × ${price(item.unitPrice)}</small></li>`).join('')}</ul><p>جمع کالاها: <b>${price(items.reduce((sum,item) => sum + item.quantity * item.unitPrice, 0))}</b></p><small>هزینه ارسال و تخفیف نهایی در بررسی سفارش مشخص می‌شود.</small>` : `<p>${isVerified ? 'سبد خرید شما خالی است.' : 'برای بررسی موجودی و قیمت، سبد خرید را باز کنید.'}</p>`}<a class="secondary-button" href="/cart.html">مشاهده سبد خرید ←</a>`;
        const account = bind(actions.querySelector('.profile-button'), 'headerAccountPreview', 'حساب کاربری');
        if (account) account.innerHTML = `<strong>${signedIn ? 'حساب کاربری شما' : 'به WEB 2 خوش آمدید'}</strong><p>${signedIn ? 'سفارش‌ها و علاقه‌مندی‌ها در یک جا.' : 'برای پیگیری سفارش و ذخیره علاقه‌مندی‌ها وارد شوید.'}</p><a href="/profile.html" class="secondary-button">${signedIn ? 'مشاهده حساب' : 'ورود / ثبت‌نام'}</a><a href="/profile.html?section=orders">سفارش‌های من</a><a href="/profile.html?section=wishlist">علاقه‌مندی‌ها</a>`;
    }
    const resume = () => {
        if (!verified) return;
        const changed = current && root.Web2ProductPricing?.campaignState(current) !== lastState;
        render(snapshot, verified);
        if (changed || !root.document?.getElementById('featuredPC')) root.document?.dispatchEvent(new root.CustomEvent('web2:campaign-change'));
    };
    root.document?.addEventListener('visibilitychange', () => { if (root.document.hidden) stop(); else resume(); });
    root.addEventListener?.('pagehide', stop);
    root.addEventListener?.('pageshow', resume);
    return Object.freeze({render, renderHeaderPreviews, countdownParts, stop});
}));
