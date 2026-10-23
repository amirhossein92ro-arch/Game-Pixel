'use strict';
const {configuration} = require('./config.cjs');
function openStorage(options = {}) {
    const config = options.config || configuration(options.env, options.root);
    // Validate supplied configuration too; callers cannot bypass explicit driver selection.
    if (config.driver !== 'sqlite') throw Object.assign(new Error('Requested runtime storage driver is unavailable.'), {code:'STORAGE_DRIVER_UNAVAILABLE'});
    return require('./sqlite/adapter.cjs').openDatabase(config.filename, config.seedFile);
}
module.exports = {openStorage, configuration};
