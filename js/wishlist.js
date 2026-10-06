"use strict";
window.Web2Wishlist = {
    owner:null, ids:new Set(), pending:new Set(), loading:null,
    has(id){return this.ids.has(String(id));},
    sync(){document.querySelectorAll('[data-wishlist-product]').forEach(b=>{
        const active=this.has(b.dataset.wishlistProduct);
        b.classList.toggle('is-favorite',active);b.setAttribute('aria-pressed',String(active));
        b.setAttribute('aria-label',active?'حذف از علاقه‌مندی‌ها':'افزودن به علاقه‌مندی‌ها');
        b.title=active?'حذف از علاقه‌مندی‌ها':'افزودن به علاقه‌مندی‌ها';
    });},
    async load(){
        if(!Web2.user){this.owner=null;this.ids.clear();this.sync();return;}
        const owner=Web2.user.id;
        if(this.loading&&this.owner===owner)return this.loading;
        if(this.owner!==owner){this.ids.clear();this.owner=owner;this.sync();}
        const task=Web2.request('/api/users/me/wishlist').then(rows=>{
            if(Web2.user?.id!==owner)return;
            this.ids=new Set(rows.map(r=>String(r.productId)));this.sync();
        }).finally(()=>{if(this.loading===task)this.loading=null;});
        this.loading=task;return task;
    }
};
document.addEventListener('DOMContentLoaded',async()=>{
    await Web2.ready;
    Web2Wishlist.load().catch(()=>{});
    window.addEventListener('web2:auth',()=>{
        if((Web2.user?.id||null)!==Web2Wishlist.owner)Web2Wishlist.load().catch(()=>{});
    });
    window.addEventListener('web2:wishlist',()=>Web2Wishlist.load().catch(()=>{}));
    document.addEventListener('click',async event=>{
        const button=event.target.closest('[data-wishlist-product]');if(!button)return;
        event.preventDefault();
        if(!Web2.user){openAuthModal('برای ذخیره علاقه‌مندی‌ها وارد حساب خود شوید.');return;}
        const id=button.dataset.wishlistProduct,owner=Web2.user.id;
        if(Web2Wishlist.pending.has(id))return;
        Web2Wishlist.pending.add(id);button.disabled=true;
        try {
            if(Web2Wishlist.loading)await Web2Wishlist.loading;
            const remove=Web2Wishlist.has(id);
            await Web2.request('/api/users/me/wishlist/'+encodeURIComponent(id),{method:remove?'DELETE':'PUT',headers:{'Content-Type':'application/json'},body:'{}'});
            if(Web2.user?.id!==owner)return;
            if(remove)Web2Wishlist.ids.delete(id);else Web2Wishlist.ids.add(id);
            Web2Wishlist.sync();showToast(remove?'از علاقه‌مندی‌ها حذف شد.':'به علاقه‌مندی‌ها اضافه شد.');
        }catch(error){showToast(error.message,'error');}
        finally{Web2Wishlist.pending.delete(id);button.disabled=false;}
    });
});
