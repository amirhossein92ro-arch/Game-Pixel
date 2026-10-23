"use strict";
window.Web2 = {
    user: null, csrfToken: null, adminCsrf: null, pendingCsrf: null, sessionVersion: 0, sessionError: null,
    errorMessage(status,data,url='') {
        if(status>=500)return 'سرویس موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید.';
        if(status===429)return 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.';
        if(status===401)return /\/login(?:[?#]|$)/.test(url) ? 'ایمیل یا نام کاربری و رمز عبور را بررسی کنید.' : 'نشست شما پایان یافته است؛ دوباره وارد شوید. سبد خرید حفظ شده است.';
        const message=typeof data?.error==='string'?data.error:'';
        if(/[\u0600-\u06ff]/.test(message)&&message.length<=300&&!/[<>]|SQLITE|TypeError|stack|passwordHash|Error:/i.test(message))return message;
        if(/\/quote(?:[?#]|$)/.test(url))return 'سبد یا کد تخفیف معتبر نیست؛ موجودی و شرایط کد را بررسی کنید.';
        if(/\/register(?:[?#]|$)/.test(url))return 'ثبت‌نام انجام نشد؛ اطلاعات و شرایط رمز عبور را بررسی کنید.';
        if(status===403)return 'اجازه انجام این درخواست وجود ندارد؛ صفحه را تازه کنید و دوباره وارد شوید.';
        return 'درخواست انجام نشد؛ اطلاعات را بررسی کنید و دوباره تلاش کنید.';
    },
    async request(url, options = {}) {
        let response;
        try {
            response = await fetch(url, {...options, credentials: 'include', headers: {Accept: 'application/json', ...options.headers}});
        } catch(error) {
            if(error?.name==='AbortError'||options.signal?.aborted)throw error;
            throw new Error('ارتباط برقرار نشد؛ اتصال اینترنت را بررسی کنید و دوباره تلاش کنید. اطلاعات سبد شما حفظ شده است.');
        }
        const ok = response.ok;
        if (response.status === 204 && ok) return null;
        if (!/^application\/(?:json|[\w.-]+\+json)(?:\s*;|$)/i.test(response.headers.get('Content-Type') || '')) {
            throw new Error('پاسخ معتبری دریافت نشد؛ صفحه را تازه کنید و دوباره تلاش کنید.');
        }
        let data;
        try { data = await response.json(); }
        catch { throw new Error('پاسخ سرور قابل پردازش نیست؛ دوباره تلاش کنید.'); }
        if (!ok) throw Object.assign(new Error(this.errorMessage(response.status,data,String(url))), {status: response.status,field:data?.field});
        return data;
    },
    async refresh({force=false}={}) {
        if(!force&&this.refreshPromise)return this.refreshPromise;
        const version=++this.sessionVersion;
        const task=this.request('/api/auth/session').then(data=>{
            if(version!==this.sessionVersion)return this.user;
            this.user=data.user;this.csrfToken=data.csrfToken;this.sessionError=null;return this.user;
        }).finally(()=>{if(this.refreshPromise===task)this.refreshPromise=null;});
        this.refreshPromise=task;return task;
    },
    async authenticate(mode, fields) {
        if (!['login', 'register'].includes(mode)) throw new Error('عملیات ورود نامعتبر است.');
        await this.ready;
        await this.refresh({force:true});
        ++this.sessionVersion;
        const data = await this.request(`/api/auth/${mode}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});
        if(data.twoFactorRequired){this.user=null;this.csrfToken=null;this.pendingCsrf=data.pendingCsrf;return {twoFactorRequired:true};}
        this.user = data.user; this.csrfToken = data.csrfToken;
        window.dispatchEvent(new Event('web2:auth')); return data.user;
    },
    async verifyTwoFactor(code){
        if(!this.pendingCsrf)throw new Error('تأیید ورود منقضی شده است؛ دوباره وارد شوید.');
        const data=await this.request('/api/auth/2fa/verify',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':this.pendingCsrf},body:JSON.stringify({code})});
        this.pendingCsrf=null;this.user=data.user;this.csrfToken=data.csrfToken;
        window.dispatchEvent(new Event('web2:auth'));return data.user;
    },
    async logout() {
        await this.ready;
        await this.refresh({force:true});
        ++this.sessionVersion;
        try { await this.request('/api/auth/logout', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); }
        catch (error) { if (error.status !== 401) throw error; }
        this.user = null; this.csrfToken = null;
        window.dispatchEvent(new Event('web2:auth'));
    }
};
// Add the session's CSRF token only to this application's API mutations.
const web2NativeFetch = window.fetch.bind(window);
window.fetch = async (input, options = {}) => {
    const raw = typeof input === 'string' ? input : (input.url || input.href);
    const resolved = window.Web2Config?.apiUrl(raw) || raw;
    const url = new URL(resolved, window.location.href);
    const apiOrigin = new URL(window.Web2Config?.API_BASE_URL || window.location.origin).origin;
    const method = (options.method || input.method || 'GET').toUpperCase();
    const apiRequest = url.origin === apiOrigin && url.pathname.startsWith('/api/');
    if (apiRequest && !['GET','HEAD','OPTIONS'].includes(method)) {
        const token = url.pathname==='/api/auth/2fa/verify'?Web2.pendingCsrf:/^\/api\/(?:admin\/|products(?:\/|$))/i.test(url.pathname) ? Web2.adminCsrf : Web2.csrfToken;
        const headers = new Headers(options.headers || input.headers || {});
        if (token) headers.set('X-CSRF-Token', token);
        options = {...options,headers};
    }
    if (apiRequest) options = {...options, credentials: 'include'};
    const target = resolved === raw ? input : (typeof input === 'string' ? resolved : new Request(resolved, input));
    return web2NativeFetch(target, options);
};
// Remove legacy profile/order caches, including plaintext passwords from the demo.
for (const key of ['gp_user','web2_orders']) {try {localStorage.removeItem(key);} catch {}}
Web2.ready = Web2.refresh().catch(error => { Web2.sessionError = error; return null; });
window.addEventListener('focus', () => Web2.refresh().then(() => window.dispatchEvent(new Event('web2:auth'))).catch(() => {}));
