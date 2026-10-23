'use strict';
const path = require('node:path');
module.exports = {apps:[{
    name:'web2',cwd:path.resolve(__dirname,'..'),script:'server.js',
    exec_mode:'fork',instances:1,watch:false,autorestart:true,
    max_memory_restart:'512M',kill_timeout:12000,
    min_uptime:10000,max_restarts:10,exp_backoff_restart_delay:3000,
    log_date_format:'YYYY-MM-DD HH:mm:ss Z',merge_logs:true,
    env_production:{NODE_ENV:'production',HOST:'127.0.0.1',PORT:'3000',TRUST_PROXY:'loopback'},
    // Provision secrets in the private .env or process environment, never in this file.
    out_file:'var/logs/web2-out.log',error_file:'var/logs/web2-error.log',time:true
}]};
