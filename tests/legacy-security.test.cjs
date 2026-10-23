'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const input=require('../backend/src/utils/input');
test('archived input validation rejects Mongo operators, literal regex abuse and invalid commerce values',()=>{
    const guard=require('../lib/request-security.cjs');
    for(const query of [{category:{$ne:''}},{search:['one','two']},{'$where':'dangerous'}])assert.throws(()=>guard.query(query),error=>error.status===400);
    const malicious='(a+)+$';const pattern=new RegExp(input.escapeRegex(malicious));assert.equal(pattern.test('aaaa'),false);assert.equal(pattern.test(malicious),true);
    for(const value of [-1,0,1.5,NaN,Infinity,true,null,{},'1e5'])assert.throws(()=>input.integer(value,1,1000000));
    for(const product of [{title:'Safe',price:1,stock:1,$set:{price:0}},{title:'Safe',price:0},{title:'Safe',price:100,discountPrice:101},{title:'Safe',price:true},{title:'Safe',price:100,stock:1.5},{title:'Safe',price:100,image:'javascript:alert(1)'}])assert.throws(()=>input.product(product));
    assert.deepEqual(input.product({title:'Safe',price:'100',stock:2,discountPrice:50}),{title:'Safe',price:100,stock:2,discountPrice:50});
    assert.throws(()=>input.shipping({fullName:'Buyer',phone:'09121112222',address:'Complete street address',ownerId:'other'}));
    assert.throws(()=>input.mutation({path:'/api/orders',method:'POST',body:{shippingInfo:{},totalPrice:1}}));
    assert.throws(()=>input.id('0123456789abcdef01234567/../private'));
});
test('archived JWT uses server account versions and ignores token role claims',async t=>{
    const previous=process.env.JWT_SECRET;process.env.JWT_SECRET='test-only-signing-key-with-more-than-32-bytes';t.after(()=>{if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;});
    const jwt=require('../backend/node_modules/jsonwebtoken'),User=require('../backend/src/modules/users/user.model'),protect=require('../backend/src/middleware/auth.middleware'),sign=require('../backend/src/utils/generateToken');
    const original=User.findById;let user={_id:'0123456789abcdef01234567',role:'user',sessionVersion:2,banned:false};User.findById=()=>({select:async()=>user});t.after(()=>User.findById=original);
    const attempt=token=>new Promise((resolve,reject)=>{const res={status(code){this.code=code;return this;},json(data){resolve({status:this.code,data});}};protect({headers:{authorization:'Bearer '+token}},res,error=>error?reject(error):resolve({status:200}));});
    const forgedRole=jwt.sign({id:user._id,role:'SUPER_ADMIN',version:0},process.env.JWT_SECRET,{algorithm:'HS256',issuer:'web2-legacy',audience:'web2-legacy',expiresIn:'1h'});assert.equal((await attempt(forgedRole)).status,401);
    const token=sign(user),decoded=jwt.verify(token,process.env.JWT_SECRET);assert.equal(decoded.role,undefined);assert.equal(decoded.exp-decoded.iat,3600);assert.equal((await attempt(token)).status,200);
    user={...user,banned:true};assert.equal((await attempt(token)).status,401);
    user={...user,banned:false,sessionVersion:3};assert.equal((await attempt(token)).status,401);
});
test('archived API rejects query injection and unsafe bodies before database work',async t=>{
    const previous={JWT_SECRET:process.env.JWT_SECRET,NODE_ENV:process.env.NODE_ENV,CLIENT_URL:process.env.CLIENT_URL};Object.assign(process.env,{JWT_SECRET:'test-only-signing-key-with-more-than-32-bytes',NODE_ENV:'test',CLIENT_URL:'http://localhost:5173'});
    const app=require('../backend/src/app');const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;});
    const base='http://127.0.0.1:'+server.address().port;
    for(const route of ['/api/products?category[$ne]=x','/api/products?search[$regex]=.*','/api/products?page[]=1'])assert.equal((await fetch(base+route)).status,400);
    assert.equal((await fetch(base+'/api/admin/orders')).status,401);
    const malformed=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'});assert.equal(malformed.status,400);assert.equal((await malformed.json()).message,'Invalid JSON body.');
    const protectedField=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Buyer',email:'buyer@example.invalid',password:'Unique passphrase 2026!',role:'admin'})});assert.equal(protectedField.status,400);
    assert.equal((await fetch(base+'/api/health',{headers:{Origin:'https://evil.invalid'}})).status,403);
});
