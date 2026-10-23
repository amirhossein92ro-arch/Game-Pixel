'use strict';
// Only spawns loopback servers with freshly generated, disposable SQLite data.
// Used as a preload in those children; no metrics endpoint is added to the app.
const fs = require('node:fs');
const path = require('node:path');
const {performance, monitorEventLoopDelay} = require('node:perf_hooks');

if (require.main !== module && process.env.WEB2_BENCHMARK_PROBE === '1') {
    const {DatabaseSync} = require('node:sqlite');
    let syncFs = 0, prepares = 0;
    for (const name of ['readFileSync','writeFileSync','readdirSync','statSync','realpathSync']) {
        const original = fs[name];
        const wrapped = function(...args) { syncFs++; return original.apply(this,args); };
        Object.assign(wrapped,original); fs[name] = wrapped;
    }
    const prepare = DatabaseSync.prototype.prepare;
    DatabaseSync.prototype.prepare = function(...args) { prepares++; return prepare.apply(this,args); };
    const delay = monitorEventLoopDelay({resolution:10}); delay.enable();
    let cpu = process.cpuUsage(), since = performance.now();
    process.on('message', message => {
        if (message?.type !== 'benchmark-sample') return;
        if (message.gc) global.gc();
        const elapsedMs = performance.now()-since, usage = process.cpuUsage(cpu);
        process.send({id:message.id, memory:process.memoryUsage(), syncFs, prepares,
            cpuMs:(usage.user+usage.system)/1000, elapsedMs,
            eventLoop:{p95Ms:delay.percentile(95)/1e6,maxMs:delay.max/1e6}});
        if (message.reset) {syncFs=prepares=0;cpu=process.cpuUsage();since=performance.now();delay.reset();}
    });
} else if (require.main === module) {
    main().catch(error => {console.error(error);process.exitCode=1;});
}

