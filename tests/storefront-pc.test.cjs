'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const start=Date.parse('2026-11-02T00:00:00.000Z'),end=Date.parse('2027-11-02T00:00:00.000Z');
function fixture(overrides={}) {
    return {id:'pc-featured',name:'WEB 2 Complete PC',category:'سیستم کامل گیمینگ',price:100000000,discount:0,
        stock:4,status:'active',image:'img/product-placeholder.svg',shortDescription:'قطعات هماهنگ',guarantee:'شرایط گارانتی در مشخصات',
        campaign:{id:'pc-annual',startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),discount:10},
        components:[{productId:'cpu-1',label:'پردازنده',value:'CPU model'}],...overrides};
}
function page(time=start+1000) {
    const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e.message));
    const dom=new JSDOM('<!doctype html><body><section id="featuredPC" aria-busy="true"></section></body>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
    const w=dom.window,timers=new Map();let now=time,id=0;
    w.Date=class extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
    w.setTimeout=callback=>{timers.set(++id,callback);return id;};w.clearTimeout=key=>timers.delete(key);
    for(const file of ['js/safe-url.js','js/product-pricing.js','js/storefront-pc.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),dom.getInternalVMContext());
    const host=w.document.getElementById('featuredPC');
    return {dom,w,host,errors,timers,api:w.Web2PC,advance(time){now=time;const pending=[...timers.values()];timers.clear();for(const callback of pending)callback();},close(){w.Web2PC.stop();assert.deepEqual(errors,[]);w.close();}};
}
test('featured PC requires a verified catalog and never offers a stale add action',()=>{
    const p=page();try{
        p.api.render([fixture()]);assert.equal(p.host.querySelector('[data-add-to-cart]'),null);
        p.api.render([fixture()],true);assert.equal(p.host.querySelector('[data-add-to-cart]').dataset.addToCart,'pc-featured');
        assert.equal(p.host.dataset.campaignState,'active');assert.ok(p.host.querySelector('.pc-sale-badge'));
        p.api.render([],false);assert.equal(p.host.querySelector('[data-add-to-cart]'),null);assert.equal(p.timers.size,0);
    }finally{p.close();}
});

test('campaign expiry notifies open product and cart pages without a featured panel',()=>{
    const p=page(end-500);try{
        p.host.remove();let changes=0;p.w.document.addEventListener('web2:campaign-change',()=>changes++);
        p.api.render([fixture()],true);assert.equal(p.timers.size,1);
        p.advance(end+1);assert.equal(changes,1);assert.equal(p.timers.size,0);
    }finally{p.close();}
});

test('header glass previews show real cart totals and preserve native links and keyboard exit',()=>{
    const p=page();try{
        const actions=p.w.document.createElement('div');actions.className='nav-actions';
        actions.innerHTML='<a class="profile-button" href="/profile.html">Account</a><a class="cart-button" href="/cart.html">Cart</a>';
        p.w.document.body.prepend(actions);
        p.api.renderHeaderPreviews({items:[{id:'cpu',name:'<img src=x onerror=bad()>',quantity:2,unitPrice:100}],isVerified:true,signedIn:true});
        const trigger=actions.querySelector('.cart-button'),preview=p.w.document.getElementById('headerCartPreview');
        trigger.focus();assert.equal(preview.hidden,false);assert.equal(trigger.getAttribute('href'),'/cart.html');
        assert.equal(preview.querySelector('img'),null);assert.match(preview.textContent,/۲۰۰/);
        const link=preview.querySelector('a');link.focus();assert.equal(preview.hidden,false);
        link.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(preview.hidden,true);assert.equal(p.w.document.activeElement,trigger);
        p.api.renderHeaderPreviews({isVerified:false});assert.equal(preview.querySelector('ul'),null);
        assert.equal(actions.querySelectorAll('#headerCartPreview').length,1);
    }finally{p.close();}
});
test('countdown uses the configured end timestamp across reloads and clamps expiry',()=>{
    const first=page(end-(86400+2*3600+3*60+4)*1000),second=page(end-(86400+2*3600+3*60+4)*1000);try{
        const expected={days:1,hours:2,minutes:3,seconds:4};
        assert.deepEqual(JSON.parse(JSON.stringify(first.api.countdownParts(new Date(end).toISOString(),end-(86400+2*3600+3*60+4)*1000))),expected);
        first.api.render([fixture()],true);second.api.render([fixture()],true);
        assert.equal(first.host.querySelector('.pc-countdown').textContent,second.host.querySelector('.pc-countdown').textContent);
        assert.deepEqual(JSON.parse(JSON.stringify(first.api.countdownParts(new Date(end).toISOString(),end+5000))),{days:0,hours:0,minutes:0,seconds:0});
        assert.equal(first.w.localStorage.length,0);
    }finally{first.close();second.close();}
});
test('campaign boundary removes discount, stops timer and announces an ordinary price',()=>{
    const p=page(end-500);try{
        let changes=0;p.w.document.addEventListener('web2:campaign-change',()=>changes++);
        p.api.render([fixture()],true);assert.ok(p.host.querySelector('.pc-price del'));assert.equal(p.timers.size,1);
        p.advance(end);assert.equal(p.host.dataset.campaignState,'expired');assert.equal(p.host.querySelector('.pc-price del'),null);
        assert.equal(p.host.querySelector('.pc-sale-badge'),null);assert.equal(p.host.querySelector('.pc-countdown'),null);
        assert.match(p.host.querySelector('.pc-price strong').textContent,/۱۰۰٬۰۰۰٬۰۰۰/);assert.equal(changes,1);assert.equal(p.timers.size,0);
    }finally{p.close();}
});
test('scheduled campaign displays ordinary pricing and out of stock cannot add',()=>{
    const p=page(start-1000);try{
        p.api.render([fixture({stock:0})],true);assert.equal(p.host.dataset.campaignState,'scheduled');
        assert.equal(p.host.querySelector('.pc-sale-badge'),null);assert.equal(p.host.querySelector('.pc-price del'),null);
        assert.equal(p.host.querySelector('[data-add-to-cart]').disabled,true);
        assert.ok(p.host.querySelector('.pc-countdown'));
    }finally{p.close();}
});
test('featured PC escapes product/component text and rejects unsafe image URLs',()=>{
    const p=page();try{
        const html='<img src=x onerror=alert(1)>';
        p.api.render([fixture({name:html,shortDescription:html,guarantee:html,image:'javascript:alert(1)',components:[{productId:'cpu-1',label:html,value:html}]})],true);
        assert.equal(p.host.querySelector('[onerror],script'),null);assert.equal(p.host.querySelector('.pc-model').textContent,html);
        assert.equal(p.host.querySelector('.pc-system-image').getAttribute('src'),'/img/product-placeholder.svg');
        assert.equal(p.host.querySelector('.pc-components dd').textContent,html);
    }finally{p.close();}
});
test('invalid campaign timestamps cannot break rendering or expose a special price',()=>{
    const p=page();try{
        assert.doesNotThrow(()=>p.api.render([fixture({campaign:{id:'broken',startAt:'bad',endAt:'bad',discount:20}})],true));
        assert.equal(p.host.querySelector('.pc-sale-badge'),null);assert.equal(p.host.querySelector('.pc-countdown'),null);
    }finally{p.close();}
});

test('actual homepage script includes load the verified PC, hardware categories and real cart preview',async()=>{
    const errors=[],virtualConsole=new VirtualConsole();
    virtualConsole.on('jsdomError',e=>errors.push(e.message));virtualConsole.on('error',(...args)=>errors.push(args.join(' ')));
    const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
    const w=dom.window,seed=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8'));
    w.Date.now=()=>start+86400000;w.scrollTo=()=>{};
    w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
    w.fetch=async(input)=>{
        const url=new URL(typeof input==='string'?input:input.url,'http://localhost/');
        let data={};
        if(url.pathname==='/api/products')data=seed.products;
        else if(url.pathname.startsWith('/api/products/'))data=seed.products.find(p=>String(p.id)===decodeURIComponent(url.pathname.split('/').pop()));
        else if(url.pathname==='/api/auth/session')data={user:{id:'integration-buyer',name:'Integration buyer'},csrfToken:'test-only'};
        else if(url.pathname==='/api/users/me/wishlist')data=[];
        else if(url.pathname==='/api/site-settings')data={storeName:'WEB 2',themePreset:'cream',announcement:{visible:false},homeBanner:{enabled:false},social:{},contactEmail:'store@example.invalid'};
        return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
    };
    try{
        for(const script of w.document.querySelectorAll('script[src]')){
            const src=new URL(script.src).pathname.slice(1);
            assert.ok(fs.existsSync(path.join(root,src)),src);
            vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),dom.getInternalVMContext());
        }
        for(let i=0;i<100&&!w.document.querySelector('#featuredPC [data-add-to-cart]');i++)await new Promise(resolve=>setTimeout(resolve,10));
        const pc=seed.products.find(p=>p.category==='سیستم کامل گیمینگ'&&p.campaign);
        assert.ok(pc);assert.equal(w.document.querySelector('#featuredPC [data-add-to-cart]').dataset.addToCart,String(pc.id));
        assert.equal(w.document.getElementById('featuredPC').dataset.campaignState,'active');
        for(const category of ['پردازنده','کارت گرافیک','مادربرد','رم']){
            const select=w.document.getElementById('categoryFilter');select.value=category;
            select.dispatchEvent(new w.Event('change',{bubbles:true}));
            const cards=[...w.document.querySelectorAll('#productGrid .product-card')];
            assert.ok(cards.length,category);assert.ok(cards.every(card=>card.querySelector('.product-category').textContent===category));
        }
        w.document.querySelector('#featuredPC [data-add-to-cart]').click();
        assert.equal(vm.runInContext('getCart()[0].id',dom.getInternalVMContext()),String(pc.id));
        assert.ok(w.document.getElementById('headerCartPreview').textContent.includes(pc.name));
        assert.equal(w.document.querySelector('.cart-button').getAttribute('href'),'/cart.html');
        assert.deepEqual(errors,[]);
    }finally{w.Web2PC?.stop();w.close();}
});
