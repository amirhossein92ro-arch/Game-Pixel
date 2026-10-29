'use strict';
const crypto=require('node:crypto');
const fail=(status,message,code)=>Object.assign(new Error(message),{status,code});
const reasons=new Set(['RESTOCK','MANUAL_CORRECTION','DAMAGED','RETURNED','ORDER_COMMIT','RESERVATION','RESERVATION_RELEASE']);
function createInventory(store,env=process.env){
    const access=store.access('inventory');
    const number=(name,fallback,min,max)=>{const raw=env[name];if(raw===undefined||raw==='')return fallback;const n=Number(raw);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(name+' must be an integer between '+min+' and '+max);return n;};
    const threshold=number('LOW_STOCK_THRESHOLD',5,0,1000000);
    const ttl=number('INVENTORY_RESERVATION_TTL_SECONDS',1800,60,86400)*1000;
    const now=()=>Date.now();
    function quantities(productId){const product=store.get('products',productId);if(!product)return null;const reserved=Number(access.activeQuantity(productId)),available=product.stock;return {productId:String(productId),onHand:available+reserved,reserved,available,threshold,status:product.status,revision:product.revision};}
    function record(productId,previous,newQuantity,reason,actorType,actorId,{note=null,orderId=null,reservationId=null}={}){
        if(!reasons.has(reason)||!Number.isSafeInteger(previous)||!Number.isSafeInteger(newQuantity)||newQuantity<0)throw fail(400,'Invalid inventory adjustment.');
        access.insertAdjustment({id:crypto.randomUUID(),productId:String(productId),previousOnHand:previous,newOnHand:newQuantity,delta:newQuantity-previous,reason,actorType,actorId:String(actorId),note,orderId,reservationId,createdAt:new Date().toISOString()});
    }
    function reserve(order){return store.transaction(()=>{
        const existing=access.byOrder(order.id).filter(row=>row.status==='ACTIVE');if(existing.length)return existing;
        const timestamp=now(),rows=[];
        for(const item of order.items){
            const before=quantities(item.id);
            if(!before||before.status!=='active'||before.available<item.quantity)throw fail(409,'Insufficient stock.','INSUFFICIENT_STOCK');
            const row={id:crypto.randomUUID(),productId:String(item.id),quantity:item.quantity,orderId:order.id,status:'ACTIVE',createdAt:timestamp,expiresAt:timestamp+ttl};
            store.mutate('products',item.id,p=>({...p,stock:p.stock-item.quantity,updatedAt:new Date().toISOString()}));
            access.insertReservation(row);
            record(item.id,before.onHand,before.onHand,'RESERVATION','system','checkout',{orderId:order.id,reservationId:row.id});rows.push(row);
        }
        return rows;
    });}
    function finish(order,status){return store.transaction(()=>{
        if(!['COMMITTED','RELEASED','EXPIRED'].includes(status))throw fail(400,'Invalid reservation status.');
        const rows=access.byOrder(order.id),timestamp=now();
        for(const row of rows){if(row.status!=='ACTIVE')continue;
            const before=quantities(row.product_id);
            if(status!=='COMMITTED'&&before){store.mutate('products',row.product_id,p=>({...p,stock:p.stock+row.quantity,updatedAt:new Date().toISOString()}));}
            if(access.transitionReservation(status,timestamp,row.id)!==1)throw fail(409,'Reservation changed concurrently.');
            if(before)record(row.product_id,before.onHand,status==='COMMITTED'?before.onHand-row.quantity:before.onHand,status==='COMMITTED'?'ORDER_COMMIT':'RESERVATION_RELEASE','system','payment',{orderId:order.id,reservationId:row.id});
        }
        return rows.some(row=>row.status==='ACTIVE');
    });}
    function adjust(productId,delta,reason,actor,{note=null,orderId=null,reservationId=null}={}){return store.transaction(()=>{
        if(!Number.isSafeInteger(delta)||Math.abs(delta)>1000000||!reasons.has(reason)||typeof note!=='string'&&note!==null||note?.length>500)throw fail(400,'Invalid inventory adjustment.');
        const before=quantities(productId);if(!before)throw fail(404,'Product not found.');
        if(before.onHand+delta<before.reserved||before.onHand+delta>1000000)throw fail(409,'Adjustment conflicts with reserved inventory.');
        const product=store.mutate('products',productId,p=>({...p,stock:p.stock+delta,updatedAt:new Date().toISOString()}));
        record(productId,before.onHand,before.onHand+delta,reason,'admin',actor.id,{note,orderId,reservationId});return {...quantities(productId),revision:product.revision};
    });}
    function restockOrder(orderId,items,key,actor,note=''){return store.transaction(()=>{
        if(typeof key!=='string'||!/^[A-Za-z0-9-]{16,100}$/.test(key)||!Array.isArray(items)||!items.length||items.length>100||typeof note!=='string'||note.length>500)throw fail(400,'Invalid return restock request.');
        const order=store.get('orders',orderId);if(!order)throw fail(404,'Order not found.');
        if(!['refunded','partially_refunded'].includes(order.paymentStatus))throw fail(409,'A completed refund is required before returned stock can be recorded.');
        const normalized=items.map(item=>({id:String(item?.id),quantity:item?.quantity}));
        if(new Set(normalized.map(item=>item.id)).size!==normalized.length||normalized.some(item=>!Number.isSafeInteger(item.quantity)||item.quantity<1||!order.items?.some(line=>String(line.id)===item.id)))throw fail(400,'Invalid returned items.');
        const requestHash=crypto.createHash('sha256').update(JSON.stringify({items:normalized.sort((a,b)=>a.id.localeCompare(b.id)),note})).digest('hex');
        const prior=access.returnByKey(orderId,key);
        if(prior){if(prior.request_hash!==requestHash)throw fail(409,'Return key was used for different items.');return {replayed:true,items:JSON.parse(prior.items)};}
        for(const item of normalized){
            const purchased=order.items.find(line=>String(line.id)===item.id).quantity;
            const rows=access.returnsByOrder(orderId);
            const already=rows.reduce((n,row)=>n+(JSON.parse(row.items).find(line=>line.id===item.id)?.quantity||0),0);
            if(already+item.quantity>purchased)throw fail(409,'Returned quantity exceeds purchased quantity.');
            if(!store.get('products',item.id))throw fail(409,'The original product no longer exists; manual reconciliation is required.');
        }
        for(const item of normalized)adjust(item.id,item.quantity,'RETURNED',actor,{note,orderId});
        access.insertReturn({id:crypto.randomUUID(),orderId,key,requestHash,items:normalized,actorId:actor.id,createdAt:new Date().toISOString()});
        return {replayed:false,items:normalized};
    });}
    function expireOrder(orderId){return store.transaction(()=>{
        const order=store.get('orders',orderId);if(!order)return false;
        const rows=access.byOrder(orderId).filter(row=>row.status==='ACTIVE');if(!rows.length||rows.every(row=>row.expires_at>now()))return false;
        if(access.hasCapturedAttempt(orderId)){finish(order,'COMMITTED');return false;}
        if(finish(order,'EXPIRED')){order.stockReserved=false;if(['pending','awaiting_payment'].includes(order.status)){order.status='payment_failed';order.paymentStatus='failed';}order.updatedAt=new Date().toISOString();store.put('orders',order);return true;}
        return false;
    });}
    function expire(limit=100){return store.transaction(()=>{
        const ids=access.expiredOrderIds(now(),limit);
        let count=0;for(const orderId of ids)if(expireOrder(orderId))count++;return count;
    });}
    function history(productId,page=1,pageSize=20){if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw fail(400,'Invalid page.');return access.history(productId,page,pageSize);}
    function catalog({page=1,pageSize=20,stock='',status='',sort='name'}={}){
        if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100||!['','low','out','available'].includes(stock)||!['','active','inactive','discontinued'].includes(status)||!['name','stock_asc','reserved_desc','adjusted_desc'].includes(sort))throw fail(400,'Invalid inventory filter.');
        const {rows,total}=access.catalog({page,pageSize,stock,status,sort,threshold});
        return {items:rows.map(row=>({...row,onHand:row.available+row.reserved,lowStock:row.available>0&&row.available<=threshold})),total,page,pageSize,pages:Math.ceil(total/pageSize),threshold};
    }
    function summary(){return {...access.summary(threshold),threshold};}
    function reconcile(){const issues=[];for(const product of store.list('products')){const q=quantities(product.id);if(!Number.isSafeInteger(q.available)||q.available<0)issues.push({productId:q.productId,code:'NEGATIVE_AVAILABLE'});if(q.reserved>q.onHand)issues.push({productId:q.productId,code:'RESERVED_EXCEEDS_ON_HAND'});}for(const row of access.activeReservations()){const order=store.get('orders',row.order_id);if(!order)issues.push({reservationId:row.id,code:'ORPHAN_RESERVATION'});else if(['paid','processing','shipped','delivered','cancelled','refunded'].includes(order.status))issues.push({reservationId:row.id,code:'TERMINAL_ORDER_ACTIVE_RESERVATION'});if(row.expires_at<=now())issues.push({reservationId:row.id,code:'EXPIRED_ACTIVE_RESERVATION'});}return {issues};}
    return {threshold,ttl,quantities,reserve,finish,adjust,restockOrder,expire,expireOrder,history,catalog,summary,reconcile,record,byOrder:orderId=>access.byOrder(orderId)};
}
module.exports={createInventory};
