'use strict';
function pageQuery(query = {}, defaultSize = 20) {
    const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? defaultSize);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw Object.assign(Error('صفحه نامعتبر است.'),{status:400});
    return {page,pageSize,offset:(page-1)*pageSize};
}
function respond(req,res,{items,total,page,pageSize}) {
    res.set('X-Total-Count',String(total));
    if (!Object.keys(req.query).length) {
        if (total > pageSize) res.set('Link',`<${req.baseUrl}${req.path}?page=2&pageSize=${pageSize}>; rel="next"`);
        return res.json(items);
    }
    return res.json({items,total,page,pageSize,pages:Math.ceil(total/pageSize)});
}
function collectionPage(store,table,query,options){return store.page(table,query,options);}
const orderSummary = order => ({itemCount:order.itemCount??(order.items||[]).reduce((n,item)=>n+Number(item.quantity||0),0),...Object.fromEntries(['id','code','userId','userName','userEmail','userPhone','recipientName','status','paymentStatus','paymentMethod','total','createdAt','updatedAt','revision'].filter(key=>Object.hasOwn(order,key)).map(key=>[key,order[key]]))});
module.exports={pageQuery,respond,collectionPage,orderSummary};
