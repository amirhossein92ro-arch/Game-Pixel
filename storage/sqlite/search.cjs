'use strict';
const {collectionPage}=require('./collections.cjs');
module.exports=store=>{const {db}=store;return Object.freeze({
products(query,{admin,q,category,stock,status,sort,view}) {
        const clauses=["json_extract(payload,'$.deletedAt') IS NULL"],args=[];
        if(!admin)clauses.push("json_extract(payload,'$.status')='active'");
        if(status){clauses.push("json_extract(payload,'$.status')=?");args.push(status);}
        if(category){clauses.push("json_extract(payload,'$.category')=?");args.push(category);}
        if(q){clauses.push("(instr(web2_lower(json_extract(payload,'$.id')),?)>0 OR instr(web2_lower(json_extract(payload,'$.name')),?)>0 OR instr(web2_lower(json_extract(payload,'$.brand')),?)>0 OR instr(web2_lower(json_extract(payload,'$.category')),?)>0 OR instr(web2_lower(json_extract(payload,'$.shortDescription')),?)>0)");args.push(q,q,q,q,q);}
        if(stock)clauses.push(stock==='low'?"json_extract(payload,'$.stock') BETWEEN 1 AND 5":stock==='out'?"json_extract(payload,'$.stock')<=0":"json_extract(payload,'$.stock')>0");
        const sorts={newest:"coalesce(json_extract(payload,'$.updatedAt'),json_extract(payload,'$.createdAt'),'') DESC,coalesce(json_extract(payload,'$.createdAt'),'') DESC,id",oldest:"coalesce(json_extract(payload,'$.updatedAt'),json_extract(payload,'$.createdAt'),'') ASC,coalesce(json_extract(payload,'$.createdAt'),'') ASC,id",stock_asc:"json_extract(payload,'$.stock'),id",stock_desc:"json_extract(payload,'$.stock') DESC,id",popular:"coalesce(json_extract(payload,'$.reviews'),0)+coalesce(json_extract(payload,'$.rating'),0)*40 DESC,id",price_asc:"round(json_extract(payload,'$.price')*(100-coalesce(json_extract(payload,'$.discount'),0))/100.0),id",price_desc:"round(json_extract(payload,'$.price')*(100-coalesce(json_extract(payload,'$.discount'),0))/100.0) DESC,id",rating:"json_extract(payload,'$.rating') DESC,id"};
        const summary=Object.keys(query).length&&view!=='full';
        const result=collectionPage(store,'products',query,{where:clauses.join(' AND '),args,order:Object.keys(query).length?(sorts[sort]||'rowid'):'rowid',nameSort:sort==='name',defaultSize:Object.keys(query).length?20:100,projection:summary?"json_remove(payload,'$.description','$.features','$.guarantee')":'payload'});

return result;
},
orders(query,{q,status,sort}) {
        const where=['1'],args=[];if(status){where.push("json_extract(payload,'$.status')=?");args.push(status);}
        if(q){where.push("("+['id','code','userName','userEmail','userPhone','recipientName'].map(k=>"instr(web2_lower(json_extract(payload,'$."+k+"')),?)>0").join(' OR ')+")");args.push(...Array(6).fill(q));}
        const orders={newest:"coalesce(json_extract(payload,'$.createdAt'),'') DESC,id DESC",oldest:"coalesce(json_extract(payload,'$.createdAt'),'') ASC,id DESC",total_asc:"json_extract(payload,'$.total'),id",total_desc:"json_extract(payload,'$.total') DESC,id DESC"};
        const paged=Object.keys(query).length;
        const result=collectionPage(store,'orders',query,{where:where.join(' AND '),args,order:paged?orders[sort]:'rowid',defaultSize:paged?20:100,projection:paged?"json_set(json_remove(payload,'$.recipientAddress','$.note','$.recipientPostalCode','$.items'),'$.itemCount',coalesce((SELECT sum(quantity) FROM order_items WHERE order_id=orders.id),0))":'payload'});

return result;
},
people({q,role,status,sort,page,pageSize,offset}) {
        const common=`WITH principals AS (
          SELECT a.id,coalesce(json_extract(a.payload,'$.name'),ad.username,'') name,coalesce(ad.username,'') username,a.email,a.phone,coalesce(ad.role,'user') role,
          CASE WHEN json_extract(a.payload,'$.banned') OR json_extract(u.payload,'$.banned') OR ad.active=0 THEN 1 ELSE 0 END banned,
          'customer' kind,coalesce(json_extract(a.payload,'$.joinDate'),ad.created_at) joinDate,
          max(coalesce(json_extract(a.payload,'$.lastLogin'),''),coalesce(ad.last_login,'')) lastLogin
          FROM accounts a LEFT JOIN admin_accounts ad ON ad.id=a.id LEFT JOIN users u ON u.id=a.id
          UNION ALL SELECT ad.id,ad.username,ad.username,coalesce(ad.email,''),'',ad.role,1-ad.active,'admin',ad.created_at,ad.last_login
          FROM admin_accounts ad WHERE NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=ad.id)
        ), filtered AS (SELECT * FROM principals WHERE (?='' OR instr(web2_lower(name),?)>0 OR instr(web2_lower(email),?)>0 OR instr(web2_lower(phone),?)>0 OR instr(web2_lower(username),?)>0) AND (?='' OR role=?) AND (?='' OR banned=?))`;
        const args=[q,q,q,q,q,role,role,status,status==='disabled'?1:0];
        const total=db.prepare(common+' SELECT count(*) n FROM filtered').get(...args).n;
        let rows;
        if(sort==='name'){
            const ids=db.prepare(common+' SELECT id,name FROM filtered').all(...args).sort((a,b)=>a.name.localeCompare(b.name,'fa')||a.id.localeCompare(b.id)).slice(offset,offset+pageSize).map(row=>row.id);
            const found=ids.length?db.prepare(common+' SELECT * FROM filtered WHERE id IN ('+ids.map(()=>'?').join(',')+')').all(...args,...ids):[];
            const byId=new Map(found.map(row=>[row.id,row]));rows=ids.map(id=>byId.get(id));
        }else rows=db.prepare(common+" SELECT * FROM filtered ORDER BY coalesce(joinDate,'') "+(sort==='oldest'?'ASC':'DESC')+",id LIMIT ? OFFSET ?").all(...args,pageSize,offset);
        const totals=rows.length?db.prepare("SELECT json_extract(payload,'$.userId') id,count(*) orderCount,coalesce(sum(CASE WHEN json_extract(payload,'$.paymentStatus')='paid' THEN json_extract(payload,'$.total') ELSE 0 END),0) totalSpent FROM orders WHERE json_extract(payload,'$.userId') IN ("+rows.map(()=>'?').join(',')+") GROUP BY json_extract(payload,'$.userId')").all(...rows.map(row=>row.id)):[];
        const byOwner=new Map(totals.map(row=>[row.id,row]));
        const items=rows.map(row=>({...row,banned:!!row.banned,status:row.banned?'disabled':'active',lastLogin:row.lastLogin||null,orderCount:byOwner.get(row.id)?.orderCount||0,totalSpent:byOwner.get(row.id)?.totalSpent||0}));

return {items,total};
},
admins({q,role,status,sort,pageSize,offset}) {
        const where='WHERE (instr(web2_lower(username),web2_lower(?))>0 OR instr(web2_lower(id),web2_lower(?))>0) AND (? = \'\' OR role=?) AND (? = \'\' OR active=?)',args=[q,q,role,role,status,status==='active'?1:0];
        const orderBy={newest:'created_at DESC,id DESC',oldest:'created_at ASC,id ASC',name:'username COLLATE NOCASE ASC,id ASC'}[sort];
        const rows=db.prepare(`SELECT * FROM admin_accounts ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...args,pageSize,offset);

        const total=db.prepare(`SELECT count(*) n FROM admin_accounts ${where}`).get(...args).n;
return {rows,total};
},
adminSessions({adminId,pageSize,offset,time}) {
        const where="WHERE s.kind='admin' AND s.expires>? AND (?='' OR s.principal=?)",args=[time,adminId,adminId];
        const items=db.prepare(`SELECT d.public_id AS id,s.principal AS adminId,a.username,d.created_at AS createdAt,d.last_activity_at AS lastActivity,d.device,d.ip,s.expires FROM sessions s JOIN admin_accounts a ON a.id=s.principal LEFT JOIN session_details d ON d.session_hash=s.hash ${where} ORDER BY s.rowid DESC LIMIT ? OFFSET ?`).all(...args,pageSize,offset);
        const total=db.prepare(`SELECT count(*) n FROM sessions s ${where}`).get(...args).n;
return {items,total};
},
audit({q,adminId,action,from,to,pageSize,offset}) {
        const where='WHERE instr(target_id,?)>0 AND (?=\'\' OR actor_id=?) AND (?=\'\' OR action=?) AND (?=\'\' OR created_at>=?) AND (?=\'\' OR created_at<?)';
        const args=[q,adminId,adminId,action,action,from,from,to,to?new Date(Date.parse(to+'T00:00:00Z')+86400000).toISOString():''];
        const rows=db.prepare(`SELECT id,actor_id AS adminId,actor_username AS admin,actor_role AS role,action,target_type AS targetType,target_id AS targetId,details,created_at AS createdAt FROM audit_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args,pageSize,offset).map(r=>({...r,details:require('./adapter.cjs').scrub(JSON.parse(r.details))}));
        const total=db.prepare(`SELECT count(*) n FROM audit_logs ${where}`).get(...args).n;return {rows,total};
},
global(type,q) {
const spec={product:['products',['id','name','brand'],'name','category'],order:['orders',['id','code','userName','userEmail','userPhone'],'code','userName'],user:['users',['id','name','email','phone'],'name','email']}[type];
if(!spec)throw Error('Unknown search domain');
const [table,fields,title,subtitle]=spec;
            const where=fields.map(key=>"instr(web2_lower(coalesce(json_extract(payload,'$."+key+"'),'')),?)>0").join(' OR ');
            const rows=db.prepare("SELECT id,json_extract(payload,'$."+title+"') title,json_extract(payload,'$."+subtitle+"') subtitle FROM "+table+" WHERE ("+where+") "+(table==='products'?"AND json_extract(payload,'$.deletedAt') IS NULL ":'')+"ORDER BY rowid LIMIT 8").all(...fields.map(()=>q));
return rows;
},
recipients(q,pageSize,offset) {const where="WHERE instr(web2_lower(email),?)>0 OR instr(web2_lower(json_extract(payload,'$.name')),?)>0";return {total:db.prepare('SELECT count(*) n FROM accounts '+where).get(q,q).n,items:db.prepare("SELECT id,email,json_extract(payload,'$.name') name FROM accounts "+where+" ORDER BY rowid DESC LIMIT ? OFFSET ?").all(q,q,pageSize,offset)};},
posts(query) {return collectionPage(store,'posts',query,{defaultSize:Object.keys(query).length?20:100,projection:"json_remove(payload,'$.content')"});},
ordersForUser(query,userId,{byDate=false,recent=false}={}) {return collectionPage(store,'orders',query,{where:"json_extract(payload,'$.userId')=?",args:[userId],defaultSize:Object.keys(query).length?20:100,order:recent?'rowid DESC':byDate&&Object.keys(query).length?"coalesce(json_extract(payload,'$.createdAt'),'') DESC,id DESC":'rowid'});}
});};
