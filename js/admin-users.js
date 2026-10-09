'use strict';
document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page !== 'admin') return;
    const box = document.getElementById('adminUsers'), pagination = document.getElementById('adminUserPagination');
    const filters = document.getElementById('adminUserFilters'), notice = document.getElementById('adminUsersNotice');
    const roles = {user:'کاربر',ADMIN:'مدیر',SUPER_ADMIN:'مدیر ارشد',ORDER_MANAGER:'مدیر سفارش',PRODUCT_MANAGER:'مدیر محصول',SUPPORT:'پشتیبانی'};
    const esc = value => escapeHTML(String(value ?? ''));
    const date = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('fa-IR') : '—';
    const json = (method,body) => ({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const api = (id,suffix = '') => '/api/admin/users/' + encodeURIComponent(id) + suffix;
    let page = 1, rows = [], generation = 0, controller, timer, loading;
    const editable = u => Web2Admin.principal?.role === 'SUPER_ADMIN' || (Web2Admin.principal?.role === 'ADMIN' && u.role === 'user');
    async function load() {
        if (!Web2Admin.principal || (!Web2Admin.can('customers.read') && !Web2Admin.can('customers.limited'))) return;
        const params = new URLSearchParams({page:String(page),pageSize:'20',q:document.getElementById('adminUserSearch').value.trim(),role:document.getElementById('adminUserRole').value,status:document.getElementById('adminUserStatus').value,sort:document.getElementById('adminUserSort').value});
        const key = params.toString();if (loading?.key === key) return loading.promise;
        controller?.abort(); controller = new AbortController(); const requestGeneration = ++generation;
        box.setAttribute('aria-busy','true'); notice.textContent = 'در حال دریافت کاربران…';
        const promise = (async () => {
            try {
                const data = await adminRequest('/api/admin/users?' + key,{signal:controller.signal});
                if (requestGeneration !== generation) return;
                if (page > Math.max(1,data.pages)) {page = Math.max(1,data.pages);loading = null;return load();}
                rows = data.items; render(); notice.textContent = formatNumber(data.total) + ' حساب';
                pagination.innerHTML = '<button class="secondary-button" type="button" data-users-page="prev" ' + (page <= 1 ? 'disabled' : '') + '>قبلی</button><span>صفحه ' + formatNumber(page) + ' از ' + formatNumber(Math.max(1,data.pages)) + '</span><button class="secondary-button" type="button" data-users-page="next" ' + (page >= data.pages ? 'disabled' : '') + '>بعدی</button>';
            } catch (error) {
                if (error.name !== 'AbortError' && requestGeneration === generation) {notice.textContent = error.message;box.innerHTML = '<div class="admin-error">دریافت کاربران انجام نشد. <button class="secondary-button" data-users-retry type="button">تلاش دوباره</button></div>';pagination.innerHTML = '';}
            } finally {if (requestGeneration === generation) {box.setAttribute('aria-busy','false');loading = null;}}
        })(); loading = {key,promise}; return promise;
    }
    async function activity() {
        if (!Web2Admin.can('audit.read')) return;
        const host = document.getElementById('adminUserActivity');
        try {const data = await adminRequest('/api/admin/audit');host.innerHTML = '<h2>فعالیت اخیر مدیریت</h2>' + data.items.slice(0,8).map(log => '<article class="admin-console-row"><strong>' + esc(log.admin) + '</strong><bdi>' + esc(log.action) + '</bdi><bdi>' + esc(log.targetId) + '</bdi><time>' + date(log.createdAt) + '</time></article>').join('');host.hidden = false;} catch(error) {host.textContent = error.message;}
    }
    const activityHost = document.createElement('section');activityHost.id = 'adminUserActivity';activityHost.className = 'glass-panel admin-data-panel';activityHost.hidden = true;document.querySelector('[data-admin-panel="overview"]').append(activityHost);
    window.addEventListener('web2:admin-ready',activity);
    window.Web2Users = {load};
    function render() {
        if (!rows.length) {box.innerHTML = '<div class="admin-empty-state"><h3>کاربری یافت نشد</h3></div>';return;}
        const headers = ['کاربر','ایمیل','موبایل','نقش','وضعیت','تاریخ عضویت','آخرین ورود','سفارش‌ها','مجموع خرید','عملیات'];
        box.innerHTML = '<table class="admin-table admin-users-table"><caption class="sr-only">حساب‌های ثبت‌شده و عملیات مدیریت</caption><thead><tr>' + headers.map(h => '<th scope="col">' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map(u => {
            const button = (action,label) => '<button type="button" class="secondary-button" data-um-action="' + action + '" data-um-id="' + esc(u.id) + '">' + label + '</button>';
            const cells = ['<strong>' + esc(u.name) + '</strong><small class="admin-user-id" dir="ltr">' + esc(u.id) + '</small>', '<bdi>' + esc(u.email || '—') + '</bdi>', '<bdi>' + esc(u.phone || '—') + '</bdi>', '<span class="admin-role-badge role-' + esc(u.role.toLowerCase()) + '">' + esc(roles[u.role] || u.role) + '</span>', '<span class="admin-status-badge ' + (u.banned ? 'is-disabled' : 'is-enabled') + '">' + (u.banned ? 'غیرفعال' : 'فعال') + '</span>', date(u.joinDate), date(u.lastLogin),formatNumber(u.orderCount),formatPrice(u.totalSpent), '<details class="admin-user-menu"><summary>عملیات</summary><div>' + button('view','مشاهده') + (Web2Admin.can('orders.read') ? button('orders','سفارش‌ها') : '') + (editable(u) ? button('edit','ویرایش') + (Web2Admin.principal.role === 'SUPER_ADMIN' ? button('role','تغییر نقش') : '') + button('reset','ریست رمز') + button('logout','خروج اجباری') + button('status',u.banned ? 'فعال کردن' : 'غیرفعال کردن') + (Web2Admin.principal.role === 'SUPER_ADMIN' && u.id !== Web2Admin.principal.id ? button('delete','حذف') : '') : '') + '</div></details>'];
            return '<tr>' + cells.map((cell,i) => '<td data-label="' + headers[i] + '">' + cell + '</td>').join('') + '</tr>';
        }).join('') + '</tbody></table>';
    }
    async function confirmed(u,message) {
        if (!await Web2Admin.confirm(message)) return null;
        if (u.role !== 'user' && !await Web2Admin.confirm('تأیید اضافه: این حساب مدیر است. تغییر دسترسی ' + u.name + ' را تأیید می‌کنید؟')) return null;
        return {confirm:true,adminConfirm:u.role !== 'user'};
    }
    function dialog(title, content, onSubmit) {
        const previous = document.activeElement, d = document.createElement('dialog');d.className = 'admin-confirm admin-user-dialog';d.setAttribute('aria-label',title);
        const h = document.createElement('h2');h.textContent = title;d.append(h);
        const form = document.createElement('form');form.innerHTML = content + '<p class="admin-form-error" role="alert"></p><div class="admin-confirm-actions"><button class="secondary-button" type="button" data-dialog-close>بستن</button>' + (onSubmit ? '<button class="primary-button" type="submit">ذخیره</button>' : '') + '</div>';d.append(form);
        const close = () => {if (form.dataset.busy) return;form.reset();d.close();d.remove();previous?.focus();};
        form.querySelector('[data-dialog-close]').addEventListener('click',close);d.addEventListener('cancel',e => {e.preventDefault();close();});
        form.addEventListener('submit',async e => {e.preventDefault();if (!onSubmit || form.dataset.busy || !form.reportValidity()) return;form.dataset.busy = '1';const submit = form.querySelector('[type="submit"]');submit.disabled = true;try {await onSubmit(form);delete form.dataset.busy;close();await load();await activity();showToast('تغییرات ذخیره شد.');} catch(error) {form.querySelector('[role="alert"]').textContent = error.message;} finally {const password = form.elements.namedItem('password');if (password) password.value = '';delete form.dataset.busy;submit.disabled = false;}});
        document.body.append(d);d.showModal();form.querySelector('input,select,[data-dialog-close]')?.focus();return d;
    }
    box.addEventListener('click',async e => {
        if (e.target.closest('[data-users-retry]')) {load();return;}
        const button = e.target.closest('[data-um-action]');if (!button || button.disabled) return;
        const u = rows.find(u => u.id === button.dataset.umId);if (!u) return;button.disabled = true;
        try {
            const action = button.dataset.umAction;
            if (action === 'view') {const detail = await adminRequest(api(u.id));dialog('جزئیات حساب','<dl class="admin-user-detail">' + Object.entries({شناسه:detail.id,نام:detail.name,ایمیل:detail.email,موبایل:detail.phone,نقش:roles[detail.role],وضعیت:detail.banned ? 'غیرفعال' : 'فعال','تاریخ عضویت':date(detail.joinDate),'آخرین ورود':date(detail.lastLogin),'تعداد سفارش':detail.orderCount,'مجموع خرید تأییدشده':formatPrice(detail.totalSpent)}).map(([k,v]) => '<dt>' + esc(k) + '</dt><dd><bdi>' + esc(v || '—') + '</bdi></dd>').join('') + '</dl>');}
            if (action === 'orders') {const orders = await adminRequest(api(u.id,'/orders'));dialog('سفارش‌های ' + u.name,orders.map(o => '<article class="admin-console-row"><strong>' + esc(o.code || o.id) + '</strong><span>' + esc(adminStatusLabel(o.status)) + '</span><span>' + formatPrice(o.total) + '</span><time>' + date(o.createdAt) + '</time></article>').join('') || '<p>سفارشی ثبت نشده است.</p>');}
            if (action === 'edit') {
                const fields = u.kind === 'admin' ? [['username','نام کاربری',u.username]] : [['name','نام',u.name],['email','ایمیل',u.email],['phone','موبایل',u.phone]];
                dialog('ویرایش ' + u.name,fields.map(([key,label,value]) => '<label class="field"><span>' + label + '</span><input name="' + key + '" value="' + esc(value) + '" required maxlength="' + (key === 'email' ? '200' : key === 'phone' ? '11' : '100') + '" ' + (key === 'email' ? 'type="email" dir="ltr"' : key === 'phone' ? 'inputmode="tel" pattern="09[0-9]{9}" dir="ltr"' : '') + '></label>').join(''),form => adminRequest(api(u.id),json('PATCH',Object.fromEntries(new FormData(form)))));
            }
            if (action === 'role') dialog('تغییر نقش ' + u.name,'<label class="field"><span>نقش</span><select name="role">' + (u.kind === 'admin' ? ['ADMIN','SUPER_ADMIN'] : ['user','ADMIN','SUPER_ADMIN']).map(role => '<option value="' + role + '" ' + (u.role === role ? 'selected' : '') + '>' + roles[role] + '</option>').join('') + '</select></label><p>نشست‌های قبلی باطل می‌شوند. مدیر جدید با ایمیل و رمز حساب از فرم ورود مدیریت وارد می‌شود.</p>',async form => {const confirmation = await confirmed(u,'نقش و دسترسی این حساب تغییر کند؟');if (!confirmation) throw Error('عملیات لغو شد.');await adminRequest(api(u.id,'/role'),json('PATCH',{role:form.elements.role.value,...confirmation}));});
            if (action === 'reset') dialog('ریست رمز ' + u.name,'<p>رمز فعلی نمایش داده نمی‌شود. رمز موقت را از یک مسیر امن به کاربر بدهید. همه نشست‌ها پایان می‌یابند.</p><label class="field"><span>رمز موقت جدید</span><input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="72"></label><small>حداقل ۱۲ کاراکتر، شامل حرف، عدد و نماد؛ حداکثر ۷۲ بایت.</small>',async form => {const confirmation = await confirmed(u,'رمز این حساب ریست شود و همه نشست‌ها پایان یابد؟');if (!confirmation) throw Error('عملیات لغو شد.');await adminRequest(api(u.id,'/reset-password'),json('POST',{password:form.elements.password.value,...confirmation}));});
            if (['status','logout','delete'].includes(action)) {
                const message = action === 'delete' ? 'آیا مطمئن هستید که میخواهید این حساب را حذف کنید؟ این عملیات قابل بازگشت نیست.' : action === 'logout' ? 'همه نشست‌های ' + u.name + ' پایان یابد؟' : 'وضعیت دسترسی ' + u.name + ' تغییر کند؟';
                const confirmation = await confirmed(u,message);if (!confirmation) return;
                const suffix = action === 'status' ? '/status' : action === 'logout' ? '/logout-all' : '';
                await adminRequest(api(u.id,suffix),json(action === 'delete' ? 'DELETE' : action === 'status' ? 'PATCH' : 'POST',{...confirmation,...(action === 'status' ? {status:u.banned ? 'active' : 'disabled'} : {})}));
                await load();await activity();showToast('عملیات انجام شد.');
            }
        } catch(error) {showToast(error.message,'error');} finally {button.disabled = false;}
    });
    document.getElementById('adminUsersRefresh').addEventListener('click',() => load());
    filters.addEventListener('submit',e => {e.preventDefault();clearTimeout(timer);page = 1;load();});
    filters.addEventListener('change',e => {if (e.target.tagName === 'SELECT') {page = 1;load();}});
    document.getElementById('adminUserSearch').addEventListener('input',() => {clearTimeout(timer);timer = setTimeout(() => {page = 1;load();},300);});
    pagination.addEventListener('click',e => {const button = e.target.closest('[data-users-page]');if (!button || button.disabled) return;page += button.dataset.usersPage === 'next' ? 1 : -1;load();});
});
