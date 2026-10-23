"use strict";
document.addEventListener('DOMContentLoaded',()=>{
    if(document.body.dataset.page!=='admin')return;
    const dashboard=document.getElementById('adminDashboard');
    const tabs=document.querySelector('.admin-tabs');
    document.getElementById('adminStatsGrid').insertAdjacentHTML('beforeend','<article class="admin-stat-card"><div><strong id="adminTotalProducts">—</strong><small>کل محصولات</small></div></article><article class="admin-stat-card"><div><strong id="adminTotalUsers">—</strong><small>کل کاربران</small></div></article><article class="admin-stat-card"><div><strong id="adminLowStock">—</strong><small>موجودی کم (۵ عدد یا کمتر)</small></div></article>');
    dashboard.querySelector('[data-admin-panel="overview"]').insertAdjacentHTML('beforeend','<section class="glass-panel admin-data-panel"><h2 class="rgb-text">آخرین سفارش‌ها</h2><div id="adminLatestOrders" aria-live="polite"></div></section>');
    tabs.insertAdjacentHTML('beforeend','<button type="button" data-admin-tab="discounts">کدهای تخفیف</button>');
    dashboard.insertAdjacentHTML('beforeend',`<section class="admin-tab-panel" data-admin-panel="discounts" hidden><div class="glass-panel admin-data-panel"><h2 class="rgb-text">مدیریت کد تخفیف</h2><form id="adminDiscountForm"><input name="id" type="hidden"><label class="field"><span>کد</span><input name="code" required pattern="[A-Za-z0-9_-]{2,50}" dir="ltr"></label><label class="field"><span>نوع</span><select name="type"><option value="percent">درصد</option><option value="fixed">مبلغ به تومان</option></select></label><label class="field"><span>مقدار</span><input name="value" type="number" min="1" step="1" required></label><label class="field"><span>حداقل خرید</span><input name="minPurchase" type="number" min="0" value="0"></label><label class="field"><span>شروع</span><input name="startsAt" type="datetime-local"></label><label class="field"><span>تاریخ انقضا (اختیاری)</span><input name="expiresAt" type="datetime-local"></label><label class="field"><span>حداکثر دفعات مصرف (اختیاری)</span><input name="maxUses" type="number" min="1" step="1"></label><label class="field"><span>وضعیت</span><select name="active"><option value="true">فعال</option><option value="false">غیرفعال</option></select></label><button class="primary-button" type="submit">ذخیره</button><button class="secondary-button" type="reset">کد جدید</button></form><div id="adminDiscountList" aria-live="polite"></div></div></section>`);
    document.querySelector('#adminDiscountForm [name="maxUses"]').closest('label').insertAdjacentHTML('afterend','<label class="field"><span>سقف مصرف هر کاربر (اختیاری)</span><input name="perUserLimit" type="number" min="1" max="1000" step="1"></label><label class="field"><span>سقف مبلغ تخفیف (اختیاری)</span><input name="maxDiscount" type="number" min="1" step="1"></label>');
    let discounts=[],discountPage=1,discountPages=1;
    async function loadDiscounts(){
        const data=await adminRequest('/api/admin/discounts?page='+discountPage+'&pageSize=20');discounts=Array.isArray(data)?data:data.items;discountPages=data.pages||1;
        document.getElementById('adminDiscountList').innerHTML=discounts.map(d=>`<article class="admin-product-row"><strong>${escapeHTML(d.code)}</strong><span>${formatNumber(d.value)} ${d.type==='percent'?'٪':'تومان'} · ${d.active?'فعال':'غیرفعال'}</span><span>مصرف: ${formatNumber(d.uses)} / ${d.maxUses==null?'بدون سقف':formatNumber(d.maxUses)}</span><span>شروع: ${d.startsAt?escapeHTML(new Date(d.startsAt).toLocaleDateString('fa-IR')):'بدون محدودیت'}</span><span>پایان: ${d.expiresAt?escapeHTML(new Date(d.expiresAt).toLocaleDateString('fa-IR')):'بدون محدودیت'}</span><button class="secondary-button" type="button" data-edit-discount="${escapeHTML(d.id)}">ویرایش</button><button class="secondary-button" type="button" data-delete-discount="${escapeHTML(d.id)}">حذف</button></article>`).join('')||'<p>کدی ثبت نشده است.</p>';
        if(discountPages>1)document.getElementById('adminDiscountList').insertAdjacentHTML('beforeend',`<nav class="catalog-pagination" aria-label="صفحه‌بندی تخفیف‌ها"><button class="secondary-button" data-discount-page="prev" ${discountPage<=1?'disabled':''}>قبلی</button><span>${formatNumber(discountPage)} / ${formatNumber(discountPages)}</span><button class="secondary-button" data-discount-page="next" ${discountPage>=discountPages?'disabled':''}>بعدی</button></nav>`);
    }
    tabs.addEventListener('click',async e=>{
        const button=e.target.closest('[data-admin-tab]');if(!button)return;
        tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('is-active',b===button));
        dashboard.querySelectorAll('[data-admin-panel]').forEach(p=>{p.hidden=p.dataset.adminPanel!==button.dataset.adminTab;p.classList.toggle('is-active',!p.hidden);});
        try{if(button.dataset.adminTab==='discounts')await loadDiscounts();else if(button.dataset.adminTab==='users'&&window.Web2Users)await Web2Users.load();else if(['overview','orders','users'].includes(button.dataset.adminTab))await loadAdminDashboardData({ordersOnly:button.dataset.adminTab==='orders'});}catch(error){showToast(error.message,'error');}
    });
    let orderSearchTimer;
    document.getElementById('adminOrderFilter').insertAdjacentHTML('afterend','<label>مرتب‌سازی<select id="adminOrderSort"><option value="newest">جدیدترین</option><option value="oldest">قدیمی‌ترین</option><option value="total_desc">مبلغ بیشتر</option><option value="total_asc">مبلغ کمتر</option></select></label>');
    document.getElementById('adminOrderSearch')?.addEventListener('input',()=>{clearTimeout(orderSearchTimer);orderSearchTimer=setTimeout(()=>{adminOrderPage=1;loadAdminDashboardData({ordersOnly:true});},300);});
    document.getElementById('adminOrderFilter')?.addEventListener('change',()=>{clearTimeout(orderSearchTimer);adminOrderPage=1;loadAdminDashboardData({ordersOnly:true});});
    document.getElementById('adminOrderSort')?.addEventListener('change',()=>{clearTimeout(orderSearchTimer);adminOrderPage=1;loadAdminDashboardData({ordersOnly:true});});

    dashboard.addEventListener('change',async e=>{
        const order=e.target.closest('[data-order-status]'),role=e.target.closest('[data-user-role]');
        const control=order||role;if(!control||control.disabled)return;control.disabled=true;control.setAttribute('aria-busy','true');
        try{
            if(order&&order.value==='cancelled'&&!await Web2Admin.confirm('این سفارش لغو شود؟ موجودی اقلام برگردانده می‌شود و سفارش لغوشده قابل بازگشایی نیست.')){await loadAdminDashboardData();return;}
            if(order)await adminRequest(`/api/admin/orders/${order.dataset.orderStatus}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:order.value})});
            if(role) {const u=adminUsers.find(u=>String(u.id)===role.dataset.userRole);if(!await Web2Admin.confirm('نقش و دسترسی «'+u.name+'» تغییر کند؟ نشست‌های قبلی پایان می‌یابند.')){await loadAdminDashboardData();return;}await adminRequest(`/api/admin/users/${u.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:role.value,banned:u.banned})});}
            if(order||role)await loadAdminDashboardData();
        }catch(error){showToast(error.message,'error');await loadAdminDashboardData().catch(()=>{});}finally{control.disabled=false;control.removeAttribute('aria-busy');}
    });
    dashboard.addEventListener('click',async e=>{
        const discountButton=e.target.closest('[data-discount-page]');if(discountButton&&!discountButton.disabled){discountPage+=discountButton.dataset.discountPage==='next'?1:-1;await loadDiscounts();return;}
        const orderPage=e.target.closest('[data-order-page]');if(orderPage){adminOrderPage+=orderPage.dataset.orderPage==='next'?1:-1;await loadAdminDashboardData({ordersOnly:true});return;}
        const ban=e.target.closest('[data-user-ban]'),invoice=e.target.closest('[data-order-invoice]'),edit=e.target.closest('[data-edit-discount]'),history=e.target.closest('[data-user-orders]');
        try{
            if(ban){if(ban.disabled)return;const u=adminUsers.find(u=>String(u.id)===ban.dataset.userBan);ban.disabled=true;try{if(!u.banned&&!await Web2Admin.confirm('حساب «'+u.name+'» غیرفعال شود؟ نشست‌های آن پایان می‌یابند.'))return;await adminRequest(`/api/admin/users/${u.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:u.role,banned:!u.banned})});await loadAdminDashboardData();}finally{ban.disabled=false;}}
            if(invoice){const o=await adminRequest(`/api/admin/orders/${invoice.dataset.orderInvoice}`);await window.GamingInvoice.open(o);}
            if(history){document.getElementById('adminOrderSearch').value=adminUsers.find(u=>String(u.id)===history.dataset.userOrders)?.phone||'';tabs.querySelector('[data-admin-tab="orders"]').click();}
            if(edit){const d=discounts.find(d=>String(d.id)===edit.dataset.editDiscount),form=document.getElementById('adminDiscountForm');for(const [k,v]of Object.entries(d)){if(form.elements[k])form.elements[k].value=['expiresAt','startsAt'].includes(k)&&v?String(v).slice(0,16):v??'';}form.scrollIntoView({block:'start',behavior:'smooth'});}
        }catch(error){showToast(error.message,'error');}
    });
    document.getElementById('adminDiscountForm').addEventListener('submit',async e=>{
        e.preventDefault();const form=e.currentTarget;if(form.dataset.busy)return;form.dataset.busy='1';const submit=form.querySelector('[type=submit]');submit.disabled=true;const data=Object.fromEntries(new FormData(form)),id=data.id;delete data.id;data.active=data.active==='true';data.startsAt=data.startsAt?new Date(data.startsAt).toISOString():null;data.expiresAt=data.expiresAt?new Date(data.expiresAt).toISOString():null;
        try{await adminRequest('/api/admin/discounts'+(id?`/${id}`:''),{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});form.reset();await loadDiscounts();showToast('کد تخفیف ذخیره شد.');}catch(error){showToast(error.message,'error');}finally{delete form.dataset.busy;submit.disabled=false;}
    });
});
