'use strict';
// All inventory SQL stays behind the storage boundary. Inputs to dynamic clauses are
// enum values validated by the domain service; SQL identifiers come from fixed maps.
module.exports=db=>Object.freeze({
    activeQuantity:productId=>db.prepare("SELECT coalesce(sum(quantity),0) n FROM inventory_reservations WHERE product_id=? AND status='ACTIVE'").get(String(productId)).n,
    byOrder:orderId=>db.prepare('SELECT * FROM inventory_reservations WHERE order_id=? ORDER BY product_id').all(orderId),
    insertReservation:row=>db.prepare("INSERT INTO inventory_reservations(id,product_id,quantity,order_id,status,created_at,expires_at,updated_at) VALUES(?,?,?,?,'ACTIVE',?,?,?)").run(row.id,row.productId,row.quantity,row.orderId,row.createdAt,row.expiresAt,row.createdAt),
    transitionReservation:(status,at,id)=>db.prepare("UPDATE inventory_reservations SET status=?,updated_at=? WHERE id=? AND status='ACTIVE'").run(status,at,id).changes,
    insertAdjustment:row=>db.prepare('INSERT INTO inventory_adjustments(id,product_id,previous_on_hand,new_on_hand,delta,reason,actor_type,actor_id,note,order_id,reservation_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.productId,row.previousOnHand,row.newOnHand,row.delta,row.reason,row.actorType,row.actorId,row.note,row.orderId,row.reservationId,row.createdAt),
    returnByKey:(orderId,key)=>db.prepare('SELECT * FROM inventory_returns WHERE order_id=? AND idempotency_key=?').get(orderId,key),
    returnsByOrder:orderId=>db.prepare('SELECT items FROM inventory_returns WHERE order_id=?').all(orderId),
    insertReturn:row=>db.prepare('INSERT INTO inventory_returns(id,order_id,idempotency_key,request_hash,items,actor_id,created_at) VALUES(?,?,?,?,?,?,?)').run(row.id,row.orderId,row.key,row.requestHash,JSON.stringify(row.items),row.actorId,row.createdAt),
    hasCapturedAttempt:orderId=>!!db.prepare("SELECT 1 FROM payment_attempts WHERE order_id=? AND status='captured' LIMIT 1").get(orderId),
    expiredOrderIds:(at,limit)=>db.prepare("SELECT DISTINCT order_id FROM inventory_reservations WHERE status='ACTIVE' AND expires_at<=? ORDER BY expires_at LIMIT ?").all(at,limit).map(row=>row.order_id),
    history:(productId,page,pageSize)=>db.prepare('SELECT * FROM inventory_adjustments WHERE product_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').all(String(productId),pageSize,(page-1)*pageSize),
    activeReservations:()=>db.prepare("SELECT * FROM inventory_reservations WHERE status='ACTIVE'").all(),
    summary:threshold=>{const row=db.prepare(`SELECT count(*) total,sum(CASE WHEN json_extract(payload,'$.stock')=0 THEN 1 ELSE 0 END) outOfStock,sum(CASE WHEN json_extract(payload,'$.stock') BETWEEN 1 AND ? THEN 1 ELSE 0 END) lowStock FROM products WHERE json_extract(payload,'$.deletedAt') IS NULL`).get(threshold);return {...row,outOfStock:row.outOfStock||0,lowStock:row.lowStock||0,activeReservations:db.prepare("SELECT count(*) n FROM inventory_reservations WHERE status='ACTIVE'").get().n,expiredReservations:db.prepare("SELECT count(*) n FROM inventory_reservations WHERE status='EXPIRED'").get().n};},
    catalog:({page,pageSize,stock,status,sort,threshold})=>{
        const where=["json_extract(p.payload,'$.deletedAt') IS NULL"],args=[];
        if(stock){where.push(stock==='low'?"json_extract(p.payload,'$.stock') BETWEEN 1 AND ?":stock==='out'?"json_extract(p.payload,'$.stock')=0":"json_extract(p.payload,'$.stock')>0");if(stock==='low')args.push(threshold);}
        if(status)where.push(status==='discontinued'?"json_extract(p.payload,'$.discontinued')=1":status==='active'?"json_extract(p.payload,'$.status')='active' AND coalesce(json_extract(p.payload,'$.discontinued'),0)=0":"json_extract(p.payload,'$.status')='inactive' AND coalesce(json_extract(p.payload,'$.discontinued'),0)=0");
        const order={name:"web2_lower(json_extract(p.payload,'$.name')),p.id",stock_asc:"json_extract(p.payload,'$.stock'),p.id",reserved_desc:'reserved DESC,p.id',adjusted_desc:'last_adjusted DESC,p.id'}[sort];
        const from=`FROM products p LEFT JOIN (SELECT product_id,sum(quantity) reserved FROM inventory_reservations WHERE status='ACTIVE' GROUP BY product_id) r ON r.product_id=p.id LEFT JOIN (SELECT product_id,max(created_at) last_adjusted FROM inventory_adjustments GROUP BY product_id) a ON a.product_id=p.id WHERE ${where.join(' AND ')}`;
        const total=db.prepare(`SELECT count(*) n ${from}`).get(...args).n;
        const rows=db.prepare(`SELECT p.id,json_extract(p.payload,'$.name') name,json_extract(p.payload,'$.stock') available,CASE WHEN json_extract(p.payload,'$.discontinued')=1 THEN 'discontinued' ELSE json_extract(p.payload,'$.status') END status,coalesce(r.reserved,0) reserved,coalesce(a.last_adjusted,'') last_adjusted ${from} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize);
        return {rows,total};
    }
});
