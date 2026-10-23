'use strict';
function scrub(value) {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(password|passwordhash|currentpassword|newpassword|confirmpassword|csrf|csrftoken|resettoken|passwordresettoken|otp|otphash|verifiedtokenhash|apikey|apisecret|secret|secretkey|clientsecret|totpsecret|sessionid|sessionhash|sessiontoken|token|tokenhash|accesstoken|refreshtoken|authorization|cookies?|setcookie|cardnumber|cvv2?|expirydate|expirymonth|expiryyear)$/i.test(key.replace(/[_-]/g,''))).map(([key,v])=>[key,scrub(v)]));
}
module.exports={scrub};
