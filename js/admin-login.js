"use strict";
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("adminLoginForm");
    const notice = document.getElementById("adminLoginNotice");
    if (!form || !notice) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (form.dataset.busy || !form.reportValidity()) return;
        const button = form.querySelector('[type="submit"]');
        const label=button.textContent;
        form.dataset.busy = "1";
        form.setAttribute('aria-busy','true');button.textContent='در حال ورود…';
        button.disabled = true;
        notice.textContent = "";
        try {
            const response = await fetch("/api/admin/login", {
                method: "POST",
                credentials: "include",
                headers: {"Accept": "application/json", "Content-Type": "application/json"},
                body: JSON.stringify({
                    username: form.elements.username.value.trim(),
                    password: form.elements.password.value,
                    otp: form.elements.otp.value.trim()
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(response.status>=500?'سرویس موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید.':response.status===429?'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.':typeof payload.error==='string'&&/[\u0600-\u06ff]/.test(payload.error)&&payload.error.length<=300&&!/[<>]/.test(payload.error)?payload.error:'نام کاربری، رمز عبور و کد تأیید را بررسی کنید.');
            if (!['ADMIN','SUPER_ADMIN'].includes(payload.role)) throw new Error("این حساب اجازه ورود به پنل مدیریت را ندارد.");
            window.location.replace("/admin");
        } catch (error) {
            notice.textContent = /[\u0600-\u06ff]/.test(error.message)?error.message:'ارتباط برقرار نشد؛ اتصال را بررسی کنید و دوباره تلاش کنید.';
            form.elements.password.value = "";
            form.elements.password.focus();
        } finally {
            delete form.dataset.busy;
            form.removeAttribute('aria-busy');button.textContent=label;
            button.disabled = false;
        }
    });
});
