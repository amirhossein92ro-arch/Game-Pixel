'use strict';
const {execute}=require('./execute.cjs');
// Privileged domain operations; values are always bound, never interpolated.
module.exports = db => Object.freeze({
    findLoginFailuresByKey:(...values)=>execute(db,'SELECT locked_until FROM login_failures WHERE key=?','get',values),
    deleteLoginFailuresByWindowEndsAndLockedUntil:(...values)=>execute(db,'DELETE FROM login_failures WHERE window_ends<=? AND locked_until<=?','run',values),
    countLoginFailures:(...values)=>execute(db,'SELECT count(*) n FROM login_failures','get',values),
    findLoginFailuresByKey2:(...values)=>execute(db,'SELECT * FROM login_failures WHERE key=?','get',values),
    deleteLoginFailuresByKey:(...values)=>execute(db,'DELETE FROM login_failures WHERE key=?','run',values),
    saveFailure:(...values)=>execute(db,'INSERT INTO login_failures(key,failures,window_ends,locked_until) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET failures=excluded.failures,window_ends=excluded.window_ends,locked_until=excluded.locked_until','run',values)
});
