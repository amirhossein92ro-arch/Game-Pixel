'use strict';
document.addEventListener('DOMContentLoaded',()=>{
    if(document.body.dataset.page!=='admin')return;
    const dashboard=document.getElementById('adminDashboard'),tabs=document.querySelector('.admin-tabs'),A=window.Web2Admin;
    tabs.insertAdjacentHTML('beforeend','<button type="button" data-admin-tab="inventory">موجودی</button>');
    dashboard.insertAdjacentHTML('beforeend',`<section class="admin-tab-panel" data-admin-panel="inventory" hidden>
      <div class="glass-panel admin-data-panel">
        <h2>مدیریت موجودی</h2><p id="inventorySummary" role="status"></p>
        <form id="inventoryFilters" class="admin-toolbar" role="search">
          <label>موجودی<select name="stock"><option value="">همه</option><option value="low">کم‌موجود</option><option value="out">ناموجود</option><option value="available">موجود</option></select></label>
          <label>وضعیت<select name="status"><option value="">همه</option><option value="active">فعال</option><option value="inactive">غیرفعال</option><option value="discontinued">توقف فروش</option></select></label>
          <label>مرتب‌سازی<select name="sort"><option value="name">نام</option><option value="stock_asc">کمترین موجودی</option><option value="reserved_desc">بیشترین رزرو</option><option value="adjusted_desc">تازه‌ترین اصلاح</option></select></label>
          <button class="secondary-button" type="submit">اعمال فیلتر</button>
        </form>
        <div id="inventoryRows" class="inventory-rows" aria-live="polite"></div>
        <nav id="inventoryPages" class="admin-user-pagination" aria-label="صفحه‌های موجودی"></nav>
        <section id="inventoryHistory" class="admin-data-panel" hidden aria-live="polite"></section>
        <form id="inventoryAdjustment" class="admin-toolbar" hidden><h3 id="inventoryAdjustmentTitle">اصلاح موجودی</h3><input name="productId" type="hidden"><label>تغییر تعداد<input name="delta" type="number" step="1" required></label><label>دلیل<select name="reason"><option value="RESTOCK">تأمین مجدد</option><option value="MANUAL_CORRECTION">اصلاح دستی</option><option value="DAMAGED">آسیب‌دیده</option><option value="RETURNED">بازگشت فیزیکی</option></select></label><label>یادداشت<input name="note" maxlength="500"></label><button class="primary-button" type="submit">ثبت اصلاح</button><button class="secondary-button" type="button" id="inventoryAdjustmentCancel">انصراف</button></form>
        <form id="inventoryBulk" class="admin-toolbar" hidden><h3>اصلاح گروهی انتخاب‌شده‌ها</h3><label>تغییر تعداد<input name="delta" type="number" step="1" required></label><label>دلیل<select name="reason"><option value="RESTOCK">تأمین مجدد</option><option value="MANUAL_CORRECTION">اصلاح دستی</option><option value="DAMAGED">آسیب‌دیده</option><option value="RETURNED">بازگشت فیزیکی</option></select></label><label>یادداشت<input name="note" maxlength="500"></label><button class="secondary-button" type="submit">ثبت گروهی</button></form>
        <form id="inventoryReturn" class="admin-toolbar" hidden><h3>بازگشت کالای بازپرداخت‌شده</h3><label>شناسه سفارش<input name="orderId" required maxlength="100"></label><label>شناسه محصول<input name="productId" required maxlength="200"></label><label>تعداد بازگشتی<input name="quantity" type="number" min="1" step="1" required></label><label>یادداشت<input name="note" maxlength="500"></label><button class="secondary-button" type="submit">ثبت بازگشت فیزیکی</button></form>
        <p id="inventoryNotice" role="status"></p>
      </div></section>`);
    const panel=dashboard.querySelector('[data-admin-panel="inventory"]'),rows=panel.querySelector('#inventoryRows'),pages=panel.querySelector('#inventoryPages'),notice=panel.querySelector('#inventoryNotice'),bulk=panel.querySelector('#inventoryBulk'),adjustment=panel.querySelector('#inventoryAdjustment'),returnForm=panel.querySelector('#inventoryReturn');
    let page=1,last=null;
    const esc=v=>escapeHTML(String(v??''));
    const request=(suffix='',options={})=>adminRequest('/api/admin/inventory'+suffix,options);
    async function load(){
        if(!A.can('inventory.view'))return;
        rows.setAttribute('aria-busy','true');notice.textContent='';
        try{
            const filters=new FormData(panel.querySelector('#inventoryFilters'));
            const query=new URLSearchParams({page:String(page),pageSize:'20',stock:filters.get('stock'),status:filters.get('status'),sort:filters.get('sort')});
            last=await request('?'+query);const s=last.summary;
            panel.querySelector('#inventorySummary').textContent=`ناموجود: ${formatNumber(s.outOfStock)} · کم‌موجود: ${formatNumber(s.lowStock)} · رزروهای فعال: ${formatNumber(s.activeReservations)} · آستانه: ${formatNumber(s.threshold)}`;
            rows.innerHTML=last.items.map(item=>`<article class="admin-console-row inventory-row" data-product-id="${esc(item.id)}"><label class="inventory-select" ${A.can('inventory.bulk')?'':'hidden'}><input type="checkbox" value="${esc(item.id)}"> انتخاب</label><strong>${esc(item.name)}</strong><span>موجود فیزیکی: ${formatNumber(item.onHand)}</span><span>رزرو: ${formatNumber(item.reserved)}</span><span>قابل فروش: ${formatNumber(item.available)}</span><span>${item.available===0?'ناموجود':item.lowStock?'کم‌موجود':item.status==='discontinued'?'توقف فروش':'موجود'}</span><div class="admin-quick"><button class="secondary-button" type="button" data-inventory-history="${esc(item.id)}">سوابق</button>${A.can('inventory.adjust')?`<button class="secondary-button" type="button" data-inventory-adjust="${esc(item.id)}">اصلاح موجودی</button>`:''}</div></article>`).join('')||'<p>محصولی در این فیلتر پیدا نشد.</p>';
            pages.innerHTML=`<button class="secondary-button" type="button" data-inventory-page="prev" ${page<=1?'disabled':''}>قبلی</button><span>صفحه ${formatNumber(page)} از ${formatNumber(Math.max(1,last.pages))}</span><button class="secondary-button" type="button" data-inventory-page="next" ${page>=last.pages?'disabled':''}>بعدی</button>`;
            bulk.hidden=!A.can('inventory.bulk');
            returnForm.hidden=!A.can('inventory.adjust');
        }catch(error){notice.textContent=error.message;}finally{rows.setAttribute('aria-busy','false');}
    }
    tabs.addEventListener('click',event=>{if(event.target.closest('[data-admin-tab="inventory"]'))load();});
    panel.querySelector('#inventoryFilters').addEventListener('submit',event=>{event.preventDefault();page=1;load();});
    pages.addEventListener('click',event=>{const button=event.target.closest('[data-inventory-page]');if(!button||button.disabled)return;page+=button.dataset.inventoryPage==='next'?1:-1;load();});
    rows.addEventListener('click',async event=>{
        const history=event.target.closest('[data-inventory-history]'),adjust=event.target.closest('[data-inventory-adjust]');if(!history&&!adjust)return;
        const id=history?.dataset.inventoryHistory||adjust.dataset.inventoryAdjust,name=last.items.find(row=>row.id===id)?.name||id;
        try{
            if(history){const data=await request('/'+encodeURIComponent(id)+'/history?page=1&pageSize=20'),box=panel.querySelector('#inventoryHistory');box.innerHTML=`<h2>۲۰ سابقه اخیر ${esc(name)}</h2>`;const list=document.createElement('ol');for(const entry of data.items){const item=document.createElement('li');item.textContent=`${entry.created_at} · ${entry.reason} · ${entry.delta>=0?'+':''}${entry.delta} · ${entry.previous_on_hand} ← ${entry.new_on_hand} · ${entry.note||''}`;list.append(item);}if(!list.children.length)box.append('سابقه‌ای ثبت نشده است.');else box.append(list);box.hidden=false;box.scrollIntoView({block:'nearest'});return;}
            adjustment.hidden=false;adjustment.elements.productId.value=id;panel.querySelector('#inventoryAdjustmentTitle').textContent=`اصلاح موجودی ${name}`;adjustment.elements.delta.focus();
        }catch(error){notice.textContent=error.message;}
    });
    panel.querySelector('#inventoryAdjustmentCancel').addEventListener('click',()=>{adjustment.reset();adjustment.hidden=true;});
    adjustment.addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(adjustment),delta=Number(data.get('delta')),id=data.get('productId');if(!Number.isSafeInteger(delta)||delta===0){notice.textContent='تغییر باید یک عدد صحیح غیرصفر باشد.';return;}if(!await A.confirm(`تغییر ${delta} عدد برای این محصول ثبت شود؟`))return;const button=adjustment.querySelector('[type="submit"]');button.disabled=true;try{await request('/'+encodeURIComponent(id)+'/adjustments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({delta,reason:data.get('reason'),note:data.get('note')})});adjustment.reset();adjustment.hidden=true;await load();notice.textContent='اصلاح موجودی ثبت شد.';}catch(error){notice.textContent=error.message;}finally{button.disabled=false;}});
    bulk.addEventListener('submit',async event=>{event.preventDefault();const selected=[...rows.querySelectorAll('.inventory-select input:checked')].map(el=>el.value),data=new FormData(bulk),delta=Number(data.get('delta'));if(!selected.length||!Number.isSafeInteger(delta)||delta===0){notice.textContent='محصول و تغییر معتبر انتخاب کنید.';return;}if(!await A.confirm(`اصلاح موجودی ${selected.length} محصول ثبت شود؟`))return;const button=bulk.querySelector('[type="submit"]');button.disabled=true;try{await request('/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:selected.map(productId=>({productId,delta,reason:data.get('reason'),note:data.get('note')}))})});bulk.reset();await load();notice.textContent='اصلاح گروهی ثبت شد.';}catch(error){notice.textContent=error.message;}finally{button.disabled=false;}});
    returnForm.addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(returnForm),quantity=Number(data.get('quantity')),orderId=String(data.get('orderId')).trim(),productId=String(data.get('productId')).trim();if(!Number.isSafeInteger(quantity)||quantity<1){notice.textContent='تعداد بازگشتی نامعتبر است.';return;}if(!await A.confirm('بازگشت فیزیکی این کالا پس از بازپرداخت تأیید می‌شود؟'))return;const button=returnForm.querySelector('[type="submit"]');button.disabled=true;try{await adminRequest('/api/admin/orders/'+encodeURIComponent(orderId)+'/restock',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({items:[{id:productId,quantity}],note:data.get('note')})});returnForm.reset();await load();notice.textContent='بازگشت کالا ثبت شد.';}catch(error){notice.textContent=error.message;}finally{button.disabled=false;}});
});
