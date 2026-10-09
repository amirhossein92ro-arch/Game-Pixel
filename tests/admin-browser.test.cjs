'use strict';
// A disposable headless Chromium process tests actual layout without using a person's browser profile.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
const chrome=process.env.CHROME_TEST_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message){for(let i=0;i<200;i++){try{const result=await fn();if(result)return result;}catch{}await pause(75);}throw Error(message);}
test('admin renders with readable contrast and usable desktop/mobile RTL layouts in Chromium',{skip:!fs.existsSync(chrome)},async()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-admin-browser-')),profile=path.join(temp,'chrome'),port=31000+Math.floor(Math.random()*1000),base='http://localhost:'+port;
    let browser,server,ws,sequence=0;const pending=new Map(),errors=[];
    function command(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
    async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;}
    try {
        server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),APP_ORIGIN:base,DATABASE_PATH:path.join(temp,'test.sqlite'),ADMIN_PASSWORD:'Browser-test-password-2026!',NODE_ENV:'test',PAYMENT_MODE:'test'},stdio:['ignore','pipe','pipe'],windowsHide:true});
        let startup='';server.stdout.on('data',data=>startup+=data);await until(()=>startup.includes('Server is running'),'server startup');
        const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Browser-test-password-2026!'})});assert.equal(login.status,200);const cookie=login.headers.getSetCookie()[0].split(';')[0].split('=')[1];
        const signup=await fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'بازیکن تست نمایشگر',email:'browser-test@example.invalid',phone:'09121112233',password:'Browser-user-password-2026!'})});assert.equal(signup.status,201);
        browser=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1440,1000','about:blank'],{stdio:'ignore',windowsHide:true});
        const active=path.join(profile,'DevToolsActivePort');const debugPort=await until(()=>{const value=fs.readFileSync(active,'utf8').split(/\r?\n/)[0];return /^\d+$/.test(value)?value:null;},'headless Chromium startup');
        const tabs=await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
        ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
        ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);if(p){clearTimeout(p.timer);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);});
        await command('Runtime.enable');await command('Page.enable');await command('Network.enable');
        await command('Network.setBlockedURLs',{urls:['https://cdnjs.cloudflare.com/*','https://fonts.googleapis.com/*','https://fonts.gstatic.com/*']});
        await command('Network.setCookie',{name:'web2_admin',value:cookie,url:base,httpOnly:true,sameSite:'Strict',path:'/'});
        await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await command('Page.navigate',{url:base+'/admin'});
        await until(()=>evaluate("document.getElementById('adminDashboard')?.hidden===false"),'admin session restored');
        await evaluate("document.querySelector('[data-admin-tab=users]').click()");await until(()=>evaluate("!!document.querySelector('.admin-users-table tbody tr')"),'users loaded');
        const measure=()=>evaluate(`(() => {const nav=document.querySelector('.admin-tabs'),panel=document.querySelector('[data-admin-panel=users]'),b=nav.querySelector('[data-admin-tab=users]'),normal=nav.querySelector('[data-admin-tab=overview]'),s=getComputedStyle(b),n=getComputedStyle(normal);return {width:innerWidth,scroll:document.documentElement.scrollWidth,nav:nav.getBoundingClientRect().toJSON(),panel:panel.getBoundingClientRect().toJSON(),background:s.backgroundColor,color:s.color,normalBackground:n.backgroundColor,normalColor:n.color,rows:document.querySelectorAll('.admin-users-table tbody tr').length,tableDisplay:getComputedStyle(document.querySelector('.admin-users-table')).display,dir:document.documentElement.dir,navWidth:nav.clientWidth,navScroll:nav.scrollWidth};})()`);
        function contrast(a,b){const luminance=s=>{const rgb=s.match(/\d+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
        let layout=await measure();assert.equal(layout.dir,'rtl');assert.ok(layout.scroll<=layout.width+1,'desktop document overflow');assert.ok(layout.nav.x>=layout.panel.right-1,'sidebar is on RTL right');assert.ok(contrast(layout.background,layout.color)>=4.5,'active contrast');assert.ok(contrast(layout.normalBackground,layout.normalColor)>=4.5,'normal contrast');
        const desktop=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.mkdirSync(path.join(root,'.runtime'),{recursive:true});fs.writeFileSync(path.join(root,'.runtime','admin-users-desktop.png'),Buffer.from(desktop.data,'base64'));
        await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(150);layout=await measure();assert.ok(layout.scroll<=layout.width+1,'mobile document overflow');assert.equal(layout.tableDisplay,'block','mobile card layout');assert.ok(layout.navWidth<=390,'mobile nav contained');assert.ok(layout.panel.width<=390,'mobile panel contained');
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
        assert.deepEqual(errors,[]);console.log('Desktop 1440px and mobile 390px: contrast, RTL placement, overflow, navigation, card layout and dialog checks passed.');
    } finally {
        for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('test closed'));}ws?.close();
        for(const child of [browser,server])if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}
        for(let i=0;i<20;i++){try{fs.rmSync(temp,{recursive:true,force:true});break;}catch{await pause(100);}}
    }
});
