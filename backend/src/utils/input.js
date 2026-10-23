'use strict';
const guard = require('../../../lib/request-security.cjs');
const fail = message => Object.assign(new Error(message), {status:400});
function id(value) { if(typeof value!=='string'||!/^[a-f0-9]{24}$/i.test(value))throw fail('Invalid identifier.');return value; }
function text(value,min,max) {if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw fail('Invalid text input.');return value.trim();}
function integer(value,min,max) {if(!(typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)))throw fail('Invalid numeric input.');const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw fail('Invalid numeric input.');return n;}
function email(value) {const result=text(value,5,200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))throw fail('Invalid email.');return result;}
function image(value) {const result=text(value,0,500);if(result&&!/^https:\/\/[^\s<>"'\\]+$/.test(result)&&!/^\/img\/[\w/-]+\.(?:png|jpe?g|webp|gif|svg|avif)$/.test(result))throw fail('Invalid image URL.');if(result.split('/').includes('..'))throw fail('Invalid image URL.');return result;}
function product(body,existing={}) {
    guard.keys(body,['title','slug','description','price','discountPrice','category','platform','image','gallery','stock','isFeatured']);
    const result={};
    for(const key of ['title','slug','description','category','platform'])if(body[key]!==undefined)result[key]=text(body[key],key==='title'?2:0,{title:120,slug:80,description:5000,category:80,platform:80}[key]);
    for(const key of ['price','discountPrice','stock'])if(body[key]!==undefined)result[key]=integer(body[key],key==='price'?1:0,key==='stock'?1000000:1e12);
    if(body.image!==undefined)result.image=image(body.image);
    if(body.gallery!==undefined){if(!Array.isArray(body.gallery)||body.gallery.length>20)throw fail('Invalid gallery.');result.gallery=body.gallery.map(image);}
    if(body.isFeatured!==undefined){if(typeof body.isFeatured!=='boolean')throw fail('Invalid featured flag.');result.isFeatured=body.isFeatured;}
    if((result.discountPrice??existing.discountPrice??0)>(result.price??existing.price??0))throw fail('Invalid discount price.');
    return result;
}
function pagination(query,defaultLimit=12) {return {page:integer(query.page??1,1,100000),limit:integer(query.limit??defaultLimit,1,50)};}
const escapeRegex=value=>text(value,0,120).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function shipping(body) {
    guard.keys(body,['fullName','phone','address','city','postalCode']);
    const result={fullName:text(body.fullName,2,100),phone:text(body.phone,11,11),address:text(body.address,10,1000)};
    if(!/^09\d{9}$/.test(result.phone))throw fail('Invalid phone.');
    if(body.city!==undefined)result.city=text(body.city,2,60);
    if(body.postalCode!==undefined){result.postalCode=text(body.postalCode,10,10);if(!/^\d{10}$/.test(result.postalCode))throw fail('Invalid postal code.');}
    return result;
}
function mutation(req) {
    const p=guard.canonicalPath(req.path);
    const rules=[[/^\/api\/auth\/register$/,['name','email','password']],[/^\/api\/auth\/login$/,['email','password']],
      [/^\/api\/products(?:\/[^/]+)?$/,req.method==='DELETE'?[]:['title','slug','description','price','discountPrice','category','platform','image','gallery','stock','isFeatured']],
      [/^\/api\/cart$/,['productId','quantity']],[/^\/api\/cart\/[^/]+$/,req.method==='DELETE'?[]:['quantity']],
      [/^\/api\/orders$/,['shippingInfo']],[/^\/api\/admin\/orders\/[^/]+\/status$/,['status']],
      [/^\/api\/messages$/,['name','email','subject','message']],[/^\/api\/admin\/messages\/[^/]+\/read$/,[]],
      [/^\/api\/payments\/request$/,['orderId','amount']]];
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){const rule=rules.find(([re])=>re.test(p));if(rule)guard.keys(req.body||{},rule[1]);}
}
module.exports={id,text,integer,email,image,product,pagination,escapeRegex,shipping,mutation};
