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
        [new Response('<!DOCTYPE html><html></html>',{headers:{'Content-Type':'text/html'}}),/api-config/],
        [new Response('<!DOCTYPE html>',{status:404,headers:{'Content-Type':'text/html'}}),/api-config/],
        [new Response('{',{headers:{'Content-Type':'application/json'}}),/قابل پردازش/],
        [Response.json({error:'internal details'},{status:500}),/خطای سرور/],
        [Response.json({error:'ایمیل یا رمز عبور اشتباه است.'},{status:401}),/ایمیل یا رمز/]
    ]) {
        const api=session(async()=>response.clone());await api.ready;
        await assert.rejects(api.authenticate('login',{}),message);
        assert.equal(api.user,null);
    }
    const api=session(async()=>{throw new TypeError('Failed to fetch');});await api.ready;
    await assert.rejects(api.authenticate('register',{}),/ارتباط با API برقرار نشد/);
});
test('expired session logout clears local state, but server failure preserves it',async()=>{
    let status=500;
    const api=session(async url=>url.endsWith('/session')
        ? Response.json({user:{id:'test'},csrfToken:'csrf'})
        : Response.json({error:'خطا'},{status}));
    await api.ready;
    await assert.rejects(api.logout(),/خطای سرور/);assert.equal(api.user.id,'test');
    status=401;await api.logout();assert.equal(api.user,null);assert.equal(api.csrfToken,null);
});
