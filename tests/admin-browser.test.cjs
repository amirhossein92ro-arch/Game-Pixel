'use strict';
// A disposable headless Chromium process tests actual layout without using a person's browser profile.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
const chrome=process.env.CHROME_TEST_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message){for(let i=0;i<200;i++){try{const result=await fn();if(result)return result;}catch{}await pause(75);}throw Error(message);}
test('storefront and admin retain readable contrast, reduced motion and usable desktop/mobile layouts in Chromium',{skip:!fs.existsSync(chrome)},async()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-admin-browser-')),profile=path.join(temp,'chrome'),port=31000+Math.floor(Math.random()*1000),base='http://localhost:'+port;
    let browser,server,ws,sequence=0,browserErrors='';const pending=new Map(),errors=[],resourceErrors=[],consoleErrors=[],requests=new Map();
    function command(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method+'; browser exit '+browser?.exitCode+'; '+browserErrors.slice(-1800)+(params.expression?': '+params.expression.slice(0,160):'')));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
    async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;}
    try {
        server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),APP_ORIGIN:base,DATABASE_PATH:path.join(temp,'test.sqlite'),ADMIN_PASSWORD:'Browser-test-password-2026!',NODE_ENV:'test',PAYMENT_MODE:'test'},stdio:['ignore','pipe','pipe'],windowsHide:true});
        let startup='';server.stdout.on('data',data=>startup+=data);await until(()=>startup.includes('Server is running'),'server startup');
        const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Browser-test-password-2026!'})});assert.equal(login.status,200);const cookie=login.headers.getSetCookie()[0].split(';')[0].split('=')[1];
        const signup=await fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'بازیکن تست نمایشگر',email:'browser-test@example.invalid',phone:'09121112233',password:'Browser-user-password-2026!'})});assert.equal(signup.status,201);
        browser=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1440,1000','about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
        browser.stderr.on('data',data=>browserErrors=(browserErrors+String(data)).slice(-4000));
        const active=path.join(profile,'DevToolsActivePort');const debugPort=await until(()=>{const value=fs.readFileSync(active,'utf8').split(/\r?\n/)[0];return /^\d+$/.test(value)?value:null;},'headless Chromium startup');
        const tabs=await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
        ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
        ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);if(p){clearTimeout(p.timer);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);
            else if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')consoleErrors.push({type:'console.error'});
            else if(msg.method==='Network.requestWillBeSent')requests.set(msg.params.requestId,msg.params.request.url);
            else if(msg.method==='Network.responseReceived'){
                const response=msg.params.response,url=new URL(response.url);
                if(url.origin===base&&response.status>=400&&!(url.pathname==='/api/admin/session'&&[401,403].includes(response.status)))resourceErrors.push({path:url.pathname,status:response.status});
            }else if(msg.method==='Network.loadingFailed'){
                const request=requests.get(msg.params.requestId);if(request&&!msg.params.canceled){const url=new URL(request);if(url.origin===base)resourceErrors.push({path:url.pathname,status:'network-failure'});}
                requests.delete(msg.params.requestId);
            }else if(msg.method==='Network.loadingFinished')requests.delete(msg.params.requestId);
        });
        await command('Runtime.enable');await command('Page.enable');await command('Network.enable');
        await command('Network.setBlockedURLs',{urls:['https://cdnjs.cloudflare.com/*','https://fonts.googleapis.com/*','https://fonts.gstatic.com/*']});
        await command('Network.setCookie',{name:'web2_admin',value:cookie,url:base,httpOnly:true,sameSite:'Strict',path:'/'});
        // Storefront checks use the same disposable server and real catalog.
        const catalog=await(await fetch(base+'/api/products')).json(),available=catalog.find(p=>p.stock>0);assert.ok(available);
        async function noOverflow(label){
            const original=await evaluate('({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth})');assert.ok(original.scroll<=original.width+1,label+' '+JSON.stringify(original));
            // Reuse the loaded page for small-phone/tablet layout checks. This
            // tests the real DOM without flooding the application's API budget.
            if(original.width===390){
                for(const width of [320,360,768]){await command('Emulation.setDeviceMetricsOverride',{width,height:original.height,deviceScaleFactor:1,mobile:width<600});const size=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert.ok(size.scroll<=size.width+1,label+' resized '+JSON.stringify(size));}
                await command('Emulation.setDeviceMetricsOverride',{width:original.width,height:original.height,deviceScaleFactor:1,mobile:true});
            }
        }
        function readable(styles,label){for(const s of styles)assert.ok(contrast(s.background,s.color)>=4.5,label+' '+JSON.stringify(s));}
        async function capture(name){const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.mkdirSync(path.join(root,'.runtime'),{recursive:true});fs.writeFileSync(path.join(root,'.runtime',name+'.png'),Buffer.from(shot.data,'base64'));}
        for(const width of [1440,390]){
            await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});await command('Page.navigate',{url:base+'/index.html'});
            await until(()=>evaluate("document.querySelectorAll('#productGrid .product-card').length>0 && !document.getElementById('web2Intro')"),'home catalog');await noOverflow('home '+width);
            await until(()=>evaluate("Array.from(document.querySelectorAll('#productGrid img')).filter(img=>{const r=img.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;}).every(img=>img.complete&&img.naturalWidth>0)"),'visible product images');
            assert.equal(await evaluate("Array.from(document.querySelectorAll('#productGrid img.product-image')).every(img=>img.alt.trim().length>0)"),true,'product image alternative text');
            for(const light of [false,true]){
                await evaluate('document.body.classList.toggle("light-theme",'+light+')');
                readable(await evaluate(`Array.from(document.querySelectorAll('#productGrid .product-card')).slice(0,3).flatMap(card=>{const background=getComputedStyle(card).backgroundColor;return Array.from(card.querySelectorAll('h3,.product-description,.product-brand')).map(el=>({background,color:getComputedStyle(el).color,name:el.className}));})`),'product text');
                readable(await evaluate(`['productSearch','categoryFilter','priceFilter','productSort'].map(id=>{const s=getComputedStyle(document.getElementById(id));return {background:s.backgroundColor,color:s.color,name:id};})`),'filter controls');await noOverflow('home theme '+width);
            }
            await evaluate('document.body.classList.remove("light-theme")');
            const decoration=await evaluate(`(() => {const card=document.querySelector('#productGrid .product-card');return {filter:getComputedStyle(card).backdropFilter,bodyImage:getComputedStyle(document.body).backgroundImage,animation:getComputedStyle(card).animationName};})()`);
            assert.equal(decoration.filter,'none');assert.equal(decoration.bodyImage,'none');assert.equal(decoration.animation,'none');
            await evaluate('document.getElementById("productSearch").value='+JSON.stringify(available.name)+';document.getElementById("productSearch").dispatchEvent(new Event("input",{bubbles:true}))');await until(()=>evaluate("document.querySelectorAll('#productGrid .product-card').length===1"),'search match');
            await evaluate('document.getElementById("clearProductFilters").click();document.getElementById("categoryFilter").value='+JSON.stringify(available.category)+';document.getElementById("categoryFilter").dispatchEvent(new Event("change",{bubbles:true}))');await until(()=>evaluate("document.querySelectorAll('#productGrid .product-card').length>0"),'category results');await evaluate('document.getElementById("clearProductFilters").click()');
            if(width<=860){
                assert.equal(await evaluate("getComputedStyle(document.querySelector('.mobile-shortcuts')).display"),'flex');
                await evaluate('document.getElementById("menuToggle").click()');assert.equal(await evaluate('document.getElementById("mainNav").classList.contains("open")'),true);await noOverflow('mobile menu');
                await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
                assert.equal(await evaluate('document.getElementById("mainNav").classList.contains("open")'),false);assert.equal(await evaluate('document.activeElement.id'),'menuToggle');
            }
            await command('DOM.enable');await command('CSS.enable');
            const doc=await command('DOM.getDocument'),cardNode=await command('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#productGrid .product-card'});
            await command('CSS.forcePseudoState',{nodeId:cardNode.nodeId,forcedPseudoClasses:['hover']});
            await until(()=>evaluate("getComputedStyle(document.querySelector('#productGrid .product-card')).transform!=='none'"),'card hover transform');await noOverflow('hover '+width);
            assert.equal(await evaluate("getComputedStyle(document.querySelector('#productGrid .product-card'),'::after').content"),'none');
            await command('CSS.forcePseudoState',{nodeId:cardNode.nodeId,forcedPseudoClasses:[]});
            await evaluate('document.getElementById("productGrid").scrollIntoView({block:"start",behavior:"instant"})');await capture('visual-products-'+width);
            await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
            await evaluate("document.querySelector('#productGrid .card-add-button').focus()");
            const focus=await evaluate("(() => {const s=getComputedStyle(document.activeElement);return {style:s.outlineStyle,width:parseFloat(s.outlineWidth)};})()");assert.equal(focus.style,'solid');assert.ok(focus.width>=2,'visible keyboard focus');
            if(width<=860){const sizes=await evaluate("Array.from(document.querySelectorAll('#menuToggle,.mobile-shortcuts a,#productGrid .card-add-button')).slice(0,4).map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height};})");for(const size of sizes){assert.ok(size.height>=44,'44px touch height '+JSON.stringify(size));assert.ok(size.width>=44,'44px touch width '+JSON.stringify(size));}}
            await evaluate('window.scrollTo({top:0,behavior:"instant"})');
            await capture('visual-home-'+width);
            for (const route of ['/products','/categories/'+encodeURIComponent(available.category)]) {
                await command('Page.navigate',{url:base+route});
                await until(()=>evaluate("typeof productsSource!=='undefined' && productsSource==='api' && !!document.querySelector('#productGrid .product-card') && !!document.querySelector('#authForm a')"),'enhanced catalog '+route);
                await noOverflow('catalog '+route+' '+width);
                assert.equal(await evaluate("new URL(document.querySelector('.product-card-link').href).pathname"),'/product.html');
                assert.equal(await evaluate("new URL(document.querySelector('#authForm a').href).pathname"),'/profile.html');
                await evaluate("document.querySelector('img.product-image').dispatchEvent(new Event('error'))");
                assert.equal(await evaluate("new URL(document.querySelector('img.product-image').src).pathname"),'/img/product-placeholder.svg');
                if (route.startsWith('/categories/')) await capture('visual-category-'+width);
            }
            await command('Page.navigate',{url:base+'/product.html?id='+encodeURIComponent(available.id)});await until(()=>evaluate("!!document.querySelector('.detail-info h1')"),'product detail');await noOverflow('product '+width);
            await evaluate('localStorage.setItem("web2_cart",'+JSON.stringify(JSON.stringify([{id:available.id,quantity:1}]))+')');await command('Page.navigate',{url:base+'/cart.html'});await until(()=>evaluate("!!document.querySelector('.cart-item')"),'cart fixture');await noOverflow('cart '+width);await capture('visual-cart-'+width);
            await command('Page.navigate',{url:base+'/checkout.html'});await until(()=>evaluate("!!document.getElementById('checkoutForm') && !!document.querySelector('.checkout-item')"),'checkout fixture');await noOverflow('checkout '+width);
            await command('Page.navigate',{url:base+'/profile.html'});await until(()=>evaluate("!!document.getElementById('profileAuth')"),'profile login');await noOverflow('profile login '+width);
            readable(await evaluate(`Array.from(document.querySelectorAll('#profileAuth input,#profileAuth select')).filter(el=>!el.closest('[hidden]')).map(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,name:el.name};})`),'profile controls');
            await evaluate('document.getElementById("profileAuthMode").value="register";document.getElementById("profileAuthMode").dispatchEvent(new Event("change",{bubbles:true}))');await until(()=>evaluate("document.getElementById('accountRegisterFields')?.hidden===false"),'register fields');await noOverflow('registration '+width);await capture('visual-register-'+width);
            await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await command('Page.navigate',{url:base+'/index.html'});await until(()=>evaluate("!!document.querySelector('#productGrid .product-card')"),'reduced motion home');
            const motion=await evaluate(`Array.from(document.querySelectorAll('*')).flatMap(el=>['','::before','::after'].map(p=>getComputedStyle(el,p).animationName)).filter(name=>name!=='none')`);assert.deepEqual(motion,[]);await command('Emulation.setEmulatedMedia',{features:[]});
        }
        const userCookie=signup.headers.getSetCookie()[0].split(';')[0];await command('Network.setCookie',{name:userCookie.slice(0,userCookie.indexOf('=')),value:userCookie.slice(userCookie.indexOf('=')+1),url:base,httpOnly:true,sameSite:'Strict',path:'/'});
        await command('Page.navigate',{url:base+'/profile.html'});await until(()=>evaluate("!!document.querySelector('.account-nav')"),'signed-in profile');await noOverflow('account mobile');
        for(const section of ['orders','wishlist','info']){await evaluate('document.querySelector("[data-account-section='+section+']").click()');await until(()=>evaluate("!document.querySelector('.account-loading')"),'account '+section);await noOverflow('account '+section);}
        await command('Network.deleteCookies',{name:'web2_admin',url:base});await command('Page.navigate',{url:base+'/admin-login'});await until(()=>evaluate("!!document.querySelector('.admin-login-card input')"),'admin login');await noOverflow('admin login mobile');
        readable(await evaluate(`Array.from(document.querySelectorAll('.admin-login-card input')).map(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,name:el.name};})`),'admin login controls');
        await command('Network.setCookie',{name:'web2_admin',value:cookie,url:base,httpOnly:true,sameSite:'Strict',path:'/'});
        console.log('Storefront 1440px/390px: contrast, filters, menu, detail, cart, checkout, login/register, profile and reduced motion passed.');
        await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await command('Page.navigate',{url:base+'/admin'});
        await until(()=>evaluate("document.getElementById('adminDashboard')?.hidden===false"),'admin session restored');
        await evaluate("document.querySelector('[data-admin-tab=users]').click()");await until(()=>evaluate("!!document.querySelector('.admin-users-table tbody tr')"),'users loaded');
        const measure=()=>evaluate(`(() => {const nav=document.querySelector('.admin-tabs'),panel=document.querySelector('[data-admin-panel=users]'),b=nav.querySelector('[data-admin-tab=users]'),normal=nav.querySelector('[data-admin-tab=overview]'),s=getComputedStyle(b),n=getComputedStyle(normal);return {width:innerWidth,scroll:document.documentElement.scrollWidth,nav:nav.getBoundingClientRect().toJSON(),panel:panel.getBoundingClientRect().toJSON(),background:s.backgroundColor,color:s.color,normalBackground:n.backgroundColor,normalColor:n.color,rows:document.querySelectorAll('.admin-users-table tbody tr').length,tableDisplay:getComputedStyle(document.querySelector('.admin-users-table')).display,dir:document.documentElement.dir,navWidth:nav.clientWidth,navScroll:nav.scrollWidth};})()`);
        function contrast(a,b){const luminance=s=>{const rgb=s.match(/\d+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
        let layout=await measure();assert.equal(layout.dir,'rtl');assert.ok(layout.scroll<=layout.width+1,'desktop document overflow');assert.ok(layout.nav.x>=layout.panel.right-1,'sidebar is on RTL right');assert.ok(contrast(layout.background,layout.color)>=4.5,'active contrast');assert.ok(contrast(layout.normalBackground,layout.normalColor)>=4.5,'normal contrast');
        const desktop=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.mkdirSync(path.join(root,'.runtime'),{recursive:true});fs.writeFileSync(path.join(root,'.runtime','admin-users-desktop.png'),Buffer.from(desktop.data,'base64'));
        await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(150);layout=await measure();assert.ok(layout.scroll<=layout.width+1,'mobile document overflow');assert.equal(layout.tableDisplay,'block','mobile card layout');assert.ok(layout.navWidth<=390,'mobile nav contained');assert.ok(layout.panel.width<=390,'mobile panel contained');
        await noOverflow('admin users table at common phone/tablet widths');
        await evaluate("document.getElementById('adminSidebarToggle').click()");layout=await measure();assert.ok(layout.scroll<=layout.width+1,'collapsed mobile overflow');
        await evaluate("document.querySelector('[data-admin-tab=notifications]').scrollIntoView({block:'nearest',inline:'center'})");const navigation=await evaluate("(() => {const b=document.querySelector('[data-admin-tab=notifications]').getBoundingClientRect(),n=document.querySelector('.admin-tabs').getBoundingClientRect();return {left:b.left,right:b.right,navLeft:n.left,navRight:n.right};})()");assert.ok(navigation.left>=navigation.navLeft-1&&navigation.right<=navigation.navRight+1,'last mobile nav button reachable');
        await evaluate("document.querySelector('[data-admin-tab=users]').scrollIntoView({block:'nearest',inline:'center'});document.querySelector('[data-um-action=view]').click()");await until(()=>evaluate("!!document.querySelector('.admin-user-dialog[open]')"),'mobile details dialog');const dialog=await evaluate("document.querySelector('.admin-user-dialog').getBoundingClientRect().toJSON()");assert.ok(dialog.left>=0&&dialog.right<=390,'mobile dialog contained');await evaluate("document.querySelector('[data-dialog-close]').click()");
        await evaluate("document.querySelector('[data-admin-panel=users]').scrollIntoView({block:'start'})");
        const mobile=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(root,'.runtime','admin-users-mobile.png'),Buffer.from(mobile.data,'base64'));
        await evaluate("document.body.classList.add('light-theme')");await pause(200);layout=await measure();assert.ok(contrast(layout.background,layout.color)>=4.5,'light active contrast '+layout.background+' '+layout.color);assert.ok(contrast(layout.normalBackground,layout.normalColor)>=4.5,'light normal contrast');
        await evaluate("document.querySelector('[data-admin-tab=admins]').click()");await until(()=>evaluate("!!document.getElementById('consoleAdminForm')"),'admin controls loaded');
        const controls=await evaluate(`Array.from(document.querySelectorAll('.admin-dashboard input:not([type=checkbox]),.admin-dashboard select,.admin-dashboard textarea')).map(el=>{const s=getComputedStyle(el);return {id:el.id,name:el.name,background:s.backgroundColor,color:s.color,scheme:s.colorScheme};})`);
        assert.ok(controls.length>10);for(const control of controls){assert.equal(control.background,'rgb(17, 28, 48)',JSON.stringify(control));assert.ok(contrast(control.background,control.color)>=4.5,JSON.stringify(control));assert.equal(control.scheme,'dark');}
        assert.equal(await evaluate("document.getElementById('adminPrincipal').textContent.includes('مدیر ارشد')"),true);
        assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(resourceErrors,[]);console.log('Desktop 1440px and mobile 390px: contrast, RTL placement, overflow, navigation, card layout, dialogs, images and first-party console/resource checks passed.');
    } finally {
        for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('test closed'));}ws?.close();
        for(const child of [browser,server])if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}
        for(let i=0;i<20;i++){try{fs.rmSync(temp,{recursive:true,force:true});break;}catch{await pause(100);}}
    }
});
