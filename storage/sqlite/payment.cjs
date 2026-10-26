'use strict';
const {execute}=require('./execute.cjs');
module.exports=db=>Object.freeze({
    attempt:id=>execute(db,'SELECT * FROM payment_attempts WHERE id=?','get',[id]),
    attempts:orderId=>execute(db,'SELECT * FROM payment_attempts WHERE order_id=? ORDER BY created_at,id','all',[orderId]),
    captured:orderId=>execute(db,"SELECT * FROM payment_attempts WHERE order_id=? AND status='captured' ORDER BY created_at DESC LIMIT 1",'get',[orderId]),
    createAttempt:row=>execute(db,'INSERT INTO payment_attempts(id,order_id,provider,status,amount,currency,provider_reference,failure_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)','run',[row.id,row.orderId,row.provider,row.status,row.amount,row.currency,row.providerReference??null,row.failureCode??null,row.createdAt,row.updatedAt]),
    updateAttempt:(id,status,failureCode,at)=>execute(db,"UPDATE payment_attempts SET status=?,failure_code=?,updated_at=? WHERE id=? AND status='pending'",'run',[status,failureCode,at,id]),
    refundByKey:(orderId,key)=>execute(db,'SELECT * FROM payment_refunds WHERE order_id=? AND idempotency_key=?','get',[orderId,key]),
    refunds:orderId=>execute(db,'SELECT * FROM payment_refunds WHERE order_id=? ORDER BY created_at,id','all',[orderId]),
    refundedAmount:orderId=>execute(db,"SELECT coalesce(sum(amount),0) n FROM payment_refunds WHERE order_id=? AND status IN ('pending','completed')",'get',[orderId]).n,
    createRefund:row=>execute(db,'INSERT INTO payment_refunds(id,order_id,payment_id,idempotency_key,amount,reason_code,status,created_by,provider_reference,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)','run',[row.id,row.orderId,row.paymentId,row.key,row.amount,row.reasonCode,row.status,row.createdBy,row.providerReference??null,row.createdAt,row.updatedAt]),
    updateRefund:(id,status,providerReference,at)=>execute(db,"UPDATE payment_refunds SET status=?,provider_reference=?,updated_at=? WHERE id=? AND status='pending'",'run',[status,providerReference,at,id]),
    event:row=>execute(db,'INSERT OR IGNORE INTO payment_events(id,order_id,event_type,created_at,actor_type,actor_id,details) VALUES(?,?,?,?,?,?,?)','run',[row.id,row.orderId,row.type,row.createdAt,row.actorType,row.actorId,JSON.stringify(row.details||{})]),
    eventById:id=>execute(db,'SELECT id FROM payment_events WHERE id=?','get',[id]),
    events:orderId=>execute(db,'SELECT event_type AS type,created_at AS createdAt,actor_type AS actorType,details FROM payment_events WHERE order_id=? ORDER BY created_at,id','all',[orderId]),
    report:()=>({attempts:execute(db,'SELECT order_id,amount,status FROM payment_attempts','all',[]),refunds:execute(db,'SELECT order_id,amount,status FROM payment_refunds','all',[])})
});
