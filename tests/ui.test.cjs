const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {openDatabase}=require('../lib/database.cjs');
const {getPaymentProvider}=require('../lib/payment.cjs');
test('checkout UI steps validate the server quote and submit without card fields',async()=>{
    const storage=new Map(),events={},nodes=new Map(),requests=[];
    const node=()=>({value:'',hidden:false,innerHTML:'',textContent:'',dataset:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){},listeners:{},addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}});
    for(const id of ['checkoutForm','checkoutProgress','checkoutLoggedIn','checkoutLoginFields','checkoutAuthName','checkoutAuthEmail','checkoutAuthPhone','checkoutAuthPassword','customerName','customerPhone','customerAddress','checkoutLoginError','checkoutRecipientError','checkoutReviewError','checkoutPaymentError','paymentAmount','payButton','acceptDemo','checkoutContent','paymentSuccess'])nodes.set(id,node());
    const steps=[1,2,3,4,5].map(step=>({...node(),dataset:{checkoutStep:String(step)}}));
    const progress=[1,2,3,4,5].map(step=>({...node(),dataset:{checkoutJump:String(step)}}));
    nodes.get('checkoutForm').querySelectorAll=selector=>selector==='[data-checkout-step]'?steps:[];
    nodes.get('checkoutProgress').querySelectorAll=()=>progress;
    nodes.get('checkoutForm').dispatchEvent=()=>{};
    nodes.get('customerName').value='گیرنده تست';nodes.get('customerPhone').value='09120000000';nodes.get('customerAddress').value='نشانی آزمایشی سفارش برای تست';nodes.get('acceptDemo').checked=true;
    const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
    const user={id:'test-user-id',name:'تست',email:'test@example.invalid',phone:'09120000000',addresses:[]};
    const context=vm.createContext({console,crypto,localStorage,sessionStorage:localStorage,Web2:{user},document:{addEventListener(type,fn){events[type]=fn;},getElementById:id=>nodes.get(id)||null,querySelector:()=>null},window:{addEventListener(){},setTimeout(){},clearTimeout(){}},CustomEvent:class{constructor(type,data){this.type=type;this.detail=data.detail;}},fetch:async(url,options)=>{
        const payload=JSON.parse(options.body);requests.push({url,payload,headers:options.headers});
        if(url.endsWith('/quote'))return{ok:true,json:async()=>({total:200,subtotal:200,discount:0,shippingCost:0})};
        return{ok:true,json:async()=>({order:{id:'order-test',code:'W2-TEST',createdAt:new Date().toISOString(),total:200,items:[{id:1,name:'محصول تست',price:100,quantity:2}],paymentStatus:'test'}})};
    }});
    const run=code=>vm.runInContext(code,context);
    run(fs.readFileSync(path.join(__dirname,'../script.js'),'utf8'));
    run('Web2.request=async(url,options)=>{const response=await fetch(url,options);return response.json();};');
    run(`products=[{id:1,name:'محصول تست',price:100,stock:5}];escapeHTML=value=>String(value);showToast=()=>{};updateCartCount=renderCart=renderCheckout=renderInvoiceReview=()=>{};renderReceipt=()=>{};loadProductsFromApi=async()=>products;saveCart([{id:1,quantity:2}]);setupCheckoutSteps();setupCheckoutSteps();setupCheckoutForm();setupCheckoutForm();`);
    nodes.get('customerName').value='گیرنده تست';nodes.get('customerPhone').value='09120000000';nodes.get('customerAddress').value='نشانی آزمایشی سفارش برای تست';
    const form=nodes.get('checkoutForm');
    assert.equal(form.listeners.submit.length,1);assert.equal(form.listeners.click.length,1);
    const next=step=>form.listeners.click[0]({target:{closest:selector=>selector==='[data-checkout-next]'?{dataset:{checkoutNext:String(step)},disabled:false}:null}});
    await next(1);assert.equal(steps[1].hidden,false);
    await next(2);assert.equal(steps[2].hidden,false);
    await next(3);assert.equal(steps[3].hidden,false);assert.equal(requests[0].url,'/api/checkout/quote');
    await form.listeners.submit[0]({preventDefault(){}});
    const orderRequest=requests.find(r=>r.url==='/api/checkout');assert.ok(orderRequest.headers['Idempotency-Key']);
    for(const key of ['cardNumber','cvv','expiryDate'])assert.equal(key in orderRequest.payload,false);
    assert.equal(nodes.get('paymentSuccess').hidden,false);assert.equal(nodes.get('checkoutContent').hidden,true);
    assert.equal(run('getCart().length'),0);
});
test('database rolls back stock/order changes and scrubs legacy card/password data',()=>{
    const store=openDatabase(':memory:',path.join(__dirname,'../data.json'));
    try{
        const before=store.list('products');
        assert.throws(()=>store.transaction(()=>{store.replace('products',before.map(p=>({...p,stock:0})));throw Error('provider failed');}));
        assert.deepEqual(store.list('products'),before);
        store.transaction(()=>store.replace('users',[{id:'legacy',name:'test',password:'test-only',cardNumber:'test-only',cvv:'test-only',expiryDate:'test-only'}]));
        assert.deepEqual(store.list('users'),[{id:'legacy',name:'test'}]);
    }finally{store.close();}
});
test('unimplemented payment provider fails closed',()=>{
    const previous=process.env.PAYMENT_MODE;
    try{process.env.PAYMENT_MODE='live';assert.throws(()=>getPaymentProvider().createPayment({code:'TEST',total:100}),error=>error.status===503);}
    finally{if(previous===undefined)delete process.env.PAYMENT_MODE;else process.env.PAYMENT_MODE=previous;}
});
