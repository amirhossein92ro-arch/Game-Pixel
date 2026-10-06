const fs=require('node:fs'),path=require('node:path');
if(fs.existsSync(path.join(__dirname,'../.env')))process.loadEnvFile(path.join(__dirname,'../.env'));
const {DatabaseSync}=require('node:sqlite');
const source=process.env.DATABASE_PATH||path.join(__dirname,'../var/web2.sqlite');
if(!fs.existsSync(source))throw Error('Database does not exist; start the server first.');
const folder=path.join(__dirname,'../var/backups');fs.mkdirSync(folder,{recursive:true});
const target=path.join(folder,`web2-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
const db=new DatabaseSync(source);db.prepare('VACUUM INTO ?').run(target);db.close();
console.log('Database backup created in var/backups. Protect this directory: it contains user data.');
