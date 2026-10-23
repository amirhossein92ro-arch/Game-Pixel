'use strict';
function storageError(error) {
    if (error?.status || error?.statusCode) return error;
    const message = String(error?.message || '');
    let status = 500, code = 'STORAGE_FAILURE', safe = 'Storage is temporarily unavailable.';
    if ([5, 6].includes(error?.errcode) || /database (?:is locked|table is locked)/i.test(message)) {
        status = 503; code = 'STORAGE_BUSY';
    } else if (/UNIQUE constraint|PRIMARY KEY constraint|FINAL_SUPER_ADMIN/i.test(message) || error?.code === '23505') {
        status = 409; code = 'STORAGE_CONFLICT'; safe = 'A conflicting record already exists.';
    } else if (/CHECK constraint|FOREIGN KEY constraint|NOT NULL constraint|STORAGE_VALIDATION|cannot store .* value in .* column|datatype mismatch/i.test(message) || ['23503','23514','23502'].includes(error?.code)) {
        status = 400; code = 'STORAGE_VALIDATION'; safe = 'Persistent data failed validation.';
    }
    return Object.assign(new Error(safe, {cause:error}), {status, statusCode:status, code, ...(status === 503 ? {retryAfter:1} : {})});
}
function safeCall(fn) { try { return fn(); } catch (error) { throw storageError(error); } }
module.exports = {storageError, safeCall};
