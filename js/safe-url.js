(function (root, factory) {
    'use strict';
    const api = Object.freeze(factory());
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Web2SafeURL = api;
}(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    const invalid = value => /[\\\u0000-\u0020\u007f<>"']/.test(value);
    function https(value) {
        if (!value.startsWith('https://') || invalid(value)) return false;
        try {const url = new URL(value);return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;}
        catch {return false;}
    }
    function link(value) {
        if (typeof value !== 'string' || value.length > 500 || invalid(value)) return '';
        return https(value) || value.startsWith('/') && !value.startsWith('//') ? value : '';
    }
    function image(value, {allowData = true, maxLength = 1000000} = {}) {
        if (typeof value !== 'string' || value.length > maxLength || invalid(value)) return '';
        if (https(value)) return value;
        if (/^img\/[a-zA-Z0-9_./-]+$/.test(value) && !value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))
            && /\.(?:png|jpe?g|webp|gif|svg|avif|ico)$/i.test(value)) return value;
        if (allowData && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(value)) return value;
        return '';
    }
    return {link,image};
}));
