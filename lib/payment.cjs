'use strict';
function getPaymentProvider() {
    const mode=process.env.PAYMENT_MODE||'test';
    return {
        mode,
        createPayment(order) {
            if(mode!=='test')throw Object.assign(new Error('درگاه واقعی هنوز پیاده‌سازی و پیکربندی نشده است.'),{status:503});
            return {provider:'test',paymentStatus:'test',reference:`TEST-${order.code}`,message:'سفارش آزمایشی ثبت شد؛ هیچ وجهی دریافت نشده است.'};
        }
    };
}
module.exports={getPaymentProvider};
