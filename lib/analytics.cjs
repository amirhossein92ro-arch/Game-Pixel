'use strict';
const {can}=require('./admin-security.cjs');
const {orderSummary}=require('./listing.cjs');
function analytics(store,admin,days=30){
    const zone=process.env.STORE_TIMEZONE||'Asia/Tehran';
    const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}),dates=new Map();
    const dateKey=value=>{if(dates.has(value))return dates.get(value);const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const parts=formatter.formatToParts(d),key=['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');dates.set(value,key);return key;};
    const today=dateKey(Date.now()),midnight=new Date(today+'T00:00:00Z'),week=new Date(midnight);week.setUTCDate(week.getUTCDate()-(week.getUTCDay()+1)%7);
    const weekKey=week.toISOString().slice(0,10),monthKey=today.slice(0,7),revenue=can(admin,'analytics.read');
    const products=can(admin,'products.read')?store.list('products'):[],orders=can(admin,'orders.read')||revenue?store.list('orders'):[],users=can(admin,'customers.read')||can(admin,'customers.limited')||revenue?store.list('users'):[];
    const daily=new Map(),top=new Map(),totals={totalSalesToday:0,totalSalesWeek:0,totalSalesMonth:0,totalRevenue:0};
    const bucket=key=>{if(!daily.has(key))daily.set(key,{sales:0,orders:0,users:0});return daily.get(key);};
    let pendingOrders=0,processingOrders=0;
    for(const o of orders){
        const key=dateKey(o.createdAt);bucket(key).orders++;if(o.status==='pending')pendingOrders++;if(o.status==='processing')processingOrders++;
        if(revenue&&o.paymentStatus==='paid'&&!['cancelled','refunded'].includes(o.status)&&Number.isSafeInteger(o.total)&&o.total>=0){
            bucket(key).sales+=o.total;totals.totalRevenue+=o.total;
            if(key===today)totals.totalSalesToday+=o.total;if(key>=weekKey&&key<=today)totals.totalSalesWeek+=o.total;if(key.startsWith(monthKey))totals.totalSalesMonth+=o.total;
            for(const item of o.items||[]){const id=String(item.id),row=top.get(id)||{id,name:String(item.name||'محصول'),quantity:0,revenue:0};row.quantity+=Number(item.quantity)||0;row.revenue+=Number(item.lineTotal??item.price*item.quantity)||0;top.set(id,row);}
        }
    }
    for(const u of users)bucket(dateKey(u.joinDate)).users++;
    const stats={};
    if(can(admin,'products.read'))Object.assign(stats,{products:products.length,inStock:products.filter(p=>p.status!=='inactive'&&p.stock>0).length,outOfStock:products.filter(p=>Number(p.stock)<=0).length,lowStock:products.filter(p=>p.stock>0&&p.stock<=5&&p.status!=='inactive').length});
    if(can(admin,'orders.read'))Object.assign(stats,{orders:orders.length,newOrders:daily.get(today)?.orders||0,pendingOrders,processingOrders,latestOrders:orders.slice(-5).reverse().map(orderSummary)});
    if(can(admin,'customers.read')||can(admin,'customers.limited'))Object.assign(stats,{users:users.length,activeUsers:users.filter(u=>!u.banned).length,newUsers:daily.get(today)?.users||0});
    if(can(admin,'tickets.read'))Object.assign(stats,{tickets:store.access('analytics').countTickets().n,openTickets:store.access('analytics').countTicketsByStatus().n});
    if(can(admin,'discounts.read')){const now=Date.now();Object.assign(stats,{activeDiscounts:store.list('discounts').filter(d=>d.active&&(!d.startsAt||Date.parse(d.startsAt)<=now)&&(!d.expiresAt||Date.parse(d.expiresAt)>now)&&(d.maxUses==null||d.uses<d.maxUses)).length});}
    if(revenue)Object.assign(stats,totals);
    if(can(admin,'audit.view'))stats.failedAdminLogins=store.access('analytics').countAuditLogsByActionAndCreatedAt(new Date(Date.now()-86400000).toISOString()).n;
    if(can(admin,'content.read')){const comments=store.list('comments');Object.assign(stats,{posts:store.list('posts').length,comments:comments.length,pendingComments:comments.filter(c=>c.status==='pending').length,messages:store.list('messages').length});}
    if(!revenue)return {stats};
    const buckets=[];
    for(let i=days-1;i>=0;i--){const d=new Date(midnight);d.setUTCDate(d.getUTCDate()-i);const key=d.toISOString().slice(0,10);buckets.push({date:key,...(daily.get(key)||{sales:0,orders:0,users:0})});}
    return {stats,series:buckets,topProducts:[...top.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,5),timezone:zone,weekStartsOn:'Saturday',revenueBasis:'confirmed-paid-orders'};
}
module.exports={analytics};