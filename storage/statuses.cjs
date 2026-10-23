'use strict';
// Payment "test" is not a successful real payment. No callback/provider is implemented yet.
module.exports = Object.freeze({
    order:Object.freeze(['pending','paid','processing','shipped','delivered','cancelled']),
    payment:Object.freeze(['unknown','test','pending','paid','failed','cancelled','refunded']),
    product:Object.freeze(['active','inactive']),
    account:Object.freeze(['active','disabled']),
    ticket:Object.freeze(['open','answered','closed']),
    adminRole:Object.freeze(['SUPER_ADMIN','ADMIN','ORDER_MANAGER','PRODUCT_MANAGER','SUPPORT']),
    // Notifications intentionally allow application-defined types; read status is a nullable timestamp.
});
