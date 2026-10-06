'use strict';

function createSmsService(env = process.env) {
    const production = env.NODE_ENV === 'production';
    const provider = String(env.SMS_PROVIDER || '').trim().toLowerCase();
    const apiKey = String(env.SMS_API_KEY || '').trim();
    const apiUrl = String(env.SMS_API_URL || '').trim();
    const sender = String(env.SMS_SENDER || '').trim();
    const template = String(env.SMS_TEMPLATE || '').trim();
    const mock = !provider;

    if (production && mock) throw new Error('Production requires SMS_PROVIDER.');
    if (!mock && (!apiKey || !apiUrl)) throw new Error('SMS_API_KEY and SMS_API_URL are required when SMS_PROVIDER is configured.');

    async function sendOtp({phone, code, expiresInSeconds}) {
        if (mock) return {provider: 'mock', delivered: true, mockCode: production ? undefined : code};
        if (provider !== 'generic') throw new Error(`Unsupported SMS_PROVIDER: ${provider}`);
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
            body: JSON.stringify({to: phone, sender, template, parameters: {code, expiresInSeconds}}),
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
        return {provider, delivered: true};
    }

    return {mock, sendOtp};
}

module.exports = {createSmsService};
