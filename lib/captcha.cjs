'use strict';

function createCaptchaService(env = process.env) {
    const production = env.NODE_ENV === 'production';
    const siteKey = String(env.CAPTCHA_SITE_KEY || '').trim();
    const secretKey = String(env.CAPTCHA_SECRET_KEY || '').trim();
    const testMode = !production && env.CAPTCHA_TEST_MODE === 'true';
    if (Boolean(siteKey) !== Boolean(secretKey)) throw new Error('CAPTCHA_SITE_KEY and CAPTCHA_SECRET_KEY must be configured together.');
    if (production && (!siteKey || !secretKey)) throw new Error('Production requires CAPTCHA_SITE_KEY and CAPTCHA_SECRET_KEY.');

    async function verify(token, remoteIp) {
        if (testMode) return token === 'test-valid-captcha';
        if (!secretKey) return !production;
        if (typeof token !== 'string' || !token.trim()) return false;
        try {
            const body = new URLSearchParams({secret: secretKey, response: token});
            if (remoteIp) body.set('remoteip', remoteIp);
            const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST', body, signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) return false;
            return (await response.json()).success === true;
        } catch {
            return false;
        }
    }

    return {siteKey, required: Boolean(siteKey) || testMode, testMode, verify};
}

module.exports = {createCaptchaService};
