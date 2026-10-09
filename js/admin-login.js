"use strict";
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("adminLoginForm");
    const notice = document.getElementById("adminLoginNotice");
    if (!form || !notice) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (form.dataset.busy) return;
        const button = form.querySelector('[type="submit"]');
        form.dataset.busy = "1";
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
            if (!response.ok) throw new Error(payload.error || "ورود به پنل ناموفق بود.");
            if (!['ADMIN','SUPER_ADMIN'].includes(payload.role)) throw new Error("این حساب اجازه ورود به پنل مدیریت را ندارد.");
            window.location.replace("/admin");
        } catch (error) {
            notice.textContent = error.message;
            form.elements.password.value = "";
            form.elements.password.focus();
        } finally {
            delete form.dataset.busy;
            button.disabled = false;
        }
    });
});
