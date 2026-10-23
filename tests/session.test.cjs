'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/session.js'),'utf8');
function session(fetch) {
    const context=vm.createContext({URL,Headers,Event,localStorage:{removeItem(){}},fetch,
        location:{href:'http://localhost:5000/profile.html',origin:'http://localhost:5000'},
        addEventListener(){},dispatchEvent(){}});
    context.window=context;
    vm.runInContext(source,context);
    return context.Web2;
}
test('HTML, invalid JSON, server failures and offline API have Persian errors',async()=>{
    for(const [response,message] of [
        [new Response('<!DOCTYPE html><html></html>',{headers:{'Content-Type':'text/html'}}),/پاسخ معتبری/],
        [new Response('<!DOCTYPE html>',{status:404,headers:{'Content-Type':'text/html'}}),/پاسخ معتبری/],
        [new Response('{',{headers:{'Content-Type':'application/json'}}),/قابل پردازش/],
        [Response.json({error:'internal details'},{status:500}),/سرویس موقتاً/],
        [Response.json({error:'ایمیل یا رمز عبور اشتباه است.'},{status:401}),/نشست شما پایان/]
    ]) {
        const api=session(async()=>response.clone());await api.ready;
        await assert.rejects(api.authenticate('login',{}),message);
        assert.equal(api.user,null);
    }
    const api=session(async()=>{throw new TypeError('Failed to fetch');});await api.ready;
    await assert.rejects(api.authenticate('register',{}),/ارتباط برقرار نشد/);
});
test('expired session logout clears local state, but server failure preserves it',async()=>{
    let status=500;
    const api=session(async url=>url.endsWith('/session')
        ? Response.json({user:{id:'test'},csrfToken:'csrf'})
        : Response.json({error:'خطا'},{status}));
    await api.ready;
    await assert.rejects(api.logout(),/سرویس موقتاً/);assert.equal(api.user.id,'test');
    status=401;await api.logout();assert.equal(api.user,null);assert.equal(api.csrfToken,null);
});

test('a delayed session read cannot overwrite a successful login and its CSRF token',async()=>{
    let finishOldRead, reads=0;
    const api=session(async url=>{
        if(url.endsWith('/session')) {
            if(++reads===2)return new Promise(resolve=>{finishOldRead=resolve;});
            return Response.json({user:null,csrfToken:null});
        }
        return Response.json({user:{id:'signed-in'},csrfToken:'new-token'});
    });
    await api.ready;
    const oldRead=api.refresh();
    await api.authenticate('login',{});
    finishOldRead(Response.json({user:null,csrfToken:null}));
    await oldRead;
    assert.equal(api.user.id,'signed-in');
    assert.equal(api.csrfToken,'new-token');
});