async function main() {
    const os = require('node:os'), net = require('node:net'), vm = require('node:vm');
    const {spawn} = require('node:child_process');
    const {once} = require('node:events');
    const {openDatabase} = require('../lib/database.cjs');
    const bcrypt = require('bcrypt');
    const root = path.resolve(__dirname,'..');
    const args = process.argv.slice(2);
    if (args.some((arg,i)=>i%2===0&&!['--output','--runs','--mode','--profile'].includes(arg)) || args.length%2) throw Error('Usage: node scripts/benchmark.cjs [--output file.json] [--runs 3]');
    const output = path.resolve(root,args[args.indexOf('--output')+1] || '.runtime/benchmark.json');
    if (!args.includes('--output')) throw Error('--output is required to keep baseline and later results distinct.');
    const relativeOutput=path.relative(root,output);
    if(path.extname(output)!=='.json'||!['.runtime'+path.sep,'docs'+path.sep+'benchmarks'+path.sep].some(prefix=>relativeOutput.startsWith(prefix)))throw Error('Reports must be JSON files under .runtime or docs/benchmarks; application data cannot be a report target.');
    const runs = args.includes('--runs') ? Number(args[args.indexOf('--runs')+1]) : 3;
    if (!Number.isSafeInteger(runs)||runs<1||runs>5) throw Error('--runs must be 1 through 5.');
    const mode=args.includes('--mode')?args[args.indexOf('--mode')+1]:'full',profileName=args.includes('--profile')?args[args.indexOf('--profile')+1]:'all';
    if(!['full','memory'].includes(mode)||!['all','catalog','growth'].includes(profileName))throw Error('Invalid mode or profile');
    const password='Benchmark-customer-2026!A', passwordHash=await bcrypt.hash(password,12);
    const profiles=[{name:'catalog',products:69,users:20,orders:100},{name:'growth',products:400,users:250,orders:1500}].filter(profile=>profileName==='all'||profile.name===profileName);
    const report={schema:1,createdAt:new Date().toISOString(),node:process.version,platform:process.platform,
        mode,sourceHash:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'server.js'))).update(fs.readFileSync(path.join(root,'script.js'))).digest('hex'),cpus:os.availableParallelism(),totalMemoryBytes:os.totalmem(),runs,concurrency:8,
        notes:['Loopback only; synthetic data; normal auth, CSRF, rate limits and FULL durability enabled.',
            'Latency includes response body download. Memory samples use explicit GC in the test child.',
            'Cart timings measure browser JavaScript in a VM, excluding DOM/layout and network.'],results:[]};
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-benchmark-'));
    try {
        for(const profile of profiles) for(let trial=1;trial<=runs;trial++) {
            const folder=path.join(temp,profile.name+'-'+trial);fs.mkdirSync(folder);
            const seedFile=path.join(folder,'seed.json'), database=path.join(folder,'store.sqlite');
            const at='2026-10-01T12:00:00.000Z';
            const products=Array.from({length:profile.products},(_,i)=>({id:String(i+1),name:'محصول آزمایشی '+(i+1),price:100000+i*1000,stock:100,discount:0,status:'active',category:'دسته '+i%8,brand:'Fixture',image:'img/product-placeholder.svg',description:'توضیحات کالای آزمایشی برای سنجش کارایی فروشگاه.',features:['ویژگی اول','ویژگی دوم'],featured:i<4,createdAt:at,updatedAt:at}));
            fs.writeFileSync(seedFile,JSON.stringify({products,users:[],orders:[]}));
            const store=openDatabase(database,seedFile);
            store.transaction(()=>{
                for(let i=0;i<profile.users;i++) {
                    const user={id:'bench-user-'+i,name:'کاربر آزمایشی '+i,email:'bench'+i+'@example.test',phone:'09'+String(i).padStart(9,'0'),role:'user',banned:false,addresses:[],joinDate:at};
                    store.db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?)').run(user.id,user.email,user.phone,passwordHash,JSON.stringify(user));store.put('users',user,{insert:true});
                }
                for(let i=0;i<profile.orders;i++) store.put('orders',{id:'bench-order-'+i,code:'W2-FIXTURE-'+i,userId:'bench-user-'+i%profile.users,userName:'کاربر آزمایشی',userEmail:'bench'+i%profile.users+'@example.test',userPhone:'09000000000',recipientName:'کاربر آزمایشی',recipientPhone:'09000000000',recipientAddress:'نشانی ساختگی آزمایش کارایی',items:[{id:'1',name:'محصول آزمایشی 1',quantity:1,price:100000,unitPrice:100000,lineTotal:100000}],subtotal:100000,discount:0,shippingCost:0,total:100000,status:'pending',paymentStatus:'test',createdAt:at,updatedAt:at},{insert:true});
            });store.close();
            const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
            const base='http://127.0.0.1:'+port,started=performance.now();
            const child=spawn(process.execPath,['--expose-gc','--require',__filename,'server.js'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:base,ALLOWED_ORIGINS:base,DATABASE_PATH:database,SEED_DATA_PATH:seedFile,ADMIN_USERNAME:'benchadmin',ADMIN_PASSWORD:'Benchmark-admin-2026!A',ADMIN_TOTP_SECRET:'',CAPTCHA_TEST_MODE:'true',SMS_PROVIDER:'mock',PAYMENT_MODE:'test',WEB2_BENCHMARK_PROBE:'1'}});
            let stderr='',stdout='';child.stderr.on('data',d=>{stderr=(stderr+String(d)).slice(-5000);});
            try {
                await new Promise((resolve,reject)=>{
                    const timer=setTimeout(()=>reject(Error('Benchmark startup timeout: '+stderr)),20000);
                    const exit=code=>{clearTimeout(timer);reject(Error('Benchmark server exited '+code+': '+stderr));};child.once('exit',exit);
                    child.stdout.on('data',d=>{stdout+=String(d);if(stdout.includes('Server is running')){clearTimeout(timer);child.off('exit',exit);resolve();}});
                });
                const result={profile,trial,startupMs:performance.now()-started,endpoints:{},memorySoak:[]};
                let sampleId=0;
                const sample=({reset=false,gc=false}={})=>new Promise((resolve,reject)=>{
                    const id=++sampleId,timer=setTimeout(()=>{child.off('message',onMessage);reject(Error('Metrics timeout'));},5000);
                    function onMessage(m){if(m.id===id){clearTimeout(timer);child.off('message',onMessage);resolve(m);}}
                    child.on('message',onMessage);child.send({type:'benchmark-sample',id,reset,gc});
                });
                function client(){return {cookie:'',csrf:'',async call(url,method='GET',body,expected=200){
                    const start=performance.now();const response=await fetch(base+url,{method,headers:{Origin:base,...(this.cookie?{Cookie:this.cookie}:{}),...(this.csrf?{'X-CSRF-Token':this.csrf}:{}),...(body?{'Content-Type':'application/json'}:{}),...(url==='/api/checkout'?{'Idempotency-Key':'benchmark-invalid-0001'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
                    const data=await response.text(),elapsed=performance.now()-start;
                    if(response.status!==expected)throw Error(url+' returned '+response.status+': '+data.slice(0,200));
                    const cookies=response.headers.getSetCookie();if(cookies.length)this.cookie=cookies.map(c=>c.split(';',1)[0]).join('; ');
                    let json;if(response.headers.get('content-type')?.includes('application/json')){json=JSON.parse(data);if(json?.csrfToken)this.csrf=json.csrfToken;}
                    return {elapsed,bytes:Buffer.byteLength(data),json};
                }};}
                const anonymous=client(),user=client(),admin=client();
                await user.call('/api/auth/login','POST',{email:'bench0@example.test',password,captchaToken:'test-valid-captcha'});
                await admin.call('/api/admin/login','POST',{username:'benchadmin',password:'Benchmark-admin-2026!A',captchaToken:'test-valid-captcha'});
                async function measure(name,fn,count=24,concurrency=8) {
                    const cold=await fn();await sample({reset:true});
                    const timings=[],bytes=[];let next=0;const start=performance.now();
                    await Promise.all(Array.from({length:Math.min(count,concurrency)},async()=>{while(next++<count){const row=await fn();timings.push(row.elapsed);bytes.push(row.bytes);}}));
                    const elapsedMs=performance.now()-start,metrics=await sample();timings.sort((a,b)=>a-b);
                    result.endpoints[name]={count,concurrency,coldMs:cold.elapsed,errors:0,averageMs:timings.reduce((a,b)=>a+b,0)/count,p99Ms:timings[Math.min(timings.length-1,Math.floor(timings.length*.99))],medianMs:timings[Math.floor(timings.length/2)],p95Ms:timings[Math.min(timings.length-1,Math.floor(timings.length*.95))],requestsPerSecond:count*1000/elapsedMs,responseBytes:Math.max(...bytes),...metrics};
                    if(metrics.memory.rss>384*1024*1024)throw Error('Benchmark stopped at the conservative 384 MiB RSS budget: '+name);
                }
                if(mode==='full'){
                await measure('health',()=>anonymous.call('/health'));
                await measure('homepage',()=>anonymous.call('/'));
                await measure('catalogPage',()=>anonymous.call('/products'));
                await measure('productList',()=>anonymous.call('/api/products'));
                await measure('productDetail',()=>anonymous.call('/api/products/1'));
                await measure('stylesheet',()=>anonymous.call('/style.css'));
                await measure('login',()=>user.call('/api/auth/login','POST',{email:'bench0@example.test',password,captchaToken:'test-valid-captcha'}),3,1);
                const items=Array.from({length:20},(_,i)=>({id:String(i+1),quantity:1}));
                await measure('checkoutQuote',()=>user.call('/api/checkout/quote','POST',{items}),12,4);
                await measure('checkoutValidation',()=>user.call('/api/checkout','POST',{items,isAgreed:false},400),8,4);
                await measure('adminProducts',()=>admin.call('/api/admin/products?page=1&pageSize=20'),12,4);
                await measure('adminOrders',()=>admin.call('/api/admin/orders?page=1&pageSize=20'),12,4);
                await measure('adminUsers',()=>admin.call('/api/admin/users?page=1&pageSize=20'),12,4);
                await measure('adminStats',()=>admin.call('/api/admin/stats'),3,1);
                await measure('adminAnalytics',()=>admin.call('/api/admin/analytics?days=30'),3,1);
                let mixed=0;
                await measure('mixedReadTraffic',()=>anonymous.call(['/','/products','/api/products/1','/api/products'][mixed++%4]),32,8);
                }else{await anonymous.call('/products');await anonymous.call('/api/products/1');}
                await sample({gc:true,reset:true});
                for(let round=0;round<(mode==='memory'?20:5);round++) {
                    if(mode==='memory')await new Promise(resolve=>setTimeout(resolve,1000));
                    for(let batch=0;batch<(mode==='memory'?1:4);batch++)await Promise.all(Array.from({length:8},()=>anonymous.call('/products')));
                    const memory=await sample({gc:true,reset:true});result.memorySoak.push(memory);
                    if(memory.memory.rss>384*1024*1024||memory.memory.heapUsed>128*1024*1024)throw Error('Memory test exceeded its safety budget.');
                    if(mode==='memory'&&(round+1)%5===0)console.log(JSON.stringify({round:round+1,heapUsed:memory.memory.heapUsed,rss:memory.memory.rss,external:memory.memory.external}));
                }
                if(mode==='full')for(const concurrency of [5,10,25,50]) {
                    let next=0;
                    await measure('load'+concurrency,()=>anonymous.call(['/health','/','/api/products?page=1&pageSize=20'][next++%3]),50,concurrency);
                    if(result.endpoints['load'+concurrency].memory.rss>384*1024*1024)throw Error('Benchmark stopped at the conservative 384 MiB RSS budget.');
                }
                const firstHeap=result.memorySoak[0].memory.heapUsed,lastHeap=result.memorySoak.at(-1).memory.heapUsed;
                result.memoryRetainedDelta=lastHeap-firstHeap;
                if(lastHeap-firstHeap>8*1024*1024)throw Error('Memory test retained more than 8 MiB after warmup; investigate.');
                const {DatabaseSync}=require('node:sqlite'),verify=new DatabaseSync(database,{readOnly:true});
                try {
                    if(verify.prepare('PRAGMA quick_check').get().quick_check!=='ok'||verify.prepare('PRAGMA foreign_key_check').all().length||verify.prepare("SELECT count(*) n FROM products WHERE json_extract(payload,'$.stock')<0").get().n)throw Error('Benchmark storage integrity failed.');
                    result.integrity={quickCheck:'ok',foreignKeys:'ok',negativeStock:0};
                } finally {verify.close();}
                const storage=new Map(),context=vm.createContext({console,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},document:{body:{dataset:{}},addEventListener(){},getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];}},window:{addEventListener(){},setTimeout,clearTimeout}});
                vm.runInContext(fs.readFileSync(path.join(root,'script.js'),'utf8'),context);
                context.fixture=products;
                vm.runInContext('products=fixture;productsSource="api";refreshCartUI=()=>{};saveCart(fixture.slice(0,50).map(p=>({id:p.id,quantity:1})));',context);
                const cart=[];for(let i=0;i<100;i++){const start=performance.now();vm.runInContext('getCartTotals()',context);cart.push(performance.now()-start);}cart.sort((a,b)=>a-b);
                result.cartTotals={count:100,lines:50,medianMs:cart[50],p95Ms:cart[95]};
                report.results.push(result);
                fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
                console.log(JSON.stringify({profile:profile.name,trial,startupMs:Math.round(result.startupMs),homepageP95:result.endpoints.homepage?.p95Ms,apiP95:result.endpoints.productList?.p95Ms,adminUsersP95:result.endpoints.adminUsers?.p95Ms,heapBytes:result.memorySoak.at(-1).memory.heapUsed}));
            } finally {
                if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited;}
            }
        }
        fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
        console.log('Saved '+output);
    } finally {
        if(path.dirname(temp)!==os.tmpdir()||!path.basename(temp).startsWith('web2-benchmark-'))throw Error('Unsafe benchmark cleanup.');
        fs.rmSync(temp,{recursive:true,force:true});
    }
}
