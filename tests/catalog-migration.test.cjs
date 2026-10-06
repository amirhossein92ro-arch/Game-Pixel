'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openDatabase}=require('../lib/database.cjs');
test('expanded catalog migration imports missing products once and preserves edits and deletions',()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web2-catalog-'));
    const database=path.join(temp,'catalog.sqlite'),seedFile=path.join(temp,'seed.json');
    const product=(id,name)=>({id,name,brand:'Brand',price:100,stock:3});
    let store;
    try {
        fs.writeFileSync(seedFile,JSON.stringify({products:[product(1,'Original')]}));
        store=openDatabase(database,seedFile);
        store.replace('products',[{...product('1','Admin edit'),price:250}]);
        // Simulate a database made before this catalog upgrade existed.
        store.db.prepare("DELETE FROM settings WHERE id='expanded-product-catalog-v1'").run();
        store.db.prepare('INSERT INTO audit_logs(actor_id,actor_username,actor_role,action,target_type,target_id,details,created_at) VALUES(?,?,?,?,?,?,?,?)').run('admin','admin','SUPER_ADMIN','PRODUCT_DELETED','product','30','{}',new Date().toISOString());
        store.close();store=null;
        fs.writeFileSync(seedFile,JSON.stringify({products:[product(1,'Original'),product(10,'New product'),product(30,'Deleted product')]}));
        store=openDatabase(database,seedFile);
        assert.deepEqual(store.list('products').map(p=>p.id),['1','10']);
        assert.equal(store.list('products')[0].name,'Admin edit');
        assert.equal(store.list('products')[0].price,250);
        store.replace('products',store.list('products').filter(p=>p.id!=='10'));
        store.close();store=null;
        store=openDatabase(database,seedFile);
        assert.deepEqual(store.list('products').map(p=>p.id),['1'],'restart must not recreate deleted products');
    }finally{store?.close();fs.rmSync(temp,{recursive:true,force:true});}
});
