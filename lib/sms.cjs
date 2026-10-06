'use strict';

const KAVENEGAR_BASE_URL = 'https://api.kavenegar.com/v1';

function createSmsService(env = process.env, options = {}) {
    const production = env.NODE_ENV === 'production';
    const provider = String(env.SMS_PROVIDER || '').trim().toLowerCase();
    const apiKey = String(env.SMS_API_KEY || '').trim();
    const apiUrl = String(env.SMS_API_URL || '').trim();
    const sender = String(env.SMS_SENDER || '').trim();
    const templateId = String(env.SMS_TEMPLATE_ID || env.SMS_TEMPLATE || '').trim();
    const request = options.fetch || globalThis.fetch;
    const mock = !provider || provider === 'mock';

    if (production && mock) throw new Error('Production requires a real SMS_PROVIDER.');
    if (!mock && !apiKey) throw new Error('SMS_API_KEY is required when SMS_PROVIDER is configured.');
    if (provider === 'kavenegar' && !templateId) throw new Error('SMS_TEMPLATE_ID is required for Kavenegar OTP delivery.');
    if (provider === 'generic' && !apiUrl) throw new Error('SMS_API_URL is required for the generic SMS provider.');
    if (!mock && !['kavenegar', 'generic'].includes(provider)) throw new Error(`Unsupported SMS_PROVIDER: ${provider}`);
    if (typeof request !== 'function') throw new Error('A fetch implementation is required for SMS delivery.');

    async function postForm(url, values) {
        const response = await request(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams(values),
            signal: AbortSignal.timeout(10000)
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.return?.status !== 200) throw new Error(`SMS provider rejected the request (${response.status}).`);
        return payload;
    }

    async function sendOtp({phone, code, expiresInSeconds}) {
        if (!/^09\d{9}$/.test(String(phone)) || !/^\d{6}$/.test(String(code))) throw new Error('Invalid OTP delivery payload.');
        if (mock) return {provider: 'mock', delivered: true, mockCode: production ? undefined : code};

        if (provider === 'kavenegar') {
            const url = `${KAVENEGAR_BASE_URL}/${encodeURIComponent(apiKey)}/verify/lookup.json`;
            const payload = await postForm(url, {receptor: phone, token: code, template: templateId, type: 'sms'});
            return {provider, delivered: true, deliveryId: payload.entries?.[0]?.messageid || null};
        }

        const response = await request(apiUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
            body: JSON.stringify({to: phone, sender, templateId, parameters: {code, expiresInSeconds}}),
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error(`SMS provider rejected the request (${response.status}).`);
        return {provider, delivered: true};
    }

    return {provider: mock ? 'mock' : provider, mock, sendOtp};
}

module.exports = {createSmsService, KAVENEGAR_BASE_URL};
