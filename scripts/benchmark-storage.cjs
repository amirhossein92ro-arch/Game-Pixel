'use strict';
// Offline, synthetic data only. No target URL, source file or database option is accepted.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {readSource}=require('../storage/json/source.cjs');
const {atomicWriteJson}=require('../lib/atomic-file.cjs');
const validation=require('../lib/storage-validation.cjs');
const {openStorage}=require('../storage/index.cjs');
const {openRehearsal}=require('../storage/migration/sqlite.cjs');
const root=path.resolve(__dirname,'..');
const percentile=(values,p)=>values[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
function measure(iterations,work){
    global.gc?.();const memoryBefore=process.memoryUsage(),cpu=process.cpuUsage(),times=[],start=performance.now();
    for(let index=0;index<iterations;index++){const at=performance.now();work(index);times.push(performance.now()-at);}
    const elapsedMs=performance.now()-start,used=process.cpuUsage(cpu);global.gc?.();times.sort((a,b)=>a-b);
    return {operations:iterations,elapsedMs,operationsPerSecond:iterations*1000/elapsedMs,averageMs:times.reduce((a,b)=>a+b,0)/iterations,p95Ms:percentile(times,.95),p99Ms:percentile(times,.99),cpuMs:(used.user+used.system)/1000,memoryBefore,memoryAfter:process.memoryUsage()};
}
function main(){
    const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--output')throw Error('Use --output .runtime/NAME.json or docs/benchmarks/NAME.json.');
    const output=path.resolve(root,args[1]),relative=path.relative(root,output).split(path.sep).join('/');
    if(!/^(?:\.runtime|docs\/benchmarks)\/phase18-[a-z0-9-]+\.json$/.test(relative)||fs.existsSync(output))throw Error('A new Phase 18 report path is required.');
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'web2-storage-benchmark-'));let live,rehearsal;
    try {
        const data={products:Array.from({length:400},(_,index)=>({id:'fixture-'+index,name:'Fixture product '+index,category:'fixture',price:100000+index,stock:50,status:'active',description:'Synthetic benchmark description. '.repeat(8)})),users:[],orders:[]};
        const source=path.join(folder,'source.json');fs.writeFileSync(source,JSON.stringify(data));
        live=openStorage({env:{STORAGE_DRIVER:'sqlite',SQLITE_PATH:path.join(folder,'live.sqlite'),SEED_DATA_PATH:source},root:folder});
        rehearsal=openRehearsal(path.join(folder,'rehearsal.sqlite'),{initialize:true});rehearsal.transaction(()=>{for(const row of data.products)rehearsal.repositories.products.create(row);});
        const report={at:new Date().toISOString(),node:process.version,platform:process.platform,fixture:{products:400,reads:300,writes:50},notes:[
            'Local synthetic storage operations, not HTTP/VPS capacity or a before/after application benchmark.',
            'JSON measurements exercise offline seed/import tools; live production storage already uses SQLite.',
            'Writes include each adapter\'s durable commit; transactions and validation remain enabled.',
            'No production data or runtime configuration is read or changed. Explicit GC is used when available.'
        ],drivers:{}};
        report.drivers.legacyJsonTools={reads:measure(300,index=>{const row=readSource(source).data.products.find(row=>row.id==='fixture-'+index%400);if(!row)throw Error('Missing fixture');}),writes:measure(50,index=>{const contents=fs.readFileSync(source,'utf8'),next=JSON.parse(contents);next.products[0].stock=index%2?50:49;atomicWriteJson(source,next,validation.state,{expectedContents:contents});})};
        for(const [name,store]of [['runtimeSqlite',live],['normalizedRehearsal',rehearsal]]){
            report.drivers[name]={reads:measure(300,index=>{if(!store.repositories.products.findById('fixture-'+index%400))throw Error('Missing fixture');}),writes:measure(50,index=>store.repositories.products.update('fixture-0',row=>({...row,stock:index%2?50:49})))};
            if(store.db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||store.db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Storage integrity failure');
        }
        validation.state(readSource(source).data);report.integrity='ok';
        fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
        console.log(JSON.stringify({output:relative,integrity:report.integrity,drivers:Object.fromEntries(Object.entries(report.drivers).map(([name,metrics])=>[name,{readP95Ms:metrics.reads.p95Ms,writeP95Ms:metrics.writes.p95Ms}]))}));
    }finally{live?.close();rehearsal?.close();if(path.dirname(folder)!==os.tmpdir())throw Error('Unsafe cleanup');fs.rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
if(require.main===module){try{main();}catch(error){console.error(JSON.stringify({ok:false,code:error.code||'BENCHMARK_FAILED'}));process.exitCode=1;}}
module.exports={measure};
