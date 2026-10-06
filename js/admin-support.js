"use strict";
document.addEventListener('DOMContentLoaded',()=>{
    if(document.body.dataset.page!=='admin')return;
    const dashboard=document.getElementById('adminDashboard'),tabs=document.querySelector('.admin-tabs');
    const esc=profileValue=>String(profileValue??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const labels={open:'باز',answered:'پاسخ‌داده‌شده',closed:'بسته'},categories={order:'سفارش',payment:'پرداخت',product:'محصول',account:'حساب',other:'سایر'};
    const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const pending=new Set();let loading=null;
    tabs.insertAdjacentHTML('beforeend','<button type="button" data-admin-tab="support"><i class="fa-solid fa-headset" aria-hidden="true"></i> پشتیبانی</button><button type="button" data-admin-tab="notifications"><i class="fa-solid fa-bell" aria-hidden="true"></i> ارسال اعلان</button>');
    dashboard.insertAdjacentHTML('beforeend',`<section class="admin-tab-panel" data-admin-panel="support" hidden><div class="glass-panel admin-data-panel"><div class="admin-toolbar"><h2 class="rgb-text">درخواست‌های پشتیبانی</h2><button class="secondary-button" type="button" data-support-refresh>به‌روزرسانی</button><label class="field"><span>وضعیت</span><select id="adminTicketFilter"><option value="">همه</option><option value="open">باز</option><option value="answered">پاسخ‌داده‌شده</option><option value="closed">بسته</option></select></label></div><div id="adminTicketList" aria-live="polite"></div><div id="adminTicketDetail"></div></div></section><section class="admin-tab-panel" data-admin-panel="notifications" hidden><div class="glass-panel admin-data-panel"><h2 class="rgb-text">ارسال پیام فروشگاه به مشتری</h2><form id="adminNotificationForm"><label class="field"><span>حساب مشتری</span><select name="userId" id="adminNotificationRecipient" required><option value="">در حال دریافت…</option></select></label><label class="field"><span>عنوان</span><input name="title" required minlength="3" maxlength="100"></label><label class="field"><span>متن پیام</span><textarea name="message" required minlength="5" maxlength="1000"></textarea></label><button class="primary-button" type="submit">ارسال اعلان</button><p id="adminNotificationNotice" role="status"></p></form></div></section>`);
    let tickets=[];
    const date=value=>new Date(value).toLocaleDateString('fa-IR');
    function render(){
        const filter=document.getElementById('adminTicketFilter').value;
        const rows=tickets.filter(t=>!filter||t.status===filter);
        document.getElementById('adminTicketList').innerHTML=rows.map(t=>`<article class="admin-product-row"><div><strong>${esc(t.subject)}</strong><p>${esc(t.name)} · <bdi>${esc(t.email)}</bdi></p><small>${esc(categories[t.category])} · ${date(t.updatedAt)}</small></div><span>${esc(labels[t.status])}</span><button class="secondary-button" type="button" data-admin-ticket="${esc(t.id)}">مشاهده و پاسخ</button></article>`).join('')||'<p>درخواستی با این وضعیت وجود ندارد.</p>';
    }
    async function load(){
        if(loading)return loading;
        document.getElementById('adminTicketList').textContent='در حال دریافت درخواست‌ها…';
        loading=Web2.request('/api/admin/tickets').then(rows=>{tickets=rows;render();}).finally(()=>loading=null);return loading;
    }
    function thread(t){
        document.getElementById('adminTicketDetail').innerHTML=`<section class="admin-ticket-thread"><h3>${esc(t.subject)}</h3><p>وضعیت: ${esc(labels[t.status])}</p>${t.messages.map(m=>`<article class="admin-ticket-message ${m.author==='admin'?'is-admin':''}"><strong>${m.author==='admin'?'پشتیبانی':'مشتری'}</strong><p>${esc(m.message)}</p><small>${date(m.createdAt)}</small></article>`).join('')}<form id="adminTicketReplyForm" data-id="${esc(t.id)}"><label class="field"><span>وضعیت درخواست</span><select name="status">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${key===t.status?'selected':''}>${label}</option>`).join('')}</select></label><label class="field"><span>پاسخ (برای تغییر وضعیت بدون پاسخ، خالی بگذارید)</span><textarea name="message" minlength="5" maxlength="4000"></textarea></label><button class="primary-button" type="submit">ذخیره و ارسال پاسخ</button><p id="adminTicketNotice" role="status"></p></form></section>`;
    }
    async function busy(key,button,fn){if(pending.has(key))return;pending.add(key);if(button)button.disabled=true;try{await fn();}catch(e){showToast(e.message,'error');}finally{pending.delete(key);if(button)button.disabled=false;}}
    tabs.addEventListener('click',e=>{
        const tab=e.target.closest('[data-admin-tab]');if(!tab)return;
        if(tab.dataset.adminTab==='support')busy('load',null,load);
        if(tab.dataset.adminTab==='notifications')busy('recipients',null,async()=>{
            const users=await Web2.request('/api/admin/notification-recipients');
            document.getElementById('adminNotificationRecipient').innerHTML='<option value="">انتخاب مشتری</option>'+users.map(u=>`<option value="${esc(u.id)}">${esc(u.name)} — ${esc(u.email)}</option>`).join('');
        });
    });
    document.getElementById('adminTicketFilter').addEventListener('change',render);
    dashboard.addEventListener('input',e=>{
        const form=e.target.closest('#adminTicketReplyForm');
        if(form&&e.target.name==='message'&&e.target.value.trim()&&form.elements.status.value==='open')form.elements.status.value='answered';
    });
    dashboard.addEventListener('click',e=>{
        const open=e.target.closest('[data-admin-ticket]'),refresh=e.target.closest('[data-support-refresh]');
        if(open)busy('ticket:'+open.dataset.adminTicket,open,async()=>{thread(await Web2.request('/api/admin/tickets/'+encodeURIComponent(open.dataset.adminTicket)));document.getElementById('adminTicketDetail').scrollIntoView({behavior:'smooth',block:'start'});});
        if(refresh)busy('load',refresh,load);
    });
    dashboard.addEventListener('submit',e=>{
        const form=e.target.closest('#adminTicketReplyForm, #adminNotificationForm');if(!form)return;e.preventDefault();
        if(!form.reportValidity())return;
        const data=Object.fromEntries(new FormData(form));
        busy(form.id,form.querySelector('button[type="submit"]'),async()=>{
            if(form.id==='adminTicketReplyForm'){
                const t=await Web2.request('/api/admin/tickets/'+encodeURIComponent(form.dataset.id),json('PUT',data));
                thread(t);await load();document.getElementById('adminTicketNotice').textContent='درخواست به‌روز شد و پاسخ برای مشتری قابل مشاهده است.';
            }else{
                await Web2.request('/api/admin/notifications',json('POST',data));form.reset();document.getElementById('adminNotificationNotice').textContent='اعلان در حساب مشتری ثبت شد.';
            }
        });
    });
    document.getElementById('adminLogout')?.addEventListener('click',()=>{tickets=[];document.getElementById('adminTicketDetail').textContent='';document.getElementById('adminTicketList').textContent='';});
});
