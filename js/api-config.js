'use strict';
(() => {
    // Matches the root Node server's default PORT. Update here for a custom PORT.
    const DEVELOPMENT_API_PORT = 3000;
    const location = window.location;
    const liveServer = ['localhost', '127.0.0.1'].includes(location.hostname) && ['5500', '5501'].includes(location.port);
    const API_BASE_URL = liveServer ? `${location.protocol}//${location.hostname}:${DEVELOPMENT_API_PORT}` : '';
    window.Web2Config = Object.freeze({
        API_BASE_URL,
        apiUrl(input) {
            const url = new URL(input, location.href);
            if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
                return new URL(url.pathname + url.search, API_BASE_URL || location.origin).href;
            }
            return url.href;
        }
    });
})();
