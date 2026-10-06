'use strict';

const crypto = require('node:crypto');

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TOKEN_MAX_LENGTH = 2048;

function createCaptchaService(env = process.env, options = {}) {
    const production = env.NODE_ENV === 'production';
    const siteKey = String(env.TURNSTILE_SITE_KEY || env.CAPTCHA_SITE_KEY || '').trim();
    const secretKey = String(env.TURNSTILE_SECRET_KEY || env.CAPTCHA_SECRET_KEY || '').trim();
    const testMode = !production && env.CAPTCHA_TEST_MODE === 'true';
    const request = options.fetch || globalThis.fetch;
    const configured = Boolean(siteKey && secretKey);
    const appHostname = (() => {
        try { return new URL(env.APP_ORIGIN || '').hostname.toLowerCase(); }
        catch { return ''; }
    })();

    if (Boolean(siteKey) !== Boolean(secretKey)) {
        throw new Error('TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must be configured together.');
    }
    if (production && !configured) throw new Error('Production requires TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.');
    if (typeof request !== 'function') throw new Error('A fetch implementation is required for Turnstile verification.');

    async function verify(token, remoteIp, expectedAction) {
        if (testMode) return token === 'test-valid-captcha';
        if (!configured) return env.NODE_ENV === 'test';
        if (typeof token !== 'string' || !token.trim() || token.length > TOKEN_MAX_LENGTH) return false;
        try {
            const body = new URLSearchParams({
                secret: secretKey,
                response: token.trim(),
                idempotency_key: crypto.randomUUID()
            });
            if (remoteIp) body.set('remoteip', String(remoteIp));
            const response = await request(SITEVERIFY_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body,
                signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) return false;
            const result = await response.json();
            if (result.success !== true) return false;
            if (expectedAction && result.action !== expectedAction) return false;
            if (production && appHostname && String(result.hostname || '').toLowerCase() !== appHostname) return false;
            return true;
        } catch {
            return false;
        }
    }

    return {
        siteKey,
        configured,
        required: configured || testMode,
        testMode,
        developmentMessage: configured || production || testMode
            ? ''
            : 'Cloudflare Turnstile در محیط توسعه تنظیم نشده است؛ TURNSTILE_SITE_KEY و TURNSTILE_SECRET_KEY را در .env وارد کنید.',
        verify
    };
}

module.exports = {createCaptchaService, SITEVERIFY_URL};
