'use strict';
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const {createSmsService} = require('./sms.cjs');
const {createCaptchaService} = require('./captcha.cjs');

const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), {status});

function createWindowLimiter({limit, windowMs, message}) {
    const entries = new Map();
    return key => {
        const now = Date.now();
        if (entries.size > 10000) for (const [id, value] of entries) if (value.until <= now) entries.delete(id);
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
    const {db, transaction} = store;
    const sms = createSmsService(env);
    const captcha = createCaptchaService(env);
    const otpTtlMs = Math.min(5, Math.max(2, Number.parseInt(env.OTP_TTL_MINUTES || '3', 10) || 3)) * 60000;
    const resetTtlMs = 10 * 60000;
    const loginLimit = createWindowLimiter({limit: 5, windowMs: 15 * 60000, message: 'تلاش‌های ورود بیش از حد بود؛ ۱۵ دقیقه بعد دوباره تلاش کنید.'});
    const otpIpLimit = createWindowLimiter({limit: 5, windowMs: 15 * 60000, message: 'درخواست‌های بازیابی بیش از حد بود؛ کمی بعد دوباره تلاش کنید.'});
    const otpPhoneLimit = createWindowLimiter({limit: 3, windowMs: 15 * 60000, message: 'درخواست‌های بازیابی بیش از حد بود؛ کمی بعد دوباره تلاش کنید.'});
    const verifyLimit = createWindowLimiter({limit: 8, windowMs: 10 * 60000, message: 'تعداد تلاش‌ها بیش از حد بود؛ کمی بعد دوباره تلاش کنید.'});

    const captchaGuard = async req => {
        if (!await captcha.verify(req.body?.captchaToken, req.ip)) throw fail(400, 'تأیید امنیتی نامعتبر یا منقضی شده است؛ دوباره تلاش کنید.');
    };
    const loginGuard = async req => { loginLimit(`login:${req.ip}`); await captchaGuard(req); };
    const publicConfig = () => ({captchaSiteKey: captcha.siteKey, captchaRequired: captcha.required, captchaTestMode: captcha.testMode});

    async function requestOtp(req) {
        await captchaGuard(req);
        const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
        if (!/^09\d{9}$/.test(phone)) throw fail(400, 'شماره موبایل را با قالب صحیح وارد کنید.');
        const phoneKey = digest(phone);
        otpIpLimit(`otp-ip:${req.ip}`); otpPhoneLimit(`otp-phone:${phoneKey}`);
        const recent = db.prepare('SELECT created_at FROM password_reset_challenges WHERE phone_hash=? ORDER BY created_at DESC LIMIT 1').get(phoneKey);
        if (recent && Date.now() - recent.created_at < 120000) {
            const error = fail(429, 'کد قبلی هنوز معتبر است؛ برای ارسال دوباره کمی صبر کنید.');
            error.retryAfter = Math.ceil((120000 - (Date.now() - recent.created_at)) / 1000);
            throw error;
        }
        const account = db.prepare('SELECT id FROM accounts WHERE phone=?').get(phone);
        const id = crypto.randomUUID(), code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const otpHash = await bcrypt.hash(code, 10), now = Date.now();
        transaction(() => {
            db.prepare('DELETE FROM password_reset_challenges WHERE expires_at<? OR used_at IS NOT NULL').run(now - 86400000);
            db.prepare('INSERT INTO password_reset_challenges(id,user_id,phone_hash,otp_hash,expires_at,attempts,verified_token_hash,verified_expires_at,used_at,created_at) VALUES(?,?,?,?,?,0,NULL,NULL,NULL,?)')
                .run(id, account?.id || null, phoneKey, otpHash, now + otpTtlMs, now);
        });
        let mockOtp;
        if (account) {
            try { mockOtp = (await sms.sendOtp({phone, code, expiresInSeconds: Math.floor(otpTtlMs / 1000)})).mockCode; }
            catch (error) {
                db.prepare('DELETE FROM password_reset_challenges WHERE id=?').run(id);
                console.error('[sms] OTP delivery failed:', error.message);
                throw fail(503, 'ارسال پیامک موقتاً ممکن نیست؛ کمی بعد دوباره تلاش کنید.');
            }
        }
        return {challengeId: id, expiresIn: Math.floor(otpTtlMs / 1000), resendAfter: 120,
            message: 'اگر این شماره در فروشگاه ثبت شده باشد، کد بازیابی برای آن ارسال می‌شود.',
            ...(mockOtp ? {mockOtp} : {})};
    }

    async function verifyOtp(req) {
        await captchaGuard(req);
        const id = String(req.body.challengeId || ''), otp = String(req.body.otp || '').trim();
        verifyLimit(`verify:${req.ip}:${id}`);
        const row = db.prepare('SELECT * FROM password_reset_challenges WHERE id=?').get(id);
        if (!/^\d{6}$/.test(otp) || !row || row.used_at || row.expires_at <= Date.now() || row.attempts >= 5) throw fail(400, 'کد واردشده نامعتبر یا منقضی شده است.');
        const valid = await bcrypt.compare(otp, row.otp_hash);
        if (!valid || !row.user_id) {
            db.prepare('UPDATE password_reset_challenges SET attempts=attempts+1 WHERE id=?').run(id);
            throw fail(400, 'کد واردشده نامعتبر یا منقضی شده است.');
        }
        const resetToken = crypto.randomBytes(32).toString('hex');
        db.prepare('UPDATE password_reset_challenges SET verified_token_hash=?,verified_expires_at=? WHERE id=? AND used_at IS NULL')
            .run(digest(resetToken), Date.now() + resetTtlMs, id);
        return {challengeId: id, resetToken, expiresIn: Math.floor(resetTtlMs / 1000), message: 'کد تأیید شد؛ رمز جدید را تعیین کنید.'};
    }

    async function resetPassword(req) {
        await captchaGuard(req);
        const id = String(req.body.challengeId || ''), token = String(req.body.resetToken || '');
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
        if (password.length < 12 || Buffer.byteLength(password) > 72 || password !== confirmPassword) throw fail(400, 'رمز جدید باید حداقل ۱۲ کاراکتر، حداکثر ۷۲ بایت و با تکرار آن یکسان باشد.');
        const row = db.prepare('SELECT * FROM password_reset_challenges WHERE id=?').get(id);
        if (!row || !row.user_id || row.used_at || !row.verified_token_hash || row.verified_expires_at <= Date.now()
            || !token || !crypto.timingSafeEqual(Buffer.from(digest(token)), Buffer.from(row.verified_token_hash))) throw fail(400, 'مجوز تغییر رمز نامعتبر یا منقضی شده است؛ بازیابی را دوباره آغاز کنید.');
        const passwordHash = await bcrypt.hash(password, 12), now = Date.now();
        transaction(() => {
            const result = db.prepare('UPDATE password_reset_challenges SET used_at=? WHERE id=? AND used_at IS NULL').run(now, id);
            if (!result.changes) throw fail(409, 'این کد قبلاً استفاده شده است.');
            db.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(passwordHash, row.user_id);
            db.prepare("DELETE FROM sessions WHERE principal=? AND kind='user'").run(row.user_id);
            db.prepare('UPDATE password_reset_challenges SET used_at=? WHERE user_id=? AND used_at IS NULL').run(now, row.user_id);
        });
        return {message: 'رمز عبور با موفقیت تغییر کرد. اکنون با رمز جدید وارد شوید.'};
    }

    return {publicConfig, loginGuard, requestOtp, verifyOtp, resetPassword};
}

module.exports = {createAuthRecovery};
