(function (root, factory) {
    'use strict';
    const api = Object.freeze(factory());
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Web2ProductPricing = api;
}(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    function normalizeCampaign(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const start = Date.parse(value.startAt), end = Date.parse(value.endAt);
        if (!Number.isFinite(start) || !Number.isFinite(end) || typeof value.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.id)) return null;
        const anniversary = new Date(start); anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
        if (end !== anniversary.getTime() || !Number.isSafeInteger(value.discount) || value.discount < 1 || value.discount > 99) return null;
        return {id:value.id,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),discount:value.discount};
    }
    function campaignState(product, now = Date.now()) {
        const campaign = normalizeCampaign(product && product.campaign);
        if (!campaign) return 'none';
        const time = Number(now);
        if (!Number.isFinite(time) || time < Date.parse(campaign.startAt)) return 'scheduled';
        return time < Date.parse(campaign.endAt) ? 'active' : 'expired';
    }
    function effectiveDiscount(product, now = Date.now()) {
        const base = Number.isFinite(Number(product && product.discount)) ? Math.min(99,Math.max(0,Number(product.discount))) : 0;
        const campaign = normalizeCampaign(product && product.campaign);
        return campaign && campaignState(product,now) === 'active' ? Math.max(base,campaign.discount) : base;
    }
    function unitPrice(product, now = Date.now()) {
        const price = product && product.price;
        if (!Number.isSafeInteger(price) || price < 1) return null;
        const result = Math.round(price * (100-effectiveDiscount(product,now))/100);
        return Number.isSafeInteger(result) && result > 0 ? result : null;
    }
    return {normalizeCampaign,campaignState,effectiveDiscount,unitPrice};
}));
