'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const base=process.argv[2]||'http://localhost:3000';
const scriptSources=new Map();
async function json(path){
    const response=await fetch(new URL(path,base));
    assert.equal(response.status,200,path);
    assert.match(response.headers.get('content-type'),/application\/json/);
    return response.json();
}
async function main(){
    const payload=await json('/api/products'),products=Array.isArray(payload)?payload:payload.products;
    // Reuse only public GET snapshots within this read-only run. Each product's
    // endpoint and each page/session still hit the server, while fresh/stale DOM
    // checks do not redownload the same catalog/settings hundreds of times.
    const publicReads=new Map();
    assert.ok(Array.isArray(products));
    assert.ok(products.length>=50,'Catalog must contain at least 50 products');
    const requiredCategories=['موس گیمینگ','کیبورد گیمینگ','هدست','مانیتور','دسته بازی','صندلی گیمینگ','میکروفون','تجهیزات استریم','قطعات کامپیوتر','لوازم جانبی گیمینگ'];
    for(const category of requiredCategories)assert.ok(products.some(product=>product.category===category),'Missing category: '+category);
    for(const product of products)for(const field of ['name','price','category','shortDescription','image'])assert.ok(product[field],`Product ${product.id} is missing ${field}`);
    for(const image of new Set(products.map(product=>product.image).filter(image=>image.startsWith('img/')))){
        const response=await fetch(new URL('/'+image,base));assert.equal(response.status,200,'Missing local product image: '+image);
    }
    const ids=new Set(products.map(p=>String(p.id)));
    assert.equal(ids.size,products.length,'Duplicate API IDs');
    async function page(file,search='',stale=false){
        const response=await fetch(new URL('/'+file+search,base));assert.equal(response.status,200);
        const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
        const dom=new JSDOM(await response.text(),{url:new URL('/'+file+search,base).href,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
        const w=dom.window;let cookie='';w.Headers=Headers;w.TextEncoder=TextEncoder;
        w.addEventListener('error',event=>errors.push(event.error?.stack||event.message));
        w.fetch=async(input,options={})=>{
            const url=new URL(typeof input==='string'?input:input.url,base),headers=new Headers(options.headers);
            headers.set('Origin',base);if(cookie)headers.set('Cookie',cookie);
            const cacheable=!cookie&&(options.method||'GET').toUpperCase()==='GET'&&url.origin===new URL(base).origin
                &&!url.search&&['/api/products','/api/site-settings'].includes(url.pathname);
            let pending=cacheable&&publicReads.get(url.href);
            if(!pending){pending=fetch(url,{...options,headers});if(cacheable)publicReads.set(url.href,pending);}
            let result;
            try{
                const response=await pending;
                if(cacheable&&!response.ok)publicReads.delete(url.href);
                result=cacheable?response.clone():response;
            }catch(error){if(cacheable)publicReads.delete(url.href);throw error;}
            const cookies=result.headers.getSetCookie();if(cookies.length)cookie=cookies.map(c=>c.split(';')[0]).join('; ');
            return result;
        };
        if(stale){
            const old=[{id:'1',name:'STALE PRODUCT',price:1,stock:1},{id:'obsolete-local-id',name:'OLD LOCAL PRODUCT',price:1,stock:1}];
            for(const key of ['gaming_store_products','gaming_store_products_fallback','products'])w.localStorage.setItem(key,JSON.stringify(old));
        }
        try{
            const tags=[...w.document.querySelectorAll('script[src]')].filter(tag=>! /^(https?:)?\/\//.test(tag.getAttribute('src')));
            for(const tag of tags){const src=tag.getAttribute('src');if(!scriptSources.has(src))scriptSources.set(src,await (await fetch(new URL(src,base))).text());}
            // Evaluate every actual local script synchronously in HTML order.
            for(const tag of tags){const src=tag.getAttribute('src');vm.runInContext(scriptSources.get(src),dom.getInternalVMContext(),{filename:src});}
            await vm.runInContext('initializeStore()',dom.getInternalVMContext());await w.Web2Site?.ready;
            assert.deepEqual(errors,[],file+search+' JavaScript errors');return dom;
        }catch(error){w.close();throw error;}
    }
    const home=await page('index.html','',true),results=[];
    const links=[...home.window.document.querySelectorAll('.product-card-link')].map(link=>link.getAttribute('href'));
    const gridCards=[...home.window.document.querySelectorAll('#productGrid .product-card')];
    assert.equal(gridCards.length,products.length,'Home product grid is incomplete');
    assert.equal(home.window.document.querySelectorAll('#productGrid .product-image').length,products.length,'A home card has no image');
    const fallbackProbe=home.window.document.querySelector('#productGrid .product-image');
    fallbackProbe.dispatchEvent(new home.window.Event('error'));
    assert.match(fallbackProbe.getAttribute('src'),/img\/product-placeholder\.svg$/,'Broken images do not switch to the placeholder');
    try{
        for(const href of links){const id=new URL(href,base).searchParams.get('id');assert.ok(ids.has(id),'Card has no backend product: '+id);assert.equal(href,'/product.html?id='+encodeURIComponent(id),'Invalid card link');}
        for(const product of products){
            const id=String(product.id),result={id,name:product.name,link:'/product.html?id='+encodeURIComponent(id),status:null,freshDetail:false,staleCacheDetail:false,reason:null};
            try{
                const response=await fetch(new URL('/api/products/'+encodeURIComponent(id),base));result.status=response.status;
                assert.equal(response.status,200,'Single-product endpoint');assert.match(response.headers.get('content-type'),/application\/json/);
                const single=await response.json();assert.equal(String(single.id),id);assert.equal(single.name,product.name);
                assert.ok(links.includes(result.link),'Missing home card');
                for(const stale of [false,true]){
                    const detail=await page('product.html','?id='+encodeURIComponent(id),stale);
                    try{
                        assert.equal(detail.window.document.querySelector('.detail-info h1')?.textContent,product.name,'Detail name mismatch');
                        assert.equal(detail.window.document.getElementById('productDetail').getAttribute('aria-busy'),'false');
                        assert.equal(detail.window.document.querySelector('.detail-info [data-add-to-cart]')?.dataset.addToCart,id,'Add-to-cart ID mismatch');
                        result[stale?'staleCacheDetail':'freshDetail']=true;
                    }finally{detail.window.close();}
                }
            }catch(error){result.reason=error.message;}
            results.push(result);
            console.log(`${id} -> ${result.status ?? 'ERROR'} | ${result.reason?'FAILED: '+product.name+' | '+result.reason:'Detail OK (fresh + stale cache)'} | ${result.link}`);
        }
    }finally{home.window.close();}
    const failures=results.filter(result=>result.reason);
    const report={base,products:products.length,cards:links.length,uniqueCardIds:new Set(links.map(href=>new URL(href,base).searchParams.get('id'))).size,successful:results.length-failures.length,failed:failures.length,browser:'jsdom (not a real browser)',links,results};
    const reportPath=path.join(__dirname,'../var/product-detail-verification.json');fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({products:report.products,cards:report.cards,uniqueCardIds:report.uniqueCardIds,successful:report.successful,failed:report.failed,report:reportPath}));
    if(failures.length)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
