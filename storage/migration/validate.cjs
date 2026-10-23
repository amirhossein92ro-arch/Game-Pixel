'use strict';
const validation = require('../../lib/storage-validation.cjs');
const statuses = require('../statuses.cjs');
const entities = Object.freeze(['users','adminAccounts','products','discounts','orders','notifications','auditLogs','settings','messages','posts','comments','tickets','ticketMessages','wishlist','idempotencyKeys']);
const hashPattern = /^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/;
const id = value => value == null ? '' : String(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function timestamp(value) {
    if(value==null)return true;
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return false;
    // Date.parse normalizes impossible days and 24:00 into another date. Check
    // the original calendar/time components before applying its timezone offset.
    const wallClock=value.slice(0,19);
    return new Date(wallClock+'Z').toISOString().slice(0,19)===wallClock;
}
const secret = key => /password|secret|apikey|apisecret|csrf|token|authorization|cookie|^otp|^smtp|^captcha|cardnumber|cvv/i.test(key.replace(/[_-]/g,''));
function strip(value, excluded) {
    if (Array.isArray(value)) return value.map(v => strip(v,excluded));
    if (!object(value)) return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => {if(secret(key)){excluded.nestedFields++;return false;}return true;}).map(([key,v])=>[key,strip(v,excluded)]));
}
function inspect(input) {
    const issues=[], warnings=[], excluded={topLevelKeys:0,nestedFields:0}, data={}, credentials=new Map();
    let issueCount=0,warningCount=0;
    const problem=(code,at,related)=>{issueCount++;if(issues.length<1000)issues.push({code,at,...(related?{related}:{})});};
    const warn=(code,at)=>{warningCount++;if(warnings.length<1000)warnings.push({code,at});};
    if (!object(input)) {problem('INVALID_ROOT','$');input={};}
    try{validation.jsonValue(input);}catch{problem('INVALID_JSON_VALUE','$');}
    if (input._format && input._format !== 'web2-portable/v1') problem('UNSUPPORTED_FORMAT','_format');
    for (const key of Object.keys(input)) if (!entities.includes(key) && !['_format','schemaVersion'].includes(key)) {
        if (secret(key) || ['admin','sessions','sessionDetails','pendingAuth','passwordResetChallenges','accountFactors','loginDevices','loginFailures','requestBudgets'].includes(key)) excluded.topLevelKeys++;
        else problem('UNSUPPORTED_COLLECTION','$'); // Never silently drop an unknown business entity.
    }
    for (const entity of entities) {
        const rows = input[entity] ?? [];
        if (!Array.isArray(rows)) {problem('EXPECTED_ARRAY',entity);data[entity]=[];continue;}
        data[entity]=[];
        const ids=new Map();
        rows.forEach((raw,index)=>{
            const at=`${entity}[${index}]`;
            if (!object(raw)) {problem('EXPECTED_RECORD',at);return;}
            if (!['wishlist','idempotencyKeys'].includes(entity)) {
                if (!['string','number'].includes(typeof raw.id) || !id(raw.id).trim() || id(raw.id).length>200) problem('INVALID_ID',at+'.id');
                if (ids.has(id(raw.id))) problem('DUPLICATE_ID',at+'.id',`${entity}[${ids.get(id(raw.id))}].id`);
                else ids.set(id(raw.id),index);
            }
            if (Object.keys(raw).some(key=>['password','plaintextpassword'].includes(key.replace(/[_-]/g,'').toLowerCase()))) problem('PLAINTEXT_PASSWORD',at);
            const hash = raw.passwordHash ?? raw.password_hash;
            if (hash !== undefined) {
                if (typeof hash!=='string' || !hashPattern.test(hash) || raw.passwordHash && raw.password_hash && raw.passwordHash !== raw.password_hash) problem('INVALID_PASSWORD_HASH',at+'.passwordHash');
                if (entity === 'users') credentials.set(id(raw.id),hash);
                else if (entity !== 'adminAccounts') problem('UNEXPECTED_PASSWORD_HASH',at);
            }
            // Exact credential bytes live in a dedicated table, never in public profile payloads.
            const clean=strip(raw,excluded);
            if (entity === 'adminAccounts' && hash !== undefined) clean.passwordHash=hash;
            if (['users','products','orders','discounts','messages','posts','comments'].includes(entity)) {
                try{validation.row(entity,clean);}catch{problem('INVALID_RECORD',at);}
            }
            for (const key of ['createdAt','updatedAt','deletedAt','joinDate','lastLogin','readAt','startsAt','expiresAt']) {
                if (entity!=='idempotencyKeys' && Object.hasOwn(clean,key)) {if(clean[key]==='')warn('LEGACY_EMPTY_TIMESTAMP',at+'.'+key);else if(!timestamp(clean[key]))problem('AMBIGUOUS_OR_INVALID_TIMESTAMP',at+'.'+key);}
            }
            data[entity].push(clean);
        });
    }
    function unique(entity,field,normalize=v=>String(v),nullable=true) {
        const seen=new Map();
        data[entity].forEach((row,index)=>{const value=row[field];if(nullable&&(value==null||value===''))return;const key=normalize(value);if(seen.has(key))problem('DUPLICATE_'+field.replace(/[^a-z]/gi,'').toUpperCase(),`${entity}[${index}].${field}`,`${entity}[${seen.get(key)}].${field}`);else seen.set(key,index);});
    }
    unique('users','email',v=>String(v).trim().toLowerCase());unique('users','phone',v=>String(v).trim());
    unique('adminAccounts','username');unique('adminAccounts','email',v=>String(v).trim().toLowerCase());
    unique('orders','code');unique('discounts','code',v=>String(v).trim().toUpperCase());
    const sets=Object.fromEntries(entities.map(entity=>[entity,new Set(data[entity].map(row=>id(row.id)))]));
    function reference(entity,index,field,target,{optional=false,deleted=false}={}) {
        const value=data[entity][index][field],at=`${entity}[${index}].${field}`;
        if ((value==null || value==='') && optional) return;
        if (!sets[target].has(id(value))) {if(deleted)warn('HISTORICAL_DELETED_REFERENCE',at);else problem('MISSING_REFERENCE',at);}
    }
    for (const [index,user] of data.users.entries()) {
        if(user.email!=null&&(typeof user.email!=='string'||!user.email.includes('@')))problem('INVALID_EMAIL',`users[${index}].email`);
        if(user.phone!=null&&(typeof user.phone!=='string'||!/^09\d{9}$/.test(user.phone)))problem('INVALID_PHONE',`users[${index}].phone`);
        if (!credentials.has(id(user.id))) warn('PROFILE_WITHOUT_LOGIN_CREDENTIAL',`users[${index}]`);
        else if(!user.email||!user.phone)problem('CREDENTIAL_IDENTITY_REQUIRED',`users[${index}]`);
        const addressIds=new Set();let defaults=0;
        for(const [position,address] of (Array.isArray(user.addresses)?user.addresses:[]).entries()){
            if(!object(address)||!id(address.id)||addressIds.has(id(address.id)))problem('INVALID_ADDRESS_ID',`users[${index}].addresses[${position}]`);
            addressIds.add(id(address?.id));if(address?.isDefault)defaults++;
        }
        if(defaults>1)problem('MULTIPLE_DEFAULT_ADDRESSES',`users[${index}].addresses`);
    }
    for (const [index,admin] of data.adminAccounts.entries()) {
        if(!statuses.adminRole.includes(admin.role)||typeof admin.username!=='string'||!admin.username.trim()||(typeof admin.passwordHash!=='string'||!hashPattern.test(admin.passwordHash)))problem('INVALID_ADMIN',`adminAccounts[${index}]`);
        if(admin.email!=null&&admin.email!==''&&(typeof admin.email!=='string'||!admin.email.includes('@')))problem('INVALID_EMAIL',`adminAccounts[${index}].email`);
        if(admin.totpRequired)warn('ADMIN_2FA_REQUIRES_EXTERNAL_CONFIGURATION',`adminAccounts[${index}]`);
        if(admin.active!==undefined&&typeof admin.active!=='boolean'||admin.totpRequired!==undefined&&typeof admin.totpRequired!=='boolean')problem('INVALID_ADMIN_FLAGS',`adminAccounts[${index}]`);
        reference('adminAccounts',index,'userId','users',{optional:true});
    }
    const paymentReferences=new Map();
    for(const [index,order] of data.orders.entries()) {
        reference('orders',index,'userId','users',{optional:true,deleted:order.userDeleted===true});
        if(order.userId==null)warn('LEGACY_ANONYMOUS_ORDER',`orders[${index}].userId`);
        if(!Number.isSafeInteger(order.total)||order.total<0)problem('INVALID_TOTAL',`orders[${index}].total`);
        if(order.paymentStatus!=null&&!statuses.payment.includes(order.paymentStatus))problem('INVALID_PAYMENT_STATUS',`orders[${index}].paymentStatus`);
        if(!['subtotal','discount','shippingCost'].every(k=>order[k]!=null))warn('LEGACY_INCOMPLETE_TOTAL_COMPONENTS',`orders[${index}]`);
        for(const [position,item] of (Array.isArray(order.items)?order.items:[]).entries()) {
            if(!object(item)){problem('INVALID_ORDER_ITEM',`orders[${index}].items[${position}]`);continue;}
            if(!sets.products.has(id(item.id??item.product)))problem('MISSING_REFERENCE',`orders[${index}].items[${position}].id`);
            if(typeof item.name!=='string'||!item.name.trim())problem('MISSING_PRODUCT_NAME_SNAPSHOT',`orders[${index}].items[${position}].name`);
        }
        if(order.discountId!=null&&!sets.discounts.has(id(order.discountId)))warn('HISTORICAL_COUPON_REFERENCE',`orders[${index}].discountId`);
        if(order.paymentReference!=null) {
            if(!order.paymentProvider)problem('PAYMENT_PROVIDER_REQUIRED',`orders[${index}].paymentProvider`);
            const key=JSON.stringify([order.paymentProvider,order.paymentReference]);if(paymentReferences.has(key))problem('DUPLICATE_PAYMENT_REFERENCE',`orders[${index}].paymentReference`,`orders[${paymentReferences.get(key)}].paymentReference`);else paymentReferences.set(key,index);
        }
    }
    for(const entity of ['notifications','tickets','wishlist','idempotencyKeys'])for(const [index]of data[entity].entries())reference(entity,index,'userId','users');
    for(const [index]of data.wishlist.entries())reference('wishlist',index,'productId','products');
    for(const [index]of data.ticketMessages.entries())reference('ticketMessages',index,'ticketId','tickets');
    for(const [index,ticket]of data.tickets.entries())if(!statuses.ticket.includes(ticket.status)||typeof ticket.subject!=='string'||typeof ticket.category!=='string')problem('INVALID_TICKET',`tickets[${index}]`);
    for(const [index,message]of data.ticketMessages.entries())if(!['user','admin'].includes(message.author)||typeof message.message!=='string')problem('INVALID_TICKET_MESSAGE',`ticketMessages[${index}]`);
    for(const [index,n]of data.notifications.entries())if(['type','title','message'].some(k=>typeof n[k]!=='string'))problem('INVALID_NOTIFICATION',`notifications[${index}]`);
    for(const [index,log]of data.auditLogs.entries())if(typeof log.action!=='string'||!object(log.details??{}))problem('INVALID_AUDIT',`auditLogs[${index}]`);
    const scopes=new Map();for(const [index,key]of data.idempotencyKeys.entries()){
        reference('idempotencyKeys',index,'orderId','orders');
        const owner=data.orders.find(order=>id(order.id)===id(key.orderId))?.userId;if(owner==null||id(owner)!==id(key.userId))problem('IDEMPOTENCY_OWNER_CONFLICT',`idempotencyKeys[${index}].userId`);
        const scope=JSON.stringify([id(key.userId),key.purpose,key.key]);if(scopes.has(scope))problem('DUPLICATE_IDEMPOTENCY_SCOPE',`idempotencyKeys[${index}]`,`idempotencyKeys[${scopes.get(scope)}]`);else scopes.set(scope,index);
        if(['purpose','key','requestHash'].some(k=>typeof key[k]!=='string'||!key[k])||!Number.isSafeInteger(key.createdAt)||!Number.isSafeInteger(key.expiresAt)||key.expiresAt<=key.createdAt)problem('INVALID_IDEMPOTENCY',`idempotencyKeys[${index}]`);
    }
    const wishes=new Set();for(const [index,row]of data.wishlist.entries()){const key=JSON.stringify([id(row.userId),id(row.productId)]);if(wishes.has(key))problem('DUPLICATE_WISHLIST',`wishlist[${index}]`);wishes.add(key);}
    for(const [index,setting]of data.settings.entries())if(setting.id!=='site-config'||!object(setting.value))problem('UNSUPPORTED_SETTING',`settings[${index}]`);
    const counts=Object.fromEntries(entities.map(entity=>[entity,data[entity].length]));
    counts.orderItems=data.orders.reduce((n,row)=>n+(Array.isArray(row.items)?row.items.length:0),0);counts.userCredentials=credentials.size;counts.userAddresses=data.users.reduce((n,row)=>n+(Array.isArray(row.addresses)?row.addresses.length:0),0);
    let total=0n;for(const order of data.orders)if(Number.isSafeInteger(order.total))total+=BigInt(order.total);
    return {data,credentials,report:{ok:issueCount===0,counts,orderTotal:total.toString(),issues,issueCount,warnings,warningCount,excluded}};
}
module.exports={inspect,entities,hashPattern,strip};
