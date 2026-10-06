"use strict";
window.Web2 = {
    user: null, csrfToken: null, adminCsrf: null,
    async request(url, options = {}) {
        let response;
        try {
            response = await fetch(url, {...options, credentials: 'include', headers: {Accept: 'application/json', ...options.headers}});
        } catch {
            throw new Error('ارتباط با API برقرار نشد. سرور را با npm start اجرا کنید و فروشگاه را از آدرس سرور (پیش‌فرض http://localhost:5000) باز کنید.');
        }
        const ok = response.ok;
        if (response.status === 204 && ok) return null;
        if (!/^application\/(?:json|[\w.-]+\+json)(?:\s*;|$)/i.test(response.headers.get('Content-Type') || '')) {
            throw new Error('پاسخ API معتبر نیست؛ آدرس API در js/api-config.js و پورت سرور Node را بررسی کنید.');
        }
        let data;
        try { data = await response.json(); }
        catch { throw new Error('پاسخ سرور قابل پردازش نیست؛ دوباره تلاش کنید.'); }
        if (!ok) throw Object.assign(new Error(response.status >= 500 ? 'خطای سرور؛ کمی بعد دوباره تلاش کنید.' : data?.error || 'درخواست انجام نشد.'), {status: response.status});
        return data;
    },
    async refresh() {
        const data = await this.request('/api/auth/session');
        this.user = data.user; this.csrfToken = data.csrfToken;
        return this.user;
    },
    async authenticate(mode, fields) {
        if (!['login', 'register'].includes(mode)) throw new Error('عملیات ورود نامعتبر است.');
        await this.ready;
        const data = await this.request(`/api/auth/${mode}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});
        this.user = data.user; this.csrfToken = data.csrfToken;
        window.dispatchEvent(new Event('web2:auth')); return data.user;
    },
    async logout() {
        await this.ready;
        try { await this.request('/api/auth/logout', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); }
        catch (error) { if (error.status !== 401) throw error; }
        this.user = null; this.csrfToken = null;
        window.dispatchEvent(new Event('web2:auth'));
    }
};
// Add the session's CSRF token only to this application's API mutations.
const web2NativeFetch = window.fetch.bind(window);
window.fetch = async (input, options = {}) => {
    const raw = typeof input === 'string' ? input : input.url;
    const resolved = window.Web2Config?.apiUrl(raw) || raw;
    const url = new URL(resolved, window.location.href);
    const apiOrigin = new URL(window.Web2Config?.API_BASE_URL || window.location.origin).origin;
    const method = (options.method || 'GET').toUpperCase();
    const apiRequest = url.origin === apiOrigin && url.pathname.startsWith('/api/');
    if (apiRequest && !['GET','HEAD','OPTIONS'].includes(method)) {
        const token = url.pathname.startsWith('/api/admin/') ? Web2.adminCsrf : Web2.csrfToken;
        const headers = new Headers(options.headers || {});
        if (token) headers.set('X-CSRF-Token', token);
        options = {...options,headers};
    }
    if (apiRequest) options = {...options, credentials: 'include'};
    const target = resolved === raw ? input : (typeof input === 'string' ? resolved : new Request(resolved, input));
    return web2NativeFetch(target, options);
};
// Remove legacy profile/order caches, including plaintext passwords from the demo.
for (const key of ['gp_user','web2_orders']) {try {localStorage.removeItem(key);} catch {}}
Web2.ready = Web2.refresh().catch(() => null);
window.addEventListener('focus', () => Web2.refresh().then(() => window.dispatchEvent(new Event('web2:auth'))).catch(() => {}));
