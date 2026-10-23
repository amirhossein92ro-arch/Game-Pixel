'use strict';
const path = require('node:path');
const fail = code => Object.assign(new Error('Storage configuration is invalid or the requested runtime driver is unavailable.'), {code});
function configuration(env = process.env, root = path.resolve(__dirname, '..')) {
    // The deployed application already uses SQLite. File presence never selects a driver.
    const driver = env.STORAGE_DRIVER || 'sqlite';
    if (!['sqlite', 'json', 'postgres'].includes(driver)) throw fail('STORAGE_DRIVER_INVALID');
    if (driver !== 'sqlite') throw fail('STORAGE_DRIVER_UNAVAILABLE');
    if (env.SQLITE_PATH && env.DATABASE_PATH && path.resolve(env.SQLITE_PATH) !== path.resolve(env.DATABASE_PATH)) throw fail('STORAGE_PATH_CONFLICT');
    return Object.freeze({driver, filename: env.SQLITE_PATH || env.DATABASE_PATH || path.join(root, 'var', 'web2.sqlite'),
        seedFile: env.SEED_DATA_PATH || path.join(root, 'data.json')});
}
module.exports = {configuration};
