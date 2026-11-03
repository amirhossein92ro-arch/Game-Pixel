'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');

function page({reduced=false,hidden=false}={}) {
    const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
    const slides=Array.from({length:5},(_,index)=>`<article class="banner-slide${index===0?' is-active':''}" data-slide="${index}" aria-hidden="${index!==0}"><picture><source srcset="/img/banners/banner-0${index+1}.webp" type="image/webp"><img class="banner-image" data-banner-fallback="/img/banners/banner-placeholder-0${index+1}.svg" src="/img/banners/banner-placeholder-0${index+1}.svg" alt="Banner ${index+1}" width="1600" height="420"></picture><a href="/products?q=${index}">Products ${index+1}</a></article>`).join('');
    const dots=Array.from({length:5},(_,index)=>`<button type="button" data-slider-dot="${index}" aria-current="${index===0}">Banner ${index+1}</button>`).join('');
    const dom=new JSDOM(`<!doctype html><body><button id="outside">Outside</button><section data-storefront-slider dir="rtl" aria-label="WEB 2 promotions"><div class="slider-viewport">${slides}</div><div class="slider-controls"><button type="button" data-slider-prev>Previous</button><div class="slider-dots">${dots}</div><button type="button" data-slider-next>Next</button><button type="button" data-slider-pause aria-pressed="false">Pause</button></div><span class="slider-position"></span></section></body>`,{url:'http://localhost:3000/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
    const w=dom.window,timers=new Map(),mediaListeners=new Set();let clock=0,id=0;
    w.document.documentElement.dir='rtl';
    const preference={matches:reduced,addEventListener(type,callback){if(type==='change')mediaListeners.add(callback);},removeEventListener(type,callback){mediaListeners.delete(callback);}};
    w.matchMedia=()=>preference;
    Object.defineProperty(w.document,'hidden',{get:()=>hidden,configurable:true});
    w.setTimeout=(callback,delay=0)=>{const key=++id;timers.set(key,{callback,delay,due:clock+delay});return key;};
    w.clearTimeout=key=>timers.delete(key);
    w.requestAnimationFrame=callback=>{callback(clock);return 1;};w.cancelAnimationFrame=()=>{};
    const host=w.document.querySelector('[data-storefront-slider]');
    const pointer=(type,x,y=10)=>{const event=new w.Event(type,{bubbles:true,cancelable:true});for(const [key,value]of Object.entries({pointerId:1,pointerType:'touch',clientX:x,clientY:y,isPrimary:true,button:0}))Object.defineProperty(event,key,{value});host.querySelector('.slider-viewport').dispatchEvent(event);return event;};
    vm.runInContext(fs.readFileSync(path.join(root,'js/storefront-slider.js'),'utf8'),dom.getInternalVMContext());
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    const api=w.Web2Slider,controller=api.init(host);
    function advance(ms){const limit=clock+ms;while(true){const pending=[...timers].filter(([,timer])=>timer.due<=limit).sort((a,b)=>a[1].due-b[1].due)[0];if(!pending)break;timers.delete(pending[0]);clock=pending[1].due;pending[1].callback();}clock=limit;}
    return {w,dom,host,api,controller,timers,errors,advance,pointer,active:()=>[...host.querySelectorAll('[data-slide]')].findIndex(slide=>slide.classList.contains('is-active')),autoplay:()=>[...timers.values()].filter(timer=>timer.delay===5000).length,visibility(value){hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));},motion(value){preference.matches=value;for(const listener of mediaListeners)listener({matches:value});},close(){api.destroy(host);assert.deepEqual(errors,[]);w.close();}};
}

test('carousel advances every five seconds and loops with one autoplay timer',()=>{
    const p=page();try{
        assert.equal(p.active(),0);assert.equal(p.autoplay(),1);
        p.advance(4999);assert.equal(p.active(),0);
        p.advance(1);assert.equal(p.active(),1);assert.equal(p.autoplay(),1);
        p.advance(20000);assert.equal(p.active(),0);assert.equal(p.autoplay(),1);
        assert.equal(p.host.querySelectorAll('[data-slider-dot][aria-current="true"]').length,1);
        assert.equal(p.host.querySelectorAll('[data-slide][aria-hidden="false"]').length,1);
        for(const slide of p.host.querySelectorAll('[data-slide][aria-hidden="true"]'))assert.ok(slide.hasAttribute('inert')||slide.inert===true,'inactive slide links must not receive keyboard focus');
        assert.notEqual(p.w.document.activeElement.closest?.('[data-slide]'),p.host.querySelector('.is-active'),'autoplay must not move focus into slide content');
    }finally{p.close();}
});

test('arrow, dot and RTL keyboard controls navigate without hijacking form fields',()=>{
    const p=page();try{
        p.host.querySelector('[data-slider-prev]').click();assert.equal(p.active(),4);
        p.host.querySelector('[data-slider-next]').click();assert.equal(p.active(),0);
        p.host.querySelector('[data-slider-dot="3"]').click();assert.equal(p.active(),3);
        p.host.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));assert.equal(p.active(),4);
        p.host.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.equal(p.active(),3);
        const input=p.w.document.createElement('input');p.host.append(input);
        input.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));assert.equal(p.active(),3);
        assert.equal(p.autoplay(),1);
    }finally{p.close();}
});

