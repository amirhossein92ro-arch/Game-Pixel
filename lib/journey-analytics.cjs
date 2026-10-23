'use strict';
const crypto=require('node:crypto');
const operationalLog=require('./operational-log.cjs');
const CLIENT_TYPES=new Set(['page_view','product_view','search','filter_used','add_to_cart','remove_from_cart','cart_view','checkout_started','checkout_validation_failed']);
const FAILURE_CODES=new Set(['OUT_OF_STOCK','INVALID_QUANTITY','COUPON_INVALID','COUPON_EXPIRED','VALIDATION_ERROR','PAYMENT_FAILED','SESSION_EXPIRED','RATE_LIMITED','INTERNAL_ERROR']);
const fail=()=>Object.assign(new Error('Invalid analytics event.'),{status:400});
function config(env=process.env){
    const enabled=env.ANALYTICS_ENABLED!=='false';
    const days=Number(env.ANALYTICS_RETENTION_DAYS||90);
    if(!Number.isSafeInteger(days)||days<7||days>365)throw Error('ANALYTICS_RETENTION_DAYS must be 7-365.');
    return {enabled,days};
}
function createJourneyAnalytics(store,env=process.env){
    const settings=config(env),access=store.access('analytics');
    const warning=()=>operationalLog.write('analytics-write-failure',{level:'warn',category:'analytics'});
    const record=(event)=>{if(!settings.enabled)return false;try{return access.addEvent(event.id,event.type,new Date().toISOString(),event.productId||null,event.category||null,event.resultCount??null,event.failureCode||null).changes===1;}catch{warning();return false;}};
    function client(body){
        if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['eventId','type','productId','resultsCount','category'].includes(k)))throw fail();
        const {eventId,type,productId,resultsCount,category}=body;
        if(typeof eventId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(eventId)||!CLIENT_TYPES.has(type))throw fail();
        if(productId!==undefined&&(!['product_view','add_to_cart','remove_from_cart'].includes(type)||typeof productId!=='string'||productId.length>200))throw fail();
        if(resultsCount!==undefined&&(type!=='search'||!Number.isSafeInteger(resultsCount)||resultsCount<0||resultsCount>1000000))throw fail();
        if(category!==undefined&&(type!=='filter_used'||typeof category!=='string'||category.length>80))throw fail();
        if(type==='product_view'&&!productId||type==='search'&&resultsCount===undefined)throw fail();
        const product=productId&&store.get('products',productId);
        if(productId&&(!product||product.deletedAt||product.status!=='active'))throw fail();
        if(category&&!store.list('products').some(p=>p.category===category&&p.status==='active'&&!p.deletedAt))throw fail();
        return record({id:eventId,type,productId:product?.id,category:product?.category||category,resultCount:resultsCount,failureCode:type==='checkout_validation_failed'?'VALIDATION_ERROR':null});
    }
    function trusted(type,{orderId,failureCode}={}){
        if(type==='order_created'&&typeof orderId==='string')return record({id:'order-created:'+orderId,type});
        if(['login_success','registration_completed'].includes(type))return record({id:crypto.randomUUID(),type});
        if(type==='checkout_validation_failed'&&FAILURE_CODES.has(failureCode))return record({id:crypto.randomUUID(),type,failureCode});
        return false;
    }
    function cleanup(){if(!settings.enabled)return 0;try{return access.pruneEvents(new Date(Date.now()-settings.days*86400000).toISOString()).changes;}catch{warning();return 0;}}
    function report(start,end){
        const counts=Object.fromEntries(access.eventCounts(start,end).map(r=>[r.type,r.n]));
        const failures=access.failureCounts(start,end).map(r=>({code:r.failure_code||'VALIDATION_ERROR',count:r.n}));
        const products=new Map();for(const row of access.productCounts(start,end)){const item=products.get(row.product_id)||{id:row.product_id,views:0,cartAdds:0};if(row.type==='product_view')item.views=row.n;if(row.type==='add_to_cart')item.cartAdds=row.n;products.set(row.product_id,item);}
        const categories=new Map();for(const row of access.categoryCounts(start,end)){const item=categories.get(row.category)||{category:row.category,views:0,cartAdds:0};if(row.type==='product_view')item.views+=row.n;if(row.type==='add_to_cart')item.cartAdds+=row.n;categories.set(row.category,item);}
        const ratio=(a,b)=>b>=10?Math.round(a/b*1000)/10:null;
        return {period:{start,end},counts,zeroResultSearches:access.zeroSearches(start,end).n,
            funnel:{productViews:counts.product_view||0,cartAdds:counts.add_to_cart||0,cartViews:counts.cart_view||0,checkoutStarts:counts.checkout_started||0,ordersCreated:counts.order_created||0,
                productToCartPercent:ratio(counts.add_to_cart||0,counts.product_view||0),cartToCheckoutPercent:ratio(counts.checkout_started||0,counts.cart_view||0),checkoutToOrderPercent:ratio(counts.order_created||0,counts.checkout_started||0)},
            failures,products:[...products.values()].sort((a,b)=>b.views-a.views).slice(0,20),categories:[...categories.values()].sort((a,b)=>b.views-a.views).slice(0,20),
            storage:{eventCount:access.countEvents().n,retentionDays:settings.days}};
    }
    return {client,trusted,cleanup,report,enabled:settings.enabled};
}
module.exports={createJourneyAnalytics,config,FAILURE_CODES};
