'use strict';
const crypto=require('node:crypto');
const unavailable=()=>Object.assign(new Error('Payment provider is unavailable.'),{status:503});
const scenarios=new Set(['SUCCESS','FAILURE','TIMEOUT','DUPLICATE_CALLBACK']);
function getPaymentProvider() {
    const mode=process.env.PAYMENT_MODE||'test';
    const enabled=mode==='test'&&process.env.NODE_ENV!=='production';
    return {
        mode,
        createPayment(order) {
            if(!enabled)throw unavailable();
            return {provider:'test',paymentStatus:'test',reference:`TEST-${order.code}`,message:'سفارش آزمایشی ثبت شد؛ هیچ وجهی دریافت نشده است.'};
        },
        verifyPayment(attempt,scenario){if(!enabled||!scenarios.has(scenario))throw unavailable();return {status:scenario==='SUCCESS'||scenario==='DUPLICATE_CALLBACK'?'captured':scenario==='FAILURE'?'failed':'pending',amount:attempt.amount,currency:attempt.currency,reference:attempt.provider_reference};},
        capturePayment(){throw unavailable();},
        cancelPayment(){throw unavailable();},
        refundPayment(attempt,amount,key){if(!enabled||attempt.status!=='captured'||!Number.isSafeInteger(amount)||amount<1)throw unavailable();return {status:'completed',reference:'TEST-REFUND-'+crypto.createHash('sha256').update(attempt.id+':'+key).digest('hex').slice(0,24)};},
        verifyWebhook(body,signature,secret){
            if(!enabled||!secret||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return false;
            const expected=crypto.createHmac('sha256',secret).update(body).digest('hex');
            return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
        }
    };
}
module.exports={getPaymentProvider};