test('hover, keyboard focus and hidden tabs pause independently and resume cleanly',()=>{
    const p=page();try{
        p.host.dispatchEvent(new p.w.MouseEvent('mouseenter'));assert.equal(p.autoplay(),0);
        p.visibility(true);p.host.dispatchEvent(new p.w.MouseEvent('mouseleave'));assert.equal(p.autoplay(),0);
        p.advance(15000);assert.equal(p.active(),0);
        p.visibility(false);assert.equal(p.autoplay(),1);
        const control=p.host.querySelector('[data-slider-next]');control.focus();assert.equal(p.autoplay(),0);
        p.w.document.getElementById('outside').focus();p.advance(0);assert.equal(p.autoplay(),1);
        p.advance(5000);assert.equal(p.active(),1);
    }finally{p.close();}
});

test('explicit pause and reduced motion stop automatic changes while manual controls stay usable',()=>{
    const p=page({reduced:true});try{
        assert.equal(p.autoplay(),0);p.advance(10000);assert.equal(p.active(),0);
        p.host.querySelector('[data-slider-next]').click();assert.equal(p.active(),1);
        p.motion(false);assert.equal(p.autoplay(),1);
        const pause=p.host.querySelector('[data-slider-pause]');pause.click();assert.equal(p.autoplay(),0);
        p.visibility(true);p.visibility(false);assert.equal(p.autoplay(),0);
        pause.click();assert.equal(p.autoplay(),1);
        p.motion(true);assert.equal(p.autoplay(),0);
    }finally{p.close();}
});

test('touch swipe follows RTL direction and preserves vertical scrolling and taps',()=>{
    const p=page();try{
        p.pointer('pointerdown',50);p.pointer('pointerup',150);assert.equal(p.active(),1);
        p.pointer('pointerdown',150);p.pointer('pointerup',50);assert.equal(p.active(),0);
        p.pointer('pointerdown',50,10);p.pointer('pointerup',70,150);assert.equal(p.active(),0);
        p.pointer('pointerdown',50);p.pointer('pointerup',55);assert.equal(p.active(),0);
    }finally{p.close();}
});

test('initialization and page lifecycle never duplicate autoplay or leave timers after destruction',()=>{
    const p=page();try{
        assert.equal(p.api.init(p.host),p.controller);assert.equal(p.autoplay(),1);
        p.w.dispatchEvent(new p.w.Event('pagehide'));assert.equal(p.autoplay(),0);
        p.w.dispatchEvent(new p.w.Event('pageshow'));assert.equal(p.autoplay(),1);
        p.api.destroy(p.host);assert.equal(p.timers.size,0);
        p.host.querySelector('[data-slider-next]').click();assert.equal(p.active(),0);
        p.w.dispatchEvent(new p.w.Event('pageshow'));assert.equal(p.timers.size,0);
        p.api.init(p.host);assert.equal(p.autoplay(),1);
        p.host.querySelector('[data-slider-next]').click();assert.equal(p.active(),1);
        assert.notEqual(p.host.querySelector('.is-active a').getAttribute('tabindex'),'-1','reinitialization preserves keyboard access to newly active links');
    }finally{p.close();}
});

test('a damaged preferred banner falls back locally without retrying the failed source',()=>{
    const p=page();try{
        const image=p.host.querySelector('.banner-image'),source=image.closest('picture').querySelector('source');
        assert.ok(source.hasAttribute('srcset'));
        image.dispatchEvent(new p.w.Event('error'));
        assert.equal(source.hasAttribute('srcset'),false);
        assert.equal(image.getAttribute('src'),image.dataset.bannerFallback);
        image.dispatchEvent(new p.w.Event('error'));
        assert.equal(image.hidden,false);assert.equal(p.autoplay(),1);
    }finally{p.close();}
});

test('homepage banner markup reserves layout and prioritizes only the first local image',()=>{
    const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'));try{
        const document=dom.window.document,carousel=document.querySelector('[data-storefront-slider]');
        assert.ok(carousel);assert.equal(document.querySelector('#main-content').firstElementChild,carousel);
        const slides=[...carousel.querySelectorAll('[data-slide]')];assert.equal(slides.length,5);
        slides.forEach((slide,index)=>{
            const image=slide.querySelector('img'),source=slide.querySelector('source');
            assert.ok(image.alt);assert.ok(Number(image.width)>0&&Number(image.height)>0);
            assert.equal(image.getAttribute('loading'),index===0?'eager':'lazy');
            assert.equal(image.getAttribute('fetchpriority'),index===0?'high':null);
            assert.equal((source.getAttribute('srcset')||source.getAttribute('data-banner-source')).replace(/^\//,''),`img/banners/banner-0${index+1}.webp`);
            assert.ok(fs.existsSync(path.join(root,image.getAttribute('src').replace(/^\//,''))));
            assert.ok(slide.querySelector('a[href]'));
        });
        assert.ok(carousel.getAttribute('aria-label'));assert.equal(carousel.querySelectorAll('[data-slider-dot]').length,5);
    }finally{dom.window.close();}
});

test('slider scripts, styles and fallback banners are public HTTP assets',async t=>{
    const {launch}=require('./helpers/security-server.cjs');const app=await launch(t);
    for(const [url,type]of [['/js/storefront-slider.js',/javascript/],['/css/storefront-slider.css',/text\/css/],...Array.from({length:5},(_,index)=>[`/img/banners/banner-placeholder-0${index+1}.svg`,/image\/svg\+xml/])]){
        const response=await fetch(app.base+url);assert.equal(response.status,200,url);assert.match(response.headers.get('content-type'),type,url);
    }
    assert.equal((await fetch(app.base+'/api/products')).status,200);
});
