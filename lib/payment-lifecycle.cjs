'use strict';
const crypto=require('node:crypto');
const {assertTransition}=require('./order-lifecycle.cjs');
const {getPaymentProvider}=require('./payment.cjs');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const at=()=>new Date().toISOString();
const safeKey=key=>typeof key==='string'&&/^[A-Za-z0-9-]{16,100}$/.test(key);
const reasons=new Set(['CUSTOMER_REQUEST','OUT_OF_STOCK','DUPLICATE_ORDER','PAYMENT_ERROR','ADMIN_CORRECTION','OTHER']);
function createPaymentLifecycle(store){
    const ledger=store.access('payment');
    const event=(order,type,actorType,actorId,details={},id=crypto.randomUUID())=>ledger.event({id,orderId:order.id,type,actorType,actorId,details,createdAt:at()});
    function releaseReservation(order){
        if(order.stockReserved===false)return;
        for(const item of order.items||[])if(store.get('products',item.id))store.mutate('products',item.id,p=>({...p,stock:p.stock+item.quantity,updatedAt:at()}));
        if(order.discountId&&store.get('discounts',order.discountId))store.mutate('discounts',order.discountId,d=>({...d,uses:Math.max(0,d.uses-1),updatedAt:at()}));
        order.stockReserved=false;
    }
    function reserveAgain(order){
        if(order.stockReserved!==false)return;
        for(const item of order.items||[])store.mutate('products',item.id,p=>{if(p.deletedAt||p.status!=='active'||p.stock<item.quantity)throw fail(409,'Stock is unavailable for payment retry.');return {...p,stock:p.stock-item.quantity,updatedAt:at()};});
        if(order.discountId)store.mutate('discounts',order.discountId,d=>{if(!d.active||d.maxUses!=null&&d.uses>=d.maxUses)throw fail(409,'Discount is unavailable for payment retry.');return {...d,uses:d.uses+1,updatedAt:at()};});
        order.stockReserved=true;
    }
    function start(order,providerPayment){
        const attempt={id:crypto.randomUUID(),orderId:order.id,provider:providerPayment.provider,status:'pending',amount:order.total,currency:'IRR',providerReference:providerPayment.reference,createdAt:at(),updatedAt:at()};
        ledger.createAttempt(attempt);event(order,'PAYMENT_STARTED','system','system',{attemptId:attempt.id});return attempt;
    }
    function verify({eventId,attemptId,scenario}){
        if(typeof eventId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(eventId))throw fail(400,'Invalid payment event.');
        return store.transaction(()=>{
            if(ledger.eventById(eventId))return {replayed:true};
            const attempt=ledger.attempt(attemptId);if(!attempt||attempt.provider!=='test')throw fail(404,'Payment attempt not found.');
            const order=store.get('orders',attempt.order_id);if(!order)throw fail(404,'Order not found.');
            const result=getPaymentProvider().verifyPayment(attempt,scenario);
            if(result.amount!==order.total||result.amount!==attempt.amount||result.currency!==attempt.currency||result.reference!==attempt.provider_reference)throw fail(409,'Payment verification mismatch.');
            if(attempt.status!=='pending'){event(order,'PAYMENT_CALLBACK_REPLAY','provider','test',{},eventId);return {order,replayed:true};}
            if(result.status==='pending'){event(order,'PAYMENT_VERIFICATION_PENDING','provider','test',{},eventId);return {order,pending:true};}
            if(order.status==='cancelled'){
                // A late capture is a discrepancy requiring manual reconciliation.
                if(result.status==='captured'){
                    ledger.updateAttempt(attempt.id,'captured',null,at());event(order,'LATE_PAYMENT_CAPTURED','provider','test',{},eventId);
                    return {order,discrepancy:true};
                }
                ledger.updateAttempt(attempt.id,'failed','PROVIDER_REJECTED',at());event(order,'PAYMENT_FAILED','provider','test',{},eventId);return {order};
            }
            if(result.status==='failed'){
                ledger.updateAttempt(attempt.id,'failed','PROVIDER_REJECTED',at());
                if(['pending','awaiting_payment','payment_failed'].includes(order.status))releaseReservation(order);
                order.paymentStatus='failed';if(order.status==='pending'||order.status==='awaiting_payment'){assertTransition(order,'payment_failed');order.status='payment_failed';}order.updatedAt=at();
                const saved=store.put('orders',order);event(saved,'PAYMENT_FAILED','provider','test',{attemptId:attempt.id},eventId);return {order:saved,failed:true,attemptId:attempt.id};
            }
            if(ledger.captured(order.id))throw fail(409,'Order already has a captured payment.');
            ledger.updateAttempt(attempt.id,'captured',null,at());order.paymentStatus='captured';
            if(['pending','awaiting_payment','payment_failed'].includes(order.status)){assertTransition(order,'paid');order.status='paid';}
            order.updatedAt=at();
            const saved=store.put('orders',order);event(saved,'PAYMENT_VERIFIED','provider','test',{attemptId:attempt.id},eventId);return {order:saved,completed:true};
        });
    }
    function retry(orderId,userId){
        return store.transaction(()=>{
            const order=store.get('orders',orderId);if(!order||order.userId!==userId)throw fail(404,'Order not found.');
            if(!['pending','payment_failed','awaiting_payment'].includes(order.status)||ledger.captured(order.id))throw fail(409,'Payment cannot be retried.');
            const attempts=ledger.attempts(order.id);if(attempts.some(a=>a.status==='pending'))throw fail(409,'Payment verification is still pending.');
            if(attempts.length>=5)throw fail(429,'Payment retry limit reached.');
            reserveAgain(order);
            const payment=getPaymentProvider().createPayment({...order,code:order.code+'-RETRY-'+attempts.length});
            const attempt=start(order,payment);order.paymentStatus='pending';assertTransition(order,'awaiting_payment');order.status='awaiting_payment';order.updatedAt=at();
            store.put('orders',order);return {attemptId:attempt.id,status:'pending'};
        });
    }
    function cancel(orderId,actorType,actorId){
        return store.transaction(()=>{
            const order=store.get('orders',orderId);if(!order||actorType==='user'&&order.userId!==actorId)throw fail(404,'Order not found.');
            if(order.status==='cancelled')return {order,replayed:true};
            if(!['pending','awaiting_payment','payment_failed','processing'].includes(order.status)||['captured','paid','partially_refunded','refunded'].includes(order.paymentStatus))throw fail(409,'Order cannot be cancelled.');
            if(ledger.attempts(order.id).some(a=>a.status==='pending'&&a.provider!=='test'))throw fail(409,'Payment verification is pending.');
            assertTransition(order,'cancelled');releaseReservation(order);
            order.status='cancelled';if(order.paymentStatus==='pending')order.paymentStatus='cancelled';order.updatedAt=at();
            const saved=store.put('orders',order);event(saved,'ORDER_CANCELLED',actorType,actorId);return {order:saved};
        });
    }
    function refund(orderId,{key,amount,reasonCode,actorId}){
        if(!safeKey(key)||!Number.isSafeInteger(amount)||amount<1||!reasons.has(reasonCode))throw fail(400,'Invalid refund request.');
        return store.transaction(()=>{
            const order=store.get('orders',orderId);if(!order)throw fail(404,'Order not found.');
            const prior=ledger.refundByKey(orderId,key);if(prior){if(prior.amount!==amount||prior.reason_code!==reasonCode)throw fail(409,'Refund key has different details.');return {refund:prior,order,replayed:true};}
            const captured=ledger.captured(orderId);if(!captured||!['captured','partially_refunded'].includes(order.paymentStatus)&&order.status!=='cancelled')throw fail(409,'No captured payment is refundable.');
            const remaining=captured.amount-ledger.refundedAmount(orderId);
            if(amount>remaining)throw fail(409,'Refund exceeds the captured amount.');
            assertTransition(order,'refund_pending');
            const refund={id:crypto.randomUUID(),orderId,paymentId:captured.id,key,amount,reasonCode,status:'pending',createdBy:actorId,createdAt:at(),updatedAt:at()};
            ledger.createRefund(refund);event(order,'REFUND_REQUESTED','admin',actorId,{refundId:refund.id,amount,reasonCode});
            const result=getPaymentProvider().refundPayment(captured,amount,key);
            if(result.status!=='completed')throw fail(503,'Refund verification is pending.');
            ledger.updateRefund(refund.id,'completed',result.reference,at());
            const totalRefunded=ledger.refundedAmount(orderId);order.refundedAmount=totalRefunded;order.paymentStatus=totalRefunded===captured.amount?'refunded':'partially_refunded';
            const next=totalRefunded===captured.amount?'refunded':'partially_refunded';assertTransition({...order,status:'refund_pending'},next);order.status=next;order.updatedAt=at();
            const saved=store.put('orders',order);event(saved,'REFUND_COMPLETED','admin',actorId,{refundId:refund.id,amount});
            return {refund:{...refund,status:'completed',providerReference:result.reference},order:saved};
        });
    }
    function detail(order){const attempts=ledger.attempts(order.id),refunds=ledger.refunds(order.id),captured=ledger.captured(order.id);return {...order,refundedAmount:ledger.refundedAmount(order.id),remainingRefundable:captured?captured.amount-ledger.refundedAmount(order.id):0,paymentAttempts:attempts.map(a=>({id:a.id,status:a.status,amount:a.amount,currency:a.currency,provider:a.provider,reference:a.provider_reference,createdAt:a.created_at})),refunds:refunds.map(r=>({id:r.id,amount:r.amount,status:r.status,reasonCode:r.reason_code,createdAt:r.created_at})),timeline:ledger.events(order.id).map(e=>({...e,details:JSON.parse(e.details)}))};}
    function reconcile(){
        const orders=store.list('orders'),issues=[];
        for(const order of orders){
            const captured=ledger.captured(order.id),refunded=ledger.refundedAmount(order.id);
            if(captured&&!['captured','partially_refunded','refunded'].includes(order.paymentStatus)||captured&&['pending','awaiting_payment','payment_failed','cancelled'].includes(order.status))issues.push({orderId:order.id,code:'CAPTURED_UNPAID_ORDER'});
            if(captured&&captured.amount!==order.total)issues.push({orderId:order.id,code:'CAPTURE_AMOUNT_MISMATCH'});
            if(refunded!==(order.refundedAmount||0))issues.push({orderId:order.id,code:'REFUND_TOTAL_MISMATCH'});
            if(refunded>0&&!captured||captured&&refunded>captured.amount)issues.push({orderId:order.id,code:'REFUND_WITHOUT_VALID_CAPTURE'});
            if(order.status==='refunded'&&order.paymentStatus!=='refunded'||order.paymentStatus==='refunded'&&captured&&refunded!==captured.amount||!captured&&['captured','partially_refunded','refunded'].includes(order.paymentStatus))issues.push({orderId:order.id,code:'ORDER_PAYMENT_STATE_MISMATCH'});
            if(['processing','shipped','delivered'].includes(order.status)&&order.paymentStatus==='failed')issues.push({orderId:order.id,code:'FAILED_PAYMENT_FULFILLMENT'});
        }
        return {checked:orders.length,issues};
    }
    return {start,verify,retry,cancel,refund,detail,reconcile};
}
module.exports={createPaymentLifecycle};
