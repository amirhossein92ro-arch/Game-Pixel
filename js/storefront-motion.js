/* Storefront motion enhances native navigation and loaded product markup only. */
(() => {
    'use strict';
    const boot = () => {
        if (!document.querySelector('.market-search')) return;
        const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const reduce = () => preference?.matches === true;
        const body = document.body;
        const selector = '.reveal, .reveal-up, .reveal-scale, .reveal-left, .reveal-right, .product-card, .category-card, .market-banners > a, .section-heading, .pc-component';
        const seen = new WeakSet();
        let observer;
        if ('IntersectionObserver' in window && !reduce()) {
            observer = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    entry.target.classList.remove('motion-pending');
                    entry.target.classList.add('motion-revealed');
                    const clearStagger = event => {
                        if (event.target !== entry.target) return;
                        for (let index = 0; index < 4; index++) entry.target.classList.remove('motion-delay-' + index);
                        entry.target.removeEventListener('transitionend', clearStagger);
                    };
                    entry.target.addEventListener('transitionend', clearStagger);
                    observer.unobserve(entry.target);
                }
            }, { threshold: .06, rootMargin: '0px 0px -18px 0px' });
        }
        const discover = root => {
            if (!(root instanceof Element)) return;
            const items = [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
            items.forEach((node, index) => {
                if (seen.has(node)) return;
                seen.add(node);
                if (observer && !reduce()) {
                    node.classList.add('motion-pending', 'motion-delay-' + (index % 4));
                    observer.observe(node);
                }
            });
        };
        discover(body);
        body.addEventListener('focusin', event => {
            // Keyboard focus must never land on a card waiting for scroll reveal.
            const pending = event.target.closest?.('.motion-pending');
            if (pending) { pending.classList.remove('motion-pending'); observer?.unobserve(pending); }
        });
        if (!reduce()) body.classList.add('storefront-entering');
        body.addEventListener('animationend', event => {
            if (event.animationName === 'storefront-enter') body.classList.remove('storefront-entering');
        });
        const badge = document.getElementById('cart-count');
        let count = badge?.textContent;
        const badgeObserver = badge && 'MutationObserver' in window ? new MutationObserver(() => {
            const next = badge.textContent;
            if (next === count) return;
            count = next;
            if (!reduce() && typeof badge.animate === 'function') badge.animate([
                { transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }
            ], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }) : null;
        badgeObserver?.observe(badge, { childList: true, characterData: true, subtree: true });
        // Observe inserted markup, not scroll or every attribute, so API-driven cards reveal too.
        const additions = 'MutationObserver' in window ? new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) discover(node);
        }) : null;
        additions?.observe(document.getElementById('main-content') || body, { childList: true, subtree: true });
        const header = document.querySelector('.site-header');
        if (header && 'IntersectionObserver' in window) {
            const sentinel = document.createElement('span');
            sentinel.className = 'header-scroll-sentinel';
            sentinel.setAttribute('aria-hidden', 'true');
            header.before(sentinel);
            const sticky = new IntersectionObserver(entries => {
                header.classList.toggle('is-scrolled', !entries[0].isIntersecting);
            }, { threshold: 0 });
            sticky.observe(sentinel);
        }
        const onPreference = () => {
            if (!reduce()) return;
            observer?.disconnect();
            body.classList.remove('storefront-entering', 'storefront-leaving');
            document.querySelectorAll('.motion-pending').forEach(node => node.classList.remove('motion-pending'));
        };
        preference?.addEventListener?.('change', onPreference);
        window.addEventListener('pageshow', () => {
            body.classList.remove('storefront-leaving');
            // A restored document should be immediately usable, including its previously unseen cards.
            document.querySelectorAll('.motion-pending').forEach(node => {
                const rect = node.getBoundingClientRect();
                if (rect.top < window.innerHeight && rect.bottom >= 0) node.classList.remove('motion-pending');
            });
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
