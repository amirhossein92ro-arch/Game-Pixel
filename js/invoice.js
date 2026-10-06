(function () {
    "use strict";

    const money = new Intl.NumberFormat("fa-IR");
    const statusLabels = {
        pending: "در انتظار بررسی",
        paid: "پرداخت شده",
        delivered: "تحویل شده",
        processing: "در حال بررسی",
        confirmed: "تأیید شده",
        shipped: "ارسال شده",
        cancelled: "لغو شده",
        refunded: "مرجوع شده"
    };

    function safe(value) {
        const node = document.createElement("span");
        node.textContent = String(value ?? "");
        return node.innerHTML;
    }

    function price(value) {
        return `${money.format(Number(value) || 0)} تومان`;
    }

    function normalizeInvoice(source) {
        const items = Array.isArray(source.items) ? source.items : [];
        const total = Number(source.total ?? source.amountValue ?? 0);
        const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal ?? (Number(item.price) * Number(item.quantity))), 0);
        return {
            code: source.code || source.orderCode || "—",
            customer: source.userName || source.customerName || source.recipientName || "مشتری فروشگاه",
            email: source.userEmail || "—",
            phone: source.userPhone || source.recipientPhone || "—",
            address: source.recipientAddress || "—",
            date: source.date || new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeStyle: "short" }).format(new Date(source.createdAt || Date.now())),
            items,
            subtotal: subtotal || total,
            discount: Math.max(0, Number(source.discount ?? ((subtotal || total) + Number(source.shippingCost||0) - total))),
            shippingCost: Number(source.shippingCost||0),
            total,
            status: statusLabels[source.status] || source.statusLabel || "ثبت سفارش",
            payment: source.paymentStatus === "test" ? "آزمایشی؛ وجهی دریافت نشده" : source.paymentStatus === "paid" ? "پرداخت شده" : source.paymentStatus === "failed" ? "ناموفق" : "در انتظار پرداخت"
        };
    }

    function createInvoiceElement(source) {
        const invoice = normalizeInvoice(source);
        const wrapper = document.createElement("section");
        wrapper.className = "pdf-invoice-document";
        wrapper.dir = "rtl";
        wrapper.innerHTML = `
            <style>
                .pdf-invoice-document{box-sizing:border-box;width:190mm;min-height:270mm;margin:0 auto;padding:14mm;font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;color:#eaf7ff;background:#07101f;position:relative;overflow:hidden}
                .pdf-invoice-document *{box-sizing:border-box}.pdf-invoice-document:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 90% 5%,rgba(0,212,255,.2),transparent 28%),radial-gradient(circle at 10% 90%,rgba(139,92,246,.18),transparent 32%);pointer-events:none}
                .invoice-head,.invoice-meta,.invoice-customer,.invoice-table,.invoice-total,.invoice-foot{position:relative;z-index:1}.invoice-head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #00d4ff;padding-bottom:18px}.invoice-brand{display:flex;align-items:center;gap:12px}.invoice-logo{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;font-size:27px;background:linear-gradient(135deg,#00d4ff,#8b5cf6);color:#05101d;box-shadow:0 0 25px rgba(0,212,255,.35)}.invoice-brand strong{display:block;font-size:22px;letter-spacing:1px}.invoice-brand small{color:#8ea9bd}.invoice-title{text-align:left}.invoice-title strong{display:block;font-size:19px}.invoice-title span{color:#00d4ff;font-size:12px}
                .invoice-meta,.invoice-customer{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:18px}.invoice-box{border:1px solid rgba(0,212,255,.24);background:rgba(255,255,255,.04);border-radius:12px;padding:10px 13px}.invoice-box span{display:block;color:#8ea9bd;font-size:10px;margin-bottom:4px}.invoice-box strong{font-size:12px;font-weight:600}.invoice-customer{grid-template-columns:repeat(3,1fr)}.invoice-customer .wide{grid-column:1/-1}
                .invoice-table{width:100%;border-collapse:collapse;margin-top:20px;font-size:11px}.invoice-table th{background:linear-gradient(90deg,rgba(0,212,255,.18),rgba(139,92,246,.16));color:#bff7ff;padding:10px;border:1px solid rgba(0,212,255,.25)}.invoice-table td{padding:10px;border:1px solid rgba(255,255,255,.1);text-align:center}.invoice-table td:first-child{text-align:right}.invoice-total{width:52%;margin:18px 0 0 auto;border:1px solid rgba(139,92,246,.35);border-radius:14px;padding:12px;background:rgba(139,92,246,.08)}.invoice-total div{display:flex;justify-content:space-between;padding:6px}.invoice-total .grand{border-top:1px solid rgba(255,255,255,.15);margin-top:5px;padding-top:11px;color:#00f0ff;font-size:15px;font-weight:800}
                .invoice-foot{display:flex;justify-content:space-between;align-items:end;margin-top:34px}.invoice-note{max-width:58%;font-size:10px;line-height:2;color:#91a9bb}.invoice-seal{width:110px;height:110px;border:3px double #43ff9a;border-radius:50%;display:grid;place-items:center;text-align:center;transform:rotate(-8deg);color:#43ff9a;font-weight:800;font-size:11px;box-shadow:inset 0 0 18px rgba(67,255,154,.12)}.invoice-seal small{display:block;font-size:8px}.invoice-id{margin-top:28px;text-align:center;color:#668196;font-size:8px;letter-spacing:1px}
            </style>
            <header class="invoice-head">
                <div class="invoice-brand"><div class="invoice-logo">🎮</div><div><strong>GAMING STORE</strong><small>WEB 2 • فروشگاه تجهیزات گیمینگ</small></div></div>
                <div class="invoice-title"><strong>فاکتور رسمی فروش</strong><span>OFFICIAL INVOICE</span></div>
            </header>
            <div class="invoice-meta">
                <div class="invoice-box"><span>شناسه سفارش</span><strong>${safe(invoice.code)}</strong></div>
                <div class="invoice-box"><span>تاریخ صدور</span><strong>${safe(invoice.date)}</strong></div>
            </div>
            <div class="invoice-customer">
                <div class="invoice-box"><span>نام مشتری</span><strong>${safe(invoice.customer)}</strong></div>
                <div class="invoice-box"><span>شماره تماس</span><strong>${safe(invoice.phone)}</strong></div>
                <div class="invoice-box"><span>ایمیل</span><strong>${safe(invoice.email)}</strong></div>
                <div class="invoice-box wide"><span>نشانی تحویل</span><strong>${safe(invoice.address)}</strong></div>
            </div>
            <table class="invoice-table"><thead><tr><th>شرح کالا</th><th>تعداد</th><th>قیمت واحد</th><th>مبلغ</th></tr></thead><tbody>
                ${invoice.items.map((item) => `<tr><td>${safe(item.name)}</td><td>${money.format(Number(item.quantity) || 0)}</td><td>${price(item.price)}</td><td>${price(item.lineTotal ?? (Number(item.price) * Number(item.quantity)))}</td></tr>`).join("")}
            </tbody></table>
            <div class="invoice-total"><div><span>جمع اقلام</span><strong>${price(invoice.subtotal)}</strong></div>${invoice.discount ? `<div><span>تخفیف</span><strong>− ${price(invoice.discount)}</strong></div>` : ""}<div class="grand"><span>مبلغ نهایی</span><strong>${price(invoice.total)}</strong></div><div><span>وضعیت سفارش</span><strong>${safe(invoice.status)}</strong></div><div><span>وضعیت پرداخت</span><strong>${safe(invoice.payment)}</strong></div></div>
            <footer class="invoice-foot"><p class="invoice-note">این سند به‌صورت الکترونیکی توسط Gaming Store صادر شده است. مهر دیجیتال درج‌شده، تأیید ثبت سفارش در سامانه فروشگاه است.</p><div class="invoice-seal"><div>✓ تأیید شد<small>DIGITALLY VERIFIED</small></div></div></footer>
            <div class="invoice-id">GAMING STORE / WEB 2 / ${safe(invoice.code)}</div>`;
        return wrapper;
    }

    function openPrintableFallback(source, target) {
        const element = createInvoiceElement(source);
        target.document.open();
        target.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><title>فاکتور ${safe(source.code || source.orderCode)}</title><link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;800&display=swap" rel="stylesheet"><style>body{margin:0;background:#020713}.printbar{position:sticky;top:0;z-index:4;padding:10px;text-align:center;background:#101b31;color:white;font-family:Vazirmatn}.printbar button{font:inherit;padding:8px 18px;border:0;border-radius:9px;background:#00d4ff;cursor:pointer}@media print{.printbar{display:none}}</style></head><body><div class="printbar">پیش‌نمایش فاکتور — <button onclick="print()">چاپ / ذخیره PDF</button></div>${element.outerHTML}</body></html>`);
        target.document.close();
    }

    async function open(source) {
        const target = window.open("", "_blank", "noopener");
        if (!target) throw new Error("مرورگر باز شدن تب فاکتور را مسدود کرده است.");
        target.document.write("<title>در حال ساخت فاکتور…</title><body style='background:#050816;color:white;font-family:Tahoma;display:grid;place-items:center;height:100vh'>در حال ساخت فاکتور PDF…</body>");
        if (typeof window.html2pdf !== "function") {
            openPrintableFallback(source, target);
            return;
        }

        const element = createInvoiceElement(source);
        element.style.position = "fixed";
        element.style.left = "-9999px";
        element.style.top = "0";
        document.body.appendChild(element);
        try {
            if (document.fonts?.ready) await document.fonts.ready;
            const blob = await window.html2pdf().set({
                margin: 0,
                filename: `invoice-${source.code || source.orderCode || "gaming-store"}.pdf`,
                image: { type: "jpeg", quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: "#07101f" },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                pagebreak: { mode: ["avoid-all", "css", "legacy"] }
            }).from(element).outputPdf("blob");
            const url = URL.createObjectURL(blob);
            target.location.replace(url);
            window.setTimeout(() => URL.revokeObjectURL(url), 180000);
        } catch (error) {
            openPrintableFallback(source, target);
        } finally {
            element.remove();
        }
    }

    window.GamingInvoice = { open, createInvoiceElement };
}());
