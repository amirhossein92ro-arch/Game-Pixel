'use strict';
const {strip} = require('./validate.cjs');
const id = v => v == null ? null : String(v);
const time = (row,key) => row[key]==null||row[key]===''?null:new Date(row[key]).toISOString();
const json = value => JSON.stringify(value);
const timestamps = row => ({created_at:time(row,'createdAt')??time(row,'joinDate'),updated_at:time(row,'updatedAt'),deleted_at:time(row,'deletedAt')});
const clean = row => strip(row,{nestedFields:0});
const definitions = Object.freeze({
    users:{table:'users',fields:row=>({id:id(row.id),email:row.email?row.email.trim().toLowerCase():null,email_normalized:row.email?row.email.trim().toLowerCase():null,phone:row.phone?.trim()||null,is_active:row.banned||row.deletedAt?0:1,...timestamps(row)}),omit:['addresses']},
    adminAccounts:{table:'admin_accounts',fields:(row,db)=>({id:id(row.id),user_id:id(row.userId??(db.prepare('SELECT 1 FROM users WHERE id=?').get(id(row.id))?row.id:null)),username:row.username,email_normalized:row.email?.trim().toLowerCase()||null,password_hash:row.passwordHash??db.prepare('SELECT password_hash FROM admin_accounts WHERE id=?').get(id(row.id))?.password_hash,role:row.role,is_active:row.active===false||row.deletedAt?0:1,totp_required:row.totpRequired?1:0,...timestamps(row)})},
    products:{table:'products',fields:row=>({id:id(row.id),name:row.name,category:row.category??null,price:row.price,stock:row.stock,status:row.status||'active',revision:row.revision??0,...timestamps(row)})},
    discounts:{table:'discounts',fields:row=>({id:id(row.id),code:row.code,type:row.type,value:row.value,is_active:row.active?1:0,uses:row.uses,max_uses:row.maxUses??null,revision:row.revision??0,...timestamps(row)})},
    orders:{table:'orders',fields:(row,db)=>({id:id(row.id),code:row.code??null,user_id:row.userId==null?null:row.userDeleted===true&&!db.prepare('SELECT 1 FROM users WHERE id=?').get(id(row.userId))?null:id(row.userId),source_user_id:id(row.userId),status:row.status||'pending',payment_status:row.paymentStatus||'unknown',payment_provider:row.paymentProvider??null,payment_reference:row.paymentReference??null,subtotal:row.subtotal??null,discount:row.discount??null,shipping_cost:row.shippingCost??null,total:row.total,revision:row.revision??0,created_at:time(row,'createdAt'),updated_at:time(row,'updatedAt')}),omit:['items']},
    notifications:{table:'notifications',fields:row=>({id:id(row.id),user_id:id(row.userId),type:row.type,title:row.title,message:row.message,resource_id:id(row.resourceId),created_at:time(row,'createdAt'),read_at:time(row,'readAt')})},
    auditLogs:{table:'audit_logs',fields:(row,db)=>({id:id(row.id),admin_id:row.actorId!=null&&db.prepare('SELECT 1 FROM admin_accounts WHERE id=?').get(id(row.actorId))?id(row.actorId):null,source_actor_id:id(row.actorId),actor_username:row.actorUsername??null,actor_role:row.actorRole??null,action:row.action,target_type:row.targetType??null,target_id:id(row.targetId),details:json(clean(row.details||{})),created_at:time(row,'createdAt')})},
    settings:{table:'settings',fields:row=>({id:id(row.id)})},
    messages:{table:'messages',fields:row=>({id:id(row.id)})},posts:{table:'posts',fields:row=>({id:id(row.id)})},comments:{table:'comments',fields:row=>({id:id(row.id)})},
    tickets:{table:'tickets',fields:row=>({id:id(row.id),user_id:id(row.userId),subject:row.subject,category:row.category,status:row.status,created_at:time(row,'createdAt'),updated_at:time(row,'updatedAt')})},
    ticketMessages:{table:'ticket_messages',fields:row=>({id:id(row.id),ticket_id:id(row.ticketId),author:row.author,message:row.message,created_at:time(row,'createdAt')})}
});
function rowValues(entity,raw,db) {
    const definition=definitions[entity],row=clean(raw),fields=definition.fields(raw,db);
    for(const key of definition.omit||[]){if(key==='addresses'&&Array.isArray(row[key]))row[key]=[];else delete row[key];}
    return {...fields,payload:json(row)};
}
function insert(db,table,fields) {
    // Both identifiers and column keys are generated exclusively by this module/schema.
    const columns=Object.keys(fields);
    return db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(fields));
}
function children(db,entity,row) {
    if(entity==='users') {
        const hash=row.passwordHash??row.password_hash;
        if(hash)insert(db,'user_credentials',{user_id:id(row.id),password_hash:hash});
        for(const address of row.addresses||[])insert(db,'user_addresses',{id:id(address.id),user_id:id(row.id),is_default:address.isDefault?1:0,payload:json(clean(address))});
    }
    if(entity==='orders') for(const [position,item]of (row.items||[]).entries()) {
        const product=id(item.id??item.product),price=item.price??item.unitPrice;
        insert(db,'order_items',{order_id:id(row.id),source_product_id:product,product_id:product,product_name:item.name,unit_price:price,quantity:item.quantity,line_total:price*item.quantity,position,payload:json(clean(item))});
    }
}
function decode(db,entity,record) {
    if(!record)return undefined;
    const row=JSON.parse(record.payload);
    if(entity==='users') {
        const addresses=db.prepare('SELECT payload FROM user_addresses WHERE user_id=? ORDER BY rowid').all(id(row.id)).map(r=>JSON.parse(r.payload));
        if(addresses.length || Object.hasOwn(row,'addresses'))row.addresses=addresses;
    }
    if(entity==='orders') row.items=db.prepare('SELECT payload FROM order_items WHERE order_id=? ORDER BY position').all(id(row.id)).map(r=>JSON.parse(r.payload));
    return row;
}
module.exports={definitions,rowValues,insert,children,decode};
