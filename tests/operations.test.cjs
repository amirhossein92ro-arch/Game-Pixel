'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{execFileSync,spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
test('verified snapshots and offline restore preserve both previous and restored data',()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-operations-')),target=path.join(temp,'store.sqlite'),folder=path.join(temp,'backups');
    try{
        const db=new DatabaseSync(target);db.exec('PRAGMA journal_mode=WAL');for(const table of ['accounts','orders','products','settings','audit_logs'])db.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY,payload TEXT)`);
        db.prepare('INSERT INTO products VALUES(?,?)').run('one','original');db.close();
        const env={...process.env,DATABASE_PATH:target,BACKUP_DIR:folder};
        const run=(script,args=[])=>execFileSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,env,encoding:'utf8',windowsHide:true});
        const first=JSON.parse(run('backup.cjs'));assert.equal(first.status,'ok');assert.ok(first.bytes>0);
        const backup=path.join(folder,first.backup);assert.ok(fs.existsSync(backup));
        assert.equal(fs.readdirSync(folder).some(name=>name.includes('partial')),false);
        assert.equal(fs.readdirSync(folder).some(name=>name.includes('node_modules')||name.includes('.env')),false);
        const snapshot=new DatabaseSync(backup,{readOnly:true});assert.equal(snapshot.prepare('SELECT payload FROM products WHERE id=?').get('one').payload,'original');snapshot.close();
        assert.throws(()=>require('../scripts/backup.cjs').verify(path.join(root,'package.json')));
        const changed=new DatabaseSync(target);changed.prepare('UPDATE products SET payload=? WHERE id=?').run('changed','one');changed.close();
        assert.throws(()=>run('restore.cjs',['--backup',backup,'--target',target]),/offline-confirmed/);
        const result=JSON.parse(run('restore.cjs',['--backup',backup,'--target',target,'--offline-confirmed']));
        const restored=new DatabaseSync(target,{readOnly:true});assert.equal(restored.prepare('SELECT payload FROM products WHERE id=?').get('one').payload,'original');restored.close();
        const safety=new DatabaseSync(path.join(temp,result.safety),{readOnly:true});assert.equal(safety.prepare('SELECT payload FROM products WHERE id=?').get('one').payload,'changed');safety.close();
        assert.ok(fs.existsSync(path.join(path.dirname(target),result.previous)));
        const second=JSON.parse(run('backup.cjs'));assert.notEqual(second.backup,first.backup);assert.ok(fs.existsSync(backup));
        const old=new Date(Date.now()-60*86400000);fs.utimesSync(backup,old,old);fs.utimesSync(path.join(folder,second.backup),old,old);
        const legacy=path.join(folder,'legacy-backup.sqlite');fs.writeFileSync(legacy,'untouched');
        const third=JSON.parse(run('backup.cjs'));assert.ok(fs.existsSync(path.join(folder,third.backup)));assert.ok(fs.existsSync(path.join(folder,second.backup)));assert.equal(fs.existsSync(backup),false);assert.ok(fs.existsSync(legacy));
        const unpruned=JSON.parse(run('backup.cjs',['--no-retention']));assert.equal(unpruned.status,'ok');assert.ok(fs.existsSync(path.join(folder,second.backup)),'pre-deploy backup must not prune old snapshots');
        const corrupt=path.join(temp,'corrupt.sqlite');fs.writeFileSync(corrupt,'invalid');
        assert.throws(()=>run('restore.cjs',['--backup',corrupt,'--target',target,'--offline-confirmed']));
        assert.throws(()=>run('restore.cjs',['--backup',path.join(temp,'missing.sqlite'),'--target',target,'--offline-confirmed']));
        assert.throws(()=>execFileSync(process.execPath,[path.join(root,'scripts/backup.cjs')],{cwd:root,env:{...env,BACKUP_DIR:path.join(root,'var/backups')},encoding:'utf8',windowsHide:true}));
        const still=new DatabaseSync(target,{readOnly:true});assert.equal(still.prepare('SELECT payload FROM products WHERE id=?').get('one').payload,'original');still.close();
    }finally{if(path.dirname(temp)!==os.tmpdir())throw Error('Unsafe test cleanup.');fs.rmSync(temp,{recursive:true,force:true});}
});
test('health and readiness stay minimal; request IDs are server generated',async t=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-health-')),db=path.join(temp,'store.sqlite');
    const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    const child=spawn(process.execPath,['server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:`http://127.0.0.1:${port}`,DATABASE_PATH:db,SEED_DATA_PATH:path.join(root,'data.json'),ADMIN_USERNAME:'admin',ADMIN_PASSWORD:'Unique operations admin 2026!',ADMIN_TOTP_SECRET:'',CAPTCHA_TEST_MODE:'true',SMS_PROVIDER:'mock',PAYMENT_MODE:'test'},stdio:['ignore','pipe','pipe']});
    t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}if(path.dirname(temp)!==os.tmpdir())throw Error('Unsafe test cleanup.');fs.rmSync(temp,{recursive:true,force:true});});
    let errors='';await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout: '+errors)),15000);child.stderr.on('data',data=>errors+=String(data));child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited: '+code+' '+errors));});child.stdout.on('data',data=>{if(String(data).includes('Server is running')){clearTimeout(timer);resolve();}});});
    const base=`http://127.0.0.1:${port}`;
    for(const route of ['/health','/ready']){const response=await fetch(base+route,{headers:{'X-Request-ID':'malicious-value'}});assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'ok'});assert.match(response.headers.get('X-Request-ID'),/^[a-f0-9-]{36}$/);assert.notEqual(response.headers.get('X-Request-ID'),'malicious-value');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');}
    const api=await fetch(base+'/api/health');assert.deepEqual(await api.json(),{status:'ok'});
    const monitored=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/monitor.cjs')],{cwd:root,env:{...process.env,DATABASE_PATH:db,HEALTH_URL:base+'/ready'},encoding:'utf8',windowsHide:true}));assert.equal(monitored.ready,true);assert.ok(monitored.freeBytes>0);
    const disk=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/disk-check.cjs'),temp],{cwd:root,encoding:'utf8',windowsHide:true}));assert.ok(disk.freeBytes>0);assert.match(disk.status,/^(ok|warning)$/);
    assert.throws(()=>execFileSync(process.execPath,[path.join(root,'scripts/disk-check.cjs'),temp],{cwd:root,env:{...process.env,DISK_WARN_PERCENT:'1',DISK_CRITICAL_PERCENT:'2'},encoding:'utf8',windowsHide:true}));
    assert.throws(()=>execFileSync(process.execPath,[path.join(root,'scripts/monitor.cjs')],{cwd:root,env:{...process.env,DATABASE_PATH:db,HEALTH_URL:'http://127.0.0.1:1/ready'},encoding:'utf8',windowsHide:true}));
    for(const route of ['/var/backups/web2/test.sqlite','/backups/test.sqlite','/scripts/backup.cjs'])assert.equal((await fetch(base+route)).status,404);
    const corrupted=new DatabaseSync(db);corrupted.prepare("INSERT OR REPLACE INTO settings VALUES('site-config','null')").run();corrupted.close();
    const failure=await fetch(base+'/api/site-settings?token=top-secret-test-value',{headers:{Authorization:'Bearer top-secret-test-value',Cookie:'web2_user=top-secret-test-value'}});assert.equal(failure.status,500);
    await new Promise(resolve=>setTimeout(resolve,50));
    assert.ok(errors.includes(failure.headers.get('X-Request-ID')));assert.doesNotMatch(errors,/top-secret-test-value|invalid-json|password|cookie|authorization/i);
});

test('graceful shutdown closes SQLite and the same data starts again',async()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-shutdown-')),database=path.join(temp,'store.sqlite');
    const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:`http://127.0.0.1:${port}`,DATABASE_PATH:database,ADMIN_PASSWORD:'Shutdown test admin 2026!',PAYMENT_MODE:'test'};
    async function launch(){const child=spawn(process.execPath,['-e',"require('./server.js');process.stdin.once('data',()=>process.emit('SIGTERM'));"],{cwd:root,env,stdio:['pipe','pipe','pipe'],windowsHide:true});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),15000);child.stdout.on('data',data=>{if(String(data).includes('Server is running')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('early exit '+code));});});return child;}
    let child;
    try{
        child=await launch();assert.equal((await fetch(`http://127.0.0.1:${port}/ready`)).status,200);
        const ended=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('shutdown timeout')),12000);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});child.stdin.end('shutdown\n');assert.equal(await ended,0);
        child=await launch();assert.equal((await fetch(`http://127.0.0.1:${port}/ready`)).status,200);
    }finally{if(child&&child.exitCode===null&&child.signalCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}if(path.dirname(temp)!==os.tmpdir())throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true});}
});
