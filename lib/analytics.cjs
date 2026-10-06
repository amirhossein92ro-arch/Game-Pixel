'use strict';
const {can}=require('./admin-security.cjs');
function analytics(store,admin,days=30){
    const zone=process.env.STORE_TIMEZONE||'Asia/Tehran';
    const dateKey=value=>{const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');};
    const today=dateKey(Date.now()),midnight=new Date(today+'T00:00:00Z'),week=new Date(midnight);week.setUTCDate(week.getUTCDate()-(week.getUTCDay()+1)%7);
    const weekKey=week.toISOString().slice(0,10),monthKey=today.slice(0,7),products=store.list('products'),orders=store.list('orders'),users=store.list('users');
    const sales=orders.filter(o=>o.paymentStatus==='paid'&&!['cancelled','refunded'].includes(o.status)&&Number.isSafeInteger(o.total)&&o.total>=0);
    const sum=rows=>rows.reduce((s,o)=>s+o.total,0);
    const stats={};
    if(can(admin,'products.read'))Object.assign(stats,{products:products.length,inStock:products.filter(p=>p.status!=='inactive'&&p.stock>0).length,outOfStock:products.filter(p=>Number(p.stock)<=0).length,lowStock:products.filter(p=>p.stock>0&&p.stock<=5&&p.status!=='inactive').length});
    if(can(admin,'orders.read'))Object.assign(stats,{orders:orders.length,newOrders:orders.filter(o=>dateKey(o.createdAt)===today).length,pendingOrders:orders.filter(o=>o.status==='pending').length,processingOrders:orders.filter(o=>o.status==='processing').length,latestOrders:orders.slice(-5).reverse()});
    if(can(admin,'customers.read')||can(admin,'customers.limited'))Object.assign(stats,{users:users.length,activeUsers:users.filter(u=>!u.banned).length,newUsers:users.filter(u=>dateKey(u.joinDate)===today).length});
    if(can(admin,'tickets.read'))Object.assign(stats,{tickets:store.db.prepare('SELECT count(*) n FROM tickets').get().n,openTickets:store.db.prepare("SELECT count(*) n FROM tickets WHERE status='open'").get().n});
    if(can(admin,'discounts.read'))Object.assign(stats,{activeDiscounts:store.list('discounts').filter(d=>d.active&&(!d.startsAt||Date.parse(d.startsAt)<=Date.now())&&(!d.expiresAt||Date.parse(d.expiresAt)>Date.now())&&(d.maxUses==null||d.uses<d.maxUses)).length});
    if(can(admin,'analytics.read'))Object.assign(stats,{totalSalesToday:sum(sales.filter(o=>dateKey(o.createdAt)===today)),totalSalesWeek:sum(sales.filter(o=>dateKey(o.createdAt)>=weekKey&&dateKey(o.createdAt)<=today)),totalSalesMonth:sum(sales.filter(o=>dateKey(o.createdAt).startsWith(monthKey))),totalRevenue:sum(sales)});
    if(can(admin,'content.read'))Object.assign(stats,{posts:store.list('posts').length,comments:store.list('comments').length,pendingComments:store.list('comments').filter(c=>c.status==='pending').length,messages:store.list('messages').length});
    if(!can(admin,'analytics.read'))return {stats};
    const buckets=[];
    for(let i=days-1;i>=0;i--){const d=new Date(midnight);d.setUTCDate(d.getUTCDate()-i);const key=d.toISOString().slice(0,10);buckets.push({date:key,sales:sum(sales.filter(o=>dateKey(o.createdAt)===key)),orders:orders.filter(o=>dateKey(o.createdAt)===key).length,users:users.filter(u=>dateKey(u.joinDate)===key).length});}
    const top=new Map();for(const o of sales)for(const item of o.items||[]){const id=String(item.id),row=top.get(id)||{id,name:String(item.name||'محصول'),quantity:0,revenue:0};row.quantity+=Number(item.quantity)||0;row.revenue+=Number(item.lineTotal??item.price*item.quantity)||0;top.set(id,row);}
    return {stats,series:buckets,topProducts:[...top.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,5),timezone:zone,weekStartsOn:'Saturday',revenueBasis:'confirmed-paid-orders'};
}
module.exports={analytics};
