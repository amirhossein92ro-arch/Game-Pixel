'use strict';

async function main() {
    const page = await fetch('http://127.0.0.1:9222/json/new?http://127.0.0.1:3000/', {method:'PUT'}).then(r=>r.json());
    const ws = new WebSocket(page.webSocketDebuggerUrl); let id=0; const pending=new Map(), errors=[];
    ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
    await Promise.all([send('Runtime.enable'),send('Page.enable')]);await send('Page.navigate',{url:'http://127.0.0.1:3000/'});await new Promise(r=>setTimeout(r,4000));
    const expression=`(()=>{const card=document.querySelector('#productGrid .product-card'),section=document.querySelector('#products'),grid=document.querySelector('#productGrid');const info=e=>{if(!e)return null;const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,class:e.className,display:s.display,visibility:s.visibility,opacity:s.opacity,color:s.color,background:s.backgroundColor,transform:s.transform,pointerEvents:s.pointerEvents,zIndex:s.zIndex,filter:s.filter,mixBlendMode:s.mixBlendMode,overflow:s.overflow,height:r.height,width:r.width,top:r.top,left:r.left};};const parents=[];for(let e=card;e;e=e.parentElement)parents.push(info(e));return {scrollY,viewport:{width:innerWidth,height:innerHeight},card:info(card),grid:info(grid),section:info(section),parents,overlays:[...document.querySelectorAll('.web2-intro,.page-transition-overlay,.auth-modal')].map(info)};})()`;
    const before=(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
    await send('Runtime.evaluate',{expression:"document.documentElement.style.scrollBehavior='auto';document.querySelector('#products').scrollIntoView()"});await new Promise(r=>setTimeout(r,1000));
    const after=(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
    console.log(JSON.stringify({before,after,errors},null,2));await send('Page.close');ws.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
