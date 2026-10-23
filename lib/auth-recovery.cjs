'use strict';
const crypto = require('node:crypto');
const bcrypt = require('./passwords.cjs');
const {createSmsService} = require('./sms.cjs');
const {createCaptchaService} = require('./captcha.cjs');

const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), {status});

function createWindowLimiter({limit, windowMs, message}) {
    const entries = new Map();let nextSweep=0;
    return key => {
        const now = Date.now();
        if(now>=nextSweep){for(const [id,value]of entries)if(value.until<=now)entries.delete(id);nextSweep=now+1000;}
        if(entries.size>=10000&&!entries.has(key))throw Object.assign(fail(429,'Too many requests.'),{retryAfter:Math.ceil(windowMs/1000)});
        let value = entries.get(key);
        if (!value || value.until <= now) value = {count: 0, until: now + windowMs};
        value.count += 1; entries.set(key, value);
        if (value.count > limit) {
            const error = fail(429, message);
            error.retryAfter = Math.max(1, Math.ceil((value.until - now) / 1000));
            throw error;
        }
    };
}

function createAuthRecovery(store, env = process.env) {
    const {transaction} = store;
    const sms = createSmsService(env);
    const captcha = createCaptchaService(env);
    const otpTtlMs = Math.min(5, Math.max(2, Number.parseInt(env.OTP_TTL_MINUTES || '2', 10) || 2)) * 60000;
    const resetTtlMs = 10 * 60000;
    const loginFailures = require('./login-protection.cjs').createLoginProtection(store,'user');
    const otpIpLimit = createWindowLimiter({limit: 10, windowMs: 15 * 60000, message: 'درخواست‌های بازیابی بیش از حد بود؛ کمی بعد دوباره تلاش کنید.'});
    const otpPhoneLimit = createWindowLimiter({limit: 3, windowMs: 15 * 60000, message: 'درخواست‌های بازیابی بیش از حد بود؛ کمی بعد دوباره تلاش کنید.'});
    const verifyLimit = createWindowLimiter({limit: 8, windowMs: 10 * 60000, message: 'تعداد تلاش‌ها بیش از حد بود؛ کمی بعد دوباره تلاش کنید.'});

    const captchaGuard = async (req, action) => {
        if (!await captcha.verify(req.body?.captchaToken, req.ip, action)) {store.securityEvent('CAPTCHA_FAILED','',{action,ip:req.ip});throw fail(400, 'لطفاً تأیید کنید که ربات نیستید.');}
    };
    const loginKey = req => String(req.body?.email || '').trim().toLowerCase();
    const loginGuard = async req => {
        loginFailures.check(loginKey(req));
        await captchaGuard(req,'login');
    };
    const loginFailed = req => {
        loginFailures.failed(loginKey(req));
        store.securityEvent('USER_LOGIN_FAILED','',{ip: req.ip});
    };
    const loginSucceeded = req => loginFailures.succeeded(loginKey(req));
    const publicConfig = () => ({
        turnstileSiteKey: captcha.siteKey,
        captchaSiteKey: captcha.siteKey,
        captchaConfigured: captcha.configured,
        captchaRequired: captcha.required,
        captchaTestMode: captcha.testMode,
        developmentMessage: captcha.developmentMessage
    });

    async function requestOtp(req) {
        await captchaGuard(req, 'forgot_password');
        const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
        if (!/^09\d{9}$/.test(phone)) throw fail(400, 'شماره موبایل را با قالب صحیح وارد کنید.');
        const phoneKey = digest(phone);
        otpIpLimit(`otp-ip:${req.ip}`); otpPhoneLimit(`otp-phone:${phoneKey}`);
        const recent = store.access('auth-recovery').findPasswordResetChallengesByPhoneHash(phoneKey);
        if (recent && Date.now() - recent.created_at < 120000) {
            const error = fail(429, 'کد قبلی هنوز معتبر است؛ برای ارسال دوباره کمی صبر کنید.');
            error.retryAfter = Math.ceil((120000 - (Date.now() - recent.created_at)) / 1000);
            throw error;
        }
        const account = store.access('auth-recovery').findAccountsByPhone(phone);
        const id = crypto.randomUUID(), code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const otpHash = await bcrypt.hash(code, 10), now = Date.now();
        transaction(() => {
            const latest = store.access('auth-recovery').findPasswordResetChallengesByPhoneHash(phoneKey);
            if (latest && now - latest.created_at < 120000) {
                const cooldown = fail(429, 'کد قبلی هنوز معتبر است؛ برای ارسال دوباره کمی صبر کنید.');
                cooldown.retryAfter = Math.ceil((120000 - (now - latest.created_at)) / 1000);
                throw cooldown;
            }
            store.access('auth-recovery').deletePasswordResetChallengesByExpiresAtAndUsedAt(now - 86400000);
            store.access('auth-recovery').updatePasswordResetChallengesByPhoneHashAndUsedAt(now,phoneKey);
            store.access('auth-recovery').createResetChallenge(id, account?.id || null, phoneKey, otpHash, now + otpTtlMs, now);
        });
        let mockOtp;
        if (account) {
            try { mockOtp = (await sms.sendOtp({phone, code, expiresInSeconds: Math.floor(otpTtlMs / 1000)})).mockCode; }
            catch {
                // Provider errors are logged without request details, phone, API URL or OTP.
                console.error('[sms] OTP delivery failed.');
            }
        } else if (sms.mock) mockOtp = code;
        return {challengeId: id, expiresIn: Math.floor(otpTtlMs / 1000), resendAfter: 120,
            message: 'اگر اطلاعات واردشده معتبر باشد، کد تأیید ارسال خواهد شد.',
            ...(mockOtp && env.NODE_ENV==='test' ? {mockOtp} : {})};
    }

    async function verifyOtp(req) {
        await captchaGuard(req, 'forgot_password');
        const id = String(req.body.challengeId || ''), otp = String(req.body.otp || '').trim();
        verifyLimit(`verify:${req.ip}:${id}`);
        if (!/^[a-f0-9-]{36}$/.test(id)) throw fail(400, 'کد واردشده نامعتبر یا منقضی شده است.');
        const row = store.access('auth-recovery').findPasswordResetChallengesById(id);
        if (!/^\d{6}$/.test(otp) || !row || row.used_at || row.expires_at <= Date.now() || row.attempts >= 5) throw fail(400, 'کد واردشده نامعتبر یا منقضی شده است.');
        // Reserve the attempt before bcrypt: parallel requests share the same five-attempt budget.
        const reserved = store.access('auth-recovery').updatePasswordResetChallengesByIdAndUsedAtAndVerifiedTokenHash(id,Date.now());
        if (!reserved.changes) throw fail(400, 'کد واردشده نامعتبر یا منقضی شده است.');
        const valid = await bcrypt.compare(otp, row.otp_hash);
        if (!valid || !row.user_id) {
            throw fail(400, 'کد واردشده نامعتبر یا منقضی شده است.');
        }
        const account = store.access('auth-recovery').findAccountsById(row.user_id);
        if (!account || digest(account.phone)!==row.phone_hash || JSON.parse(account.payload).banned) throw fail(400, 'کد واردشده نامعتبر یا منقضی شده است.');
        const resetToken = crypto.randomBytes(32).toString('hex');
        const invalidOtpHash = digest(crypto.randomBytes(32));
        const changed = store.access('auth-recovery').verifyResetChallenge(invalidOtpHash, digest(resetToken), Date.now() + resetTtlMs, id, Date.now());
        if (!changed.changes) throw fail(400, 'کد واردشده نامعتبر یا منقضی شده است.');
        return {challengeId: id, resetToken, expiresIn: Math.floor(resetTtlMs / 1000), message: 'کد تأیید شد؛ رمز جدید را تعیین کنید.'};
    }

    async function resetPassword(req) {
        await captchaGuard(req, 'password_reset');
        const id = String(req.body.challengeId || ''), token = String(req.body.resetToken || '');
        if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) throw fail(400, 'مجوز تغییر رمز نامعتبر یا منقضی شده است؛ بازیابی را دوباره آغاز کنید.');
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
        if (password.length < 12 || Buffer.byteLength(password) > 72 || password !== confirmPassword) throw fail(400, 'رمز جدید باید حداقل ۱۲ کاراکتر، حداکثر ۷۲ بایت و با تکرار آن یکسان باشد.');
        const row = store.access('auth-recovery').findPasswordResetChallengesById(id);
        if (!row || !row.user_id || row.used_at || !row.verified_token_hash || row.verified_expires_at <= Date.now()
            || !token || !crypto.timingSafeEqual(Buffer.from(digest(token)), Buffer.from(row.verified_token_hash))) throw fail(400, 'مجوز تغییر رمز نامعتبر یا منقضی شده است؛ بازیابی را دوباره آغاز کنید.');
        require('./request-security.cjs').password(password);
        const passwordHash = await bcrypt.hash(password, 12), now = Date.now();
        transaction(() => {
            const current=store.access('auth-recovery').findAccountsById(row.user_id);const legacy=store.list('users').find(u=>String(u.id)===String(row.user_id));if(!current||digest(current.phone)!==row.phone_hash||JSON.parse(current.payload).banned||legacy?.banned)throw fail(400,'Recovery is unavailable.');
            const result = store.access('auth-recovery').updatePasswordResetChallengesByIdAndUsedAtAndVerifiedExpiresAt(now, id, now, digest(token));
            if (!result.changes) throw fail(409, 'این کد قبلاً استفاده شده است.');
            store.access('auth-recovery').updateAccountsById(passwordHash, row.user_id);
            store.access('auth-recovery').updateAdminAccountsById(passwordHash,new Date(now).toISOString(),row.user_id);
            store.revokeSessions(row.user_id);
            store.securityEvent('USER_PASSWORD_RESET',row.user_id,{ip:req.ip});
        });
        return {message: 'رمز عبور با موفقیت تغییر کرد. اکنون با رمز جدید وارد شوید.'};
    }

    return {publicConfig, captchaGuard, loginGuard, loginFailed, loginSucceeded, requestOtp, verifyOtp, resetPassword};
}

module.exports = {createAuthRecovery};
