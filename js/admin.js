"use strict";
document.addEventListener('DOMContentLoaded',()=>{
    if(document.body.dataset.page!=='admin')return;
    const dashboard=document.getElementById('adminDashboard');
    const tabs=document.querySelector('.admin-tabs');
    document.getElementById('adminStatsGrid').insertAdjacentHTML('beforeend','<article class="admin-stat-card"><div><strong id="adminTotalProducts">—</strong><small>کل محصولات</small></div></article><article class="admin-stat-card"><div><strong id="adminTotalUsers">—</strong><small>کل کاربران</small></div></article><article class="admin-stat-card"><div><strong id="adminLowStock">—</strong><small>موجودی کم (۵ عدد یا کمتر)</small></div></article>');
    dashboard.querySelector('[data-admin-panel="overview"]').insertAdjacentHTML('beforeend','<section class="glass-panel admin-data-panel"><h2 class="rgb-text">آخرین سفارش‌ها</h2><div id="adminLatestOrders" aria-live="polite"></div></section>');
    tabs.insertAdjacentHTML('beforeend','<button type="button" data-admin-tab="discounts">کدهای تخفیف</button>');
    dashboard.insertAdjacentHTML('beforeend',`<section class="admin-tab-panel" data-admin-panel="discounts" hidden><div class="glass-panel admin-data-panel"><h2 class="rgb-text">مدیریت کد تخفیف</h2><form id="adminDiscountForm"><input name="id" type="hidden"><label class="field"><span>کد</span><input name="code" required pattern="[A-Za-z0-9_-]{2,50}" dir="ltr"></label><label class="field"><span>نوع</span><select name="type"><option value="percent">درصد</option><option value="fixed">مبلغ به تومان</option></select></label><label class="field"><span>مقدار</span><input name="value" type="number" min="1" step="1" required></label><label class="field"><span>حداقل خرید</span><input name="minPurchase" type="number" min="0" value="0"></label><label class="field"><span>شروع</span><input name="startsAt" type="datetime-local"></label><label class="field"><span>تاریخ انقضا (اختیاری)</span><input name="expiresAt" type="datetime-local"></label><label class="field"><span>حداکثر دفعات مصرف (اختیاری)</span><input name="maxUses" type="number" min="1" step="1"></label><label class="field"><span>وضعیت</span><select name="active"><option value="true">فعال</option><option value="false">غیرفعال</option></select></label><button class="primary-button" type="submit">ذخیره</button><button class="secondary-button" type="reset">کد جدید</button></form><div id="adminDiscountList" aria-live="polite"></div></div></section>`);
    let discounts=[];
    async function loadDiscounts(){
        discounts=await adminRequest('/api/admin/discounts');
        document.getElementById('adminDiscountList').innerHTML=discounts.map(d=>`<article class="admin-product-row"><strong>${escapeHTML(d.code)}</strong><span>${formatNumber(d.value)} ${d.type==='percent'?'٪':'تومان'} · ${d.active?'فعال':'غیرفعال'} · ${formatNumber(d.uses)} بار مصرف</span><button class="secondary-button" type="button" data-edit-discount="${escapeHTML(d.id)}">ویرایش</button></article>`).join('')||'<p>کدی ثبت نشده است.</p>';
    }
    tabs.addEventListener('click',async e=>{
        const button=e.target.closest('[data-admin-tab]');if(!button)return;
        tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('is-active',b===button));
        dashboard.querySelectorAll('[data-admin-panel]').forEach(p=>{p.hidden=p.dataset.adminPanel!==button.dataset.adminTab;p.classList.toggle('is-active',!p.hidden);});
        try{if(button.dataset.adminTab==='discounts')await loadDiscounts();else if(['overview','orders','users'].includes(button.dataset.adminTab))await loadAdminDashboardData();}catch(error){showToast(error.message,'error');}
    });
    for(const id of ['adminOrderSearch','adminOrderFilter'])document.getElementById(id)?.addEventListener(id.endsWith('Search')?'input':'change',renderAdminOrders);

    dashboard.addEventListener('change',async e=>{
        const order=e.target.closest('[data-order-status]'),role=e.target.closest('[data-user-role]');
        try{
            if(order&&order.value==='cancelled'&&!await Web2Admin.confirm('این سفارش لغو شود؟')){await loadAdminDashboardData();return;}
            if(order)await adminRequest(`/api/admin/orders/${order.dataset.orderStatus}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:order.value})});
            if(role) {const u=adminUsers.find(u=>String(u.id)===role.dataset.userRole);await adminRequest(`/api/admin/users/${u.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:role.value,banned:u.banned})});}
            if(order||role)await loadAdminDashboardData();
        }catch(error){showToast(error.message,'error');await loadAdminDashboardData().catch(()=>{});}
    });
    dashboard.addEventListener('click',async e=>{
        const ban=e.target.closest('[data-user-ban]'),invoice=e.target.closest('[data-order-invoice]'),edit=e.target.closest('[data-edit-discount]'),history=e.target.closest('[data-user-orders]');
        try{
            if(ban){const u=adminUsers.find(u=>String(u.id)===ban.dataset.userBan);await adminRequest(`/api/admin/users/${u.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:u.role,banned:!u.banned})});await loadAdminDashboardData();}
            if(invoice){const o=await adminRequest(`/api/admin/orders/${invoice.dataset.orderInvoice}`);await window.GamingInvoice.open(o);}
            if(history){document.getElementById('adminOrderSearch').value=adminUsers.find(u=>String(u.id)===history.dataset.userOrders)?.phone||'';tabs.querySelector('[data-admin-tab="orders"]').click();}
            if(edit){const d=discounts.find(d=>String(d.id)===edit.dataset.editDiscount),form=document.getElementById('adminDiscountForm');for(const [k,v]of Object.entries(d)){if(form.elements[k])form.elements[k].value=['expiresAt','startsAt'].includes(k)&&v?String(v).slice(0,16):v??'';}form.scrollIntoView({block:'start',behavior:'smooth'});}
        }catch(error){showToast(error.message,'error');}
    });
    document.getElementById('adminDiscountForm').addEventListener('submit',async e=>{
        e.preventDefault();const form=e.currentTarget;if(form.dataset.busy)return;form.dataset.busy='1';const submit=form.querySelector('[type=submit]');submit.disabled=true;const data=Object.fromEntries(new FormData(form)),id=data.id;data.active=data.active==='true';data.startsAt=data.startsAt?new Date(data.startsAt).toISOString():null;data.expiresAt=data.expiresAt?new Date(data.expiresAt).toISOString():null;
        try{await adminRequest('/api/admin/discounts'+(id?`/${id}`:''),{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});form.reset();await loadDiscounts();showToast('کد تخفیف ذخیره شد.');}catch(error){showToast(error.message,'error');}finally{delete form.dataset.busy;submit.disabled=false;}
    });
});
