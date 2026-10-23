'use strict';
const {execute}=require('./execute.cjs');
// Privileged domain operations; values are always bound, never interpolated.
module.exports = db => Object.freeze({
    findSettingsById:(...values)=>execute(db,"SELECT payload FROM settings WHERE id='site-config'",'get',values)
});
