'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/storefront-motion.js'), 'utf8');
function page(reduced = false) {
    const errors = [], virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => errors.push(error.message));
    const dom = new JSDOM('<body><header class="site-header"></header><form class="market-search"></form><span id="cart-count">0</span><main id="main-content"><article class="product-card"></article></main></body>', { url: 'http://localhost:3000/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
    const observers = [], w = dom.window;
    w.matchMedia = () => ({ matches: reduced, addEventListener() {} });
    w.IntersectionObserver = class { constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); } observe(node) { this.targets.add(node); } unobserve(node) { this.targets.delete(node); } disconnect() { this.targets.clear(); } };
    vm.runInContext(source, dom.getInternalVMContext());
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    return { dom, w, observers, errors };
}
test('viewport reveal runs once and includes API-inserted merchandise', async () => {
    const { dom, w, observers, errors } = page();
    const card = w.document.querySelector('.product-card');
    assert.equal(card.classList.contains('motion-pending'), true);
    observers[0].callback([{ target: card, isIntersecting: true }]);
    assert.equal(card.classList.contains('motion-pending'), false);
    assert.equal(observers[0].targets.has(card), false);
    assert.equal(card.classList.contains('motion-delay-0'), true);
    card.dispatchEvent(new w.Event('transitionend'));
    assert.equal(card.classList.contains('motion-delay-0'), false);
    const added = w.document.createElement('article'); added.className = 'product-card';
    w.document.querySelector('main').append(added);
    await new Promise(resolve => w.setTimeout(resolve, 0));
    assert.equal(observers[0].targets.has(added), true);
    assert.deepEqual(errors, []); dom.window.close();
});
test('reduced motion never hides cards and sticky header uses intersection state', () => {
    const { dom, w, observers, errors } = page(true);
    assert.equal(w.document.querySelector('.motion-pending'), null);
    assert.equal(w.document.body.classList.contains('storefront-entering'), false);
    observers[0].callback([{ isIntersecting: false }]);
    assert.equal(w.document.querySelector('header').classList.contains('is-scrolled'), true);
    assert.deepEqual(errors, []); dom.window.close();
});
test('native navigation excludes protected routes, modifiers, anchors and downloads', () => {
    const js = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    const transition = js.slice(js.indexOf('/* Short, fail-safe transition'), js.indexOf('// Marketplace discovery'));
    const dom = new JSDOM('<body><main id="main-content"></main></body>', { url: 'http://localhost:3000/products', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window; w.requestAnimationFrame = fn => fn(); w.setTimeout = () => 1; w.clearTimeout = () => {};
    vm.runInContext(transition, dom.getInternalVMContext()); w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    for (const href of ['/checkout.html', '/admin', '/profile.html', '/api/auth/logout', '#products', 'https://outside.example/']) {
        const a = w.document.createElement('a'); a.href = href; w.document.body.append(a);
        const event = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        a.dispatchEvent(event);
        assert.equal(w.document.body.classList.contains('storefront-leaving'), false);
        w.dispatchEvent(new w.Event('pagehide'));
        assert.equal(w.document.querySelector('.page-transition-overlay').classList.contains('is-visible'), false);
    }
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { download: true }, { blank: true }]) {
        const link = w.document.createElement('a'); link.href = '/cart.html';
        if (options.download) link.setAttribute('download', 'cart.html');
        if (options.blank) link.target = '_blank';
        w.document.body.append(link);
        link.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...options }));
        assert.equal(w.document.body.classList.contains('storefront-leaving'), false);
    }
    const a = w.document.createElement('a'); a.href = '/cart.html'; w.document.body.append(a);
    const event = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(w.document.body.classList.contains('storefront-leaving'), true);
    w.dispatchEvent(new w.Event('pageshow'));
    assert.equal(w.document.body.classList.contains('storefront-leaving'), false);
    const swap = (url, navigationType) => {
        let skipped = false;
        const event = new w.Event('pageswap');
        Object.defineProperties(event, {
            activation: { value: { entry: { url }, navigationType } },
            viewTransition: { value: { skipTransition() { skipped = true; } } }
        });
        w.dispatchEvent(event);
        return skipped;
    };
    assert.equal(swap('http://localhost:3000/products', 'push'), true, 'unclassified form navigation skips native animation');
    assert.equal(swap('http://localhost:3000/products', 'traverse'), false, 'safe browser history can animate natively');
    assert.equal(swap('http://localhost:3000/checkout.html', 'traverse'), true, 'checkout history skips animation');
    dom.window.close();
});
