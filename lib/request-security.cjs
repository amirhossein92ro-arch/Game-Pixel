'use strict';
const fail=(status,message)=>Object.assign(new Error(message),{status});
function shape(value,depth=0,budget={n:0}) {
 if(++budget.n>5000||depth>12)throw fail(400,'Request structure exceeds the allowed limits.');
 if(typeof value==='number'&&!Number.isFinite(value))throw fail(400,'Invalid number.');
 if(typeof value==='string'&&value.length>1048576)throw fail(400,'Input is too long.');
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)&&value.length>500)throw fail(400,'Too many input entries.');
 for(const key of Object.keys(value)){if(key.length>128||['__proto__','prototype','constructor'].includes(key)||key.startsWith('$'))throw fail(400,'Invalid input key.');shape(value[key],depth+1,budget);}
}
function keys(body,allowed){if(!body||typeof body!=='object'||Array.isArray(body))throw fail(400,'Expected a JSON object.');if(Object.keys(body).some(k=>!allowed.includes(k)))throw fail(400,'Unexpected input field.');}
function query(input){shape(input);if(Object.keys(input).length>30||Object.values(input).some(value=>typeof value!=='string'||value.length>200))throw fail(400,'Invalid query parameters.');}
function strings(body,limits){for(const [key,max]of Object.entries(limits))if(Object.hasOwn(body,key)&&(typeof body[key]!=='string'||body[key].length>max))throw fail(400,'Invalid text field.');}
function identifier(value){if(typeof value==='number'&&Number.isSafeInteger(value)&&value>0)return value;if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>200||/[\\/\u0000-\u001f\u007f]/.test(value))throw fail(400,'Invalid identifier.');return value;}
function canonicalPath(raw){
 let result;try{result=decodeURIComponent(raw);}catch{throw fail(400,'Invalid request path.');}
 if(/[\\\u0000-\u001f\u007f]/.test(result)||/%[0-9a-f]{2}/i.test(result)||result.split('/').some(part=>part==='.'||part==='..'||part.length>200))throw fail(400,'Invalid request path.');
 return result.toLowerCase().replace(/\/+$/,'');
}
function mutationFields(req){
 const p=canonicalPath(req.path);const b=req.body;
 const rules=[
 [/^\/api\/analytics\/event$/,['eventId','type','productId','resultsCount','category']],
 [/^\/api\/auth\/register$/,['name','email','phone','password','confirmPassword','captchaToken']],
 [/^\/api\/auth\/login$/,['email','password','name','phone','captchaToken']],
 [/^\/api\/auth\/2fa\/verify$/,['code']],
 [/^\/api\/admin\/login$/,['username','password','otp','captchaToken']],
 [/^\/api\/(?:auth|admin)\/logout$/,[]],
 [/^\/api\/auth\/forgot-password\/request$/,['phone','captchaToken']],
 [/^\/api\/auth\/forgot-password\/verify$/,['challengeId','otp','captchaToken']],
 [/^\/api\/auth\/forgot-password\/reset$/,['challengeId','resetToken','password','confirmPassword','captchaToken']],
 [/^\/api\/users\/me$/,['name','firstName','lastName','displayName','avatar','email','phone','currentPassword','addresses']],
 [/^\/api\/users\/me\/password$/,['currentPassword','newPassword','confirmPassword']],
 [/^\/api\/users\/me\/2fa\/(?:setup|disable|confirm|recovery-codes)$/,['currentPassword','code']],
 [/^\/api\/users\/me\/sessions(?:\/[^/]+)?$/,[]],
 [/^\/api\/checkout(?:\/quote)?$/,['items','discountCode',...(['recipientName','recipientLastName','recipientPhone','recipientAddress','recipientProvince','recipientCity','recipientPostalCode','shippingMethod','note','isAgreed'])]],
 [/^\/api\/admin\/products\/bulk$/,['ids','action','category','confirm','confirmationPhrase','revisions']],
 [/^\/api\/(?:admin\/)?products(?:\/[^/]+)?$/,req.method==='DELETE'?['confirm','confirmationPhrase','revision']:['id','name','title','price','discount','stock','rating','reviews','brand','icon','accent','tag','shortDescription','description','features','guarantee','category','image','status','featured','isNew','bestSeller','revision']],
 [/^\/api\/admin\/orders\/[^/]+$/,['status','note','revision']],
 [/^\/api\/admin\/admins$/,['username','email','password','role']],
 [/^\/api\/admin\/admins\/[^/]+$/,['role','active','confirm','adminConfirm']],
 [/^\/api\/admin\/discounts(?:\/[^/]+)?$/,req.method==='DELETE'?['confirm','revision']:['code','type','value','active','maxUses','perUserLimit','maxDiscount','startsAt','minPurchase','expiresAt','revision']],
 [/^\/api\/admin\/posts(?:\/[^/]+)?$/,req.method==='DELETE'?[]:['id','title','slug','content','excerpt','category','tags','author','image','status','views','commentStatus','createdAt']],
 [/^\/api\/admin\/comments(?:\/[^/]+)?$/,req.method==='DELETE'?[]:['id','content','postId','author','email','status','createdAt','parentId']],
 [/^\/api\/users\/me\/addresses(?:\/[^/]+)?$/,req.method==='DELETE'?[]:['id','title','name','phone','province','city','address','postalCode','isDefault']],
 [/^\/api\/users\/me\/(?:wishlist\/[^/]+|notifications(?:\/[^/]+)?\/read)$/,[]],
 [/^\/api\/tickets$/,['subject','category','message']],
 [/^\/api\/tickets\/[^/]+\/messages$/,['message']],
 [/^\/api\/admin\/tickets\/[^/]+$/,['status','message']],
 [/^\/api\/admin\/notifications$/,['userId','title','message']],
 [/^\/api\/contact$/,['name','email','subject','message']]
 ];
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
 const rule=rules.find(([re])=>re.test(p));if(rule)keys(b,[...rule[1],'captchaToken']);
 if(p==='/api/auth/login'||p==='/api/auth/register')strings(b,{name:100,email:200,phone:20,password:72,confirmPassword:72,captchaToken:2048});
 if(p==='/api/admin/login')strings(b,{username:200,password:72,otp:6,captchaToken:2048});
 if(p==='/api/auth/2fa/verify'||p.startsWith('/api/users/me/2fa/'))strings(b,{currentPassword:72,code:23});
 if(p.startsWith('/api/auth/forgot-password/'))strings(b,{phone:20,challengeId:36,otp:6,resetToken:64,password:72,confirmPassword:72,captchaToken:2048});
 if(p==='/api/checkout'||p==='/api/checkout/quote')strings(b,{discountCode:50,recipientName:50,recipientLastName:50,recipientPhone:20,recipientAddress:1000,recipientProvince:60,recipientCity:60,recipientPostalCode:10,shippingMethod:20,note:1000});
 if(p==='/api/contact')strings(b,{name:100,email:200,subject:200,message:3000});
 if(/^\/api\/admin\/orders\/[^/]+$/.test(p))strings(b,{status:20,note:1000});
 if(!p.startsWith('/api/admin/')&&Object.keys(b||{}).some(k=>['role','isAdmin','passwordHash','password_hash','sessionVersion','banned','ownerId','userId','paymentStatus','total','subtotal','shippingCost','internalFlags'].includes(k)))throw fail(400,'Protected fields cannot be submitted.');
 if(Array.isArray(b?.addresses))for(const address of b.addresses)keys(address,['id','title','name','phone','province','city','address','postalCode','isDefault']);
 if(p==='/api/admin/settings'){const settings=require('./site.cjs').defaults;keys(b,[...Object.keys(settings),'confirm','revision']);for(const name of ['social','announcement','homeBanner'])if(b[name]!==undefined)keys(b[name],Object.keys(settings[name]));}
 if(Array.isArray(b?.items))for(const item of b.items){keys(item,['id','quantity']);identifier(item.id);}
 if(Array.isArray(b?.ids))for(const id of b.ids)identifier(id);
 }
}
function limiter({limit,windowMs=60000,maxEntries=10000}){
 const entries=new Map();let nextSweep=0;
 return key=>{const now=Date.now();
  // A saturated map used to scan all 10,000 keys for every incoming request.
  if(now>=nextSweep){for(const [id,v]of entries)if(v.until<=now)entries.delete(id);nextSweep=now+1000;}
  if(entries.size>=maxEntries&&!entries.has(key))throw Object.assign(fail(429,'Too many requests.'),{retryAfter:Math.ceil(windowMs/1000)});
  let v=entries.get(key);if(!v||v.until<=now)v={n:0,until:now+windowMs};entries.set(key,v);
  if(++v.n>limit){const e=fail(429,'Too many requests.');e.retryAfter=Math.max(1,Math.ceil((v.until-now)/1000));throw e;}
 };
}

function password(value){if(typeof value!=='string'||value.trim().length<12||Buffer.byteLength(value)>72||/^(?:admin123|password|12345|qwerty|letmein|welcome)/i.test(value)||/^(.{1,6})\1+$/su.test(value)||/^[\p{N}\s]+$/u.test(value)||'abcdefghijklmnopqrstuvwxyz'.includes(value.toLowerCase())||'zyxwvutsrqponmlkjihgfedcba'.includes(value.toLowerCase()))throw fail(400,'Use a unique password of 12 or more characters (maximum 72 bytes).');return value;}
module.exports={shape,keys,query,canonicalPath,mutationFields,limiter,password,identifier};
