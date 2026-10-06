'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..');

test('navigation overlay handles real links and browser history without getting stuck',()=>{
    const source=fs.readFileSync(path.join(root,'script.js'),'utf8');
    const transition=source.slice(source.indexOf('/* Short, fail-safe transition'));
    const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
    const dom=new JSDOM('<!doctype html><body><a id="hash" href="#products">محصولات</a><a id="page" href="cart.html">سبد</a><span class="brand-icon"><i></i></span><span class="brand"><strong>WEB 2</strong></span></body>',{url:'http://localhost:3000/index.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
    const window=dom.window;window.requestAnimationFrame=callback=>{callback();return 1;};window.setTimeout=()=>1;window.clearTimeout=()=>{};
    vm.runInContext(transition,dom.getInternalVMContext());window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    const overlay=window.document.querySelector('.page-transition-overlay');assert.ok(overlay);assert.equal(overlay.classList.contains('is-visible'),false);
    window.document.getElementById('hash').dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));assert.equal(overlay.classList.contains('is-visible'),false);
    window.document.getElementById('page').dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));assert.equal(overlay.classList.contains('is-visible'),true);
    window.dispatchEvent(new window.Event('pageshow'));assert.equal(overlay.classList.contains('is-visible'),false);
    window.dispatchEvent(new window.Event('pagehide'));assert.equal(overlay.classList.contains('is-visible'),true);
    window.dispatchEvent(new window.Event('pageshow'));assert.equal(overlay.classList.contains('is-visible'),false);assert.deepEqual(errors,[]);window.close();
});

test('account and overlay CSS include phone, tablet and reduced-motion layouts',()=>{
    const account=fs.readFileSync(path.join(root,'css/account.css'),'utf8'),style=fs.readFileSync(path.join(root,'style.css'),'utf8');
    assert.match(account,/@media\(max-width:768px\)/);assert.match(account,/@media\(max-width:420px\)/);
    assert.match(style,/@media\(max-width:480px\)/);assert.match(style,/prefers-reduced-motion:reduce/);
});
