'use strict';
const fail=message=>Object.assign(new Error(message),{status:409});
const transitions=Object.freeze({
    pending:['awaiting_payment','paid','processing','shipped','cancelled','payment_failed'],
    awaiting_payment:['paid','payment_failed','cancelled'],
    payment_failed:['awaiting_payment','cancelled'],
    paid:['processing','cancelled','refund_pending'],
    processing:['shipped','cancelled','refund_pending'],
    shipped:['delivered','refund_pending'],
    delivered:['refund_pending'],
    refund_pending:['partially_refunded','refunded','paid','processing','shipped','delivered'],
    partially_refunded:['refund_pending','refunded','processing','shipped','delivered'],
    refunded:[],cancelled:['refund_pending']
});
const orderStates=Object.freeze(Object.keys(transitions));
const paymentStates=Object.freeze(['unknown','test','pending','authorized','captured','paid','failed','cancelled','partially_refunded','refunded']);
function assertTransition(order,next){
    if(!orderStates.includes(next))throw Object.assign(new Error('Invalid order status.'),{status:400});
    if(order.status===next)return false;
    if(!transitions[order.status]?.includes(next))throw fail('Invalid order status transition.');
    if(next==='paid'&&!['captured','paid'].includes(order.paymentStatus))throw fail('Payment has not been verified.');
    if(['processing','shipped'].includes(next)&&['pending','awaiting_payment','payment_failed'].includes(order.status)&&!['test','unknown','captured','paid'].includes(order.paymentStatus))throw fail('Payment has not been verified.');
    if(next==='cancelled'&&['captured','paid','partially_refunded'].includes(order.paymentStatus))throw fail('Captured payment requires a verified refund.');
    return true;
}
module.exports={orderStates,paymentStates,assertTransition};
