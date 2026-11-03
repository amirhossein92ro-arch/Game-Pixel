/* Homepage-only, native-input carousel. No dependency on commerce or API state. */
(() => {
    'use strict';
    if (window.Web2Slider) return;
    const instances = new WeakMap();
    const INTERVAL = 5000;
    const TRANSITION = 780;
    function init(root = document.querySelector('[data-storefront-slider]')) {
        if (!root) return null;
        if (instances.has(root)) return instances.get(root);
        const slides = [...root.querySelectorAll('.banner-slide[data-slide]')];
        const dots = [...root.querySelectorAll('[data-slider-dot]')];
        if (!slides.length) return null;
        const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const pauseButton = root.querySelector('[data-slider-pause]');
        const announcement = root.querySelector('.slider-announcement');
        const position = root.querySelector('.slider-position');
        const number = new Intl.NumberFormat('fa-IR');
        const listeners = [], tabStops = new WeakMap();
        let index = Math.max(0, slides.findIndex(slide => slide.classList.contains('is-active')));
        let autoplayTimer = null, transitionTimer = null, destroyed = false;
        let hovered = false, focused = root.contains(document.activeElement), away = false;
        let userPaused = false, allowReducedAutoplay = false, pointer = null, suppressClickUntil = 0;
        const reduced = () => preference?.matches === true;
        const explicitlyPaused = () => userPaused || reduced() && !allowReducedAutoplay;
        const on = (target, type, callback, options) => {
            target.addEventListener(type, callback, options);
            listeners.push(() => target.removeEventListener(type, callback, options));
        };
        const clearAutoplay = () => { if (autoplayTimer !== null) window.clearTimeout(autoplayTimer); autoplayTimer = null; };
        const clearTransition = () => {
            if (transitionTimer !== null) window.clearTimeout(transitionTimer);
            transitionTimer = null;
            slides.forEach(slide => slide.classList.remove('is-exiting'));
        };
        const schedule = () => {
            clearAutoplay();
            if (destroyed || slides.length < 2 || hovered || focused || away || pointer || document.hidden || explicitlyPaused()) return;
            autoplayTimer = window.setTimeout(() => { autoplayTimer = null; goTo(index + 1, false); }, INTERVAL);
        };
        const updatePause = () => {
            if (!pauseButton) return;
            const paused = explicitlyPaused();
            pauseButton.setAttribute('aria-pressed', String(paused));
            pauseButton.setAttribute('aria-label', paused ? 'شروع پخش خودکار بنرها' : 'توقف پخش خودکار بنرها');
            pauseButton.textContent = paused ? '▶' : 'Ⅱ';
        };
        const accessibility = () => {
            slides.forEach((slide, i) => {
                const active = i === index;
                slide.classList.toggle('is-active', active);
                slide.setAttribute('aria-hidden', String(!active));
                slide.inert = !active;
                // Also protect keyboard access in older browsers without native inert.
                slide.querySelectorAll('a[href],button,input,select,textarea,[tabindex]').forEach(node => {
                    if (!tabStops.has(node)) tabStops.set(node, node.getAttribute('tabindex'));
                    const original = tabStops.get(node);
                    if (!active) node.setAttribute('tabindex', '-1');
                    else if (original === null) node.removeAttribute('tabindex');
                    else node.setAttribute('tabindex', original);
                });
            });
            dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
            root.dataset.sliderIndex = String(index);
            if (position) position.textContent = number.format(index + 1) + ' / ' + number.format(slides.length);
            updatePause();
        };
        function goTo(next, manual = true) {
            if (destroyed || !Number.isInteger(next)) return;
            next = (next % slides.length + slides.length) % slides.length;
            clearAutoplay(); clearTransition();
            const previous = index;
            index = next;
            accessibility();
            if (previous !== index && !reduced()) {
                slides[previous].classList.add('is-exiting');
                transitionTimer = window.setTimeout(clearTransition, TRANSITION);
            }
            if (manual && announcement) announcement.textContent = `بنر ${number.format(index + 1)} از ${number.format(slides.length)}: ${slides[index].dataset.title || ''}`;
            schedule();
        }
        const controller = Object.freeze({
            goTo,
            next: () => goTo(index + 1),
            previous: () => goTo(index - 1),
            pause() { userPaused = true; updatePause(); schedule(); },
            resume() { userPaused = false; allowReducedAutoplay = true; updatePause(); schedule(); },
            get index() { return index; },
            destroy() {
                if (destroyed) return;
                destroyed = true; clearAutoplay(); clearTransition();
                listeners.forEach(remove => remove());
                slides.forEach(slide => slide.querySelectorAll('a[href],button,input,select,textarea,[tabindex]').forEach(node => {
                    const original = tabStops.get(node);
                    if (original === null || original === undefined) node.removeAttribute('tabindex');
                    else node.setAttribute('tabindex', original);
                }));
                instances.delete(root);
                root.classList.remove('is-slider-ready');
            }
        });
        instances.set(root, controller);
        on(root, 'click', event => {
            if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
        }, true);
        on(root, 'click', event => {
            if (event.defaultPrevented) return;
            const control = event.target.closest?.('button');
            if (!control || !root.contains(control)) return;
            if (control.hasAttribute('data-slider-next')) controller.next();
            else if (control.hasAttribute('data-slider-prev')) controller.previous();
            else if (control.hasAttribute('data-slider-dot')) controller.goTo(Number(control.dataset.sliderDot));
            else if (control.hasAttribute('data-slider-pause')) explicitlyPaused() ? controller.resume() : controller.pause();
        });
        on(root, 'keydown', event => {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
            if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
            event.preventDefault();
            if (event.key === 'Home') goTo(0);
            else if (event.key === 'End') goTo(slides.length - 1);
            else {
                const rtl = (root.getAttribute('dir') || document.documentElement.dir) !== 'ltr';
                goTo(index + ((event.key === 'ArrowLeft') === rtl ? 1 : -1));
            }
        });
        on(root, 'mouseenter', () => { hovered = true; schedule(); });
        on(root, 'mouseleave', () => { hovered = false; schedule(); });
        on(root, 'focusin', () => { focused = true; schedule(); });
        on(root, 'focusout', event => { focused = root.contains(event.relatedTarget); schedule(); });
        on(document, 'visibilitychange', schedule);
        on(window, 'pagehide', () => { away = true; clearAutoplay(); clearTransition(); pointer = null; });
        on(window, 'pageshow', () => { away = false; schedule(); });
        on(root, 'pointerdown', event => {
            if ((event.pointerType !== 'touch' && event.pointerType !== 'pen') || event.isPrimary === false) return;
            pointer = {id:event.pointerId, x:event.clientX, y:event.clientY};
            clearAutoplay();
        }, {passive:true});
        on(window, 'pointerup', event => {
            if (!pointer || pointer.id !== event.pointerId) return;
            const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
            pointer = null;
            if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
                const rtl = (root.getAttribute('dir') || document.documentElement.dir) !== 'ltr';
                goTo(index + ((dx > 0) === rtl ? 1 : -1));
                suppressClickUntil = Date.now() + 350;
            } else schedule();
        }, {passive:true});
        on(window, 'pointercancel', () => { pointer = null; schedule(); }, {passive:true});
        root.querySelectorAll('.banner-image').forEach(image => {
            const recover = () => {
            const fallback = image.dataset.bannerFallback;
            if (!fallback || image.dataset.fallbackApplied === 'true') return;
            image.dataset.fallbackApplied = 'true';
            image.closest('picture')?.querySelectorAll('source').forEach(source => source.removeAttribute('srcset'));
            image.removeAttribute('srcset'); image.src = fallback;
            };
            on(image, 'error', recover);
            if (image.complete && image.naturalWidth === 0) recover();
        });
        const preferenceChanged = () => { allowReducedAutoplay = false; clearTransition(); updatePause(); schedule(); };
        if (preference?.addEventListener) on(preference, 'change', preferenceChanged);
        else if (preference?.addListener) { preference.addListener(preferenceChanged); listeners.push(() => preference.removeListener(preferenceChanged)); }
        root.classList.add('is-slider-ready');
        accessibility(); schedule();
        return controller;
    }
    window.Web2Slider = Object.freeze({init, destroy(root) { instances.get(root)?.destroy(); }});
    const boot = () => document.querySelectorAll('[data-storefront-slider]').forEach(root => init(root));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
    else boot();
})();
