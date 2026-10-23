'use strict';
const crypto=require('node:crypto');
const bcrypt=require('./passwords.cjs');
const {totp}=require('./admin-security.cjs');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const message='کد تأیید نامعتبر یا منقضی شده است.';

function createAccountFactors(store,env=process.env){
    const {transaction}=store;
    const raw=env.ACCOUNT_TOTP_KEY||'';
    if(raw&&!/^[a-f0-9]{64}$/i.test(raw))throw Error('ACCOUNT_TOTP_KEY must be 32 random bytes encoded as hex.');
    const key=raw?Buffer.from(raw,'hex'):null;
    if(!key&&store.access('account-factors').findAccountFactorsBySecretCipher())throw Error('ACCOUNT_TOTP_KEY is required while account 2FA is enabled.');
    const ready=()=>{if(!key)throw fail(503,'فعال‌سازی تأیید دومرحله‌ای روی سرور هنوز تنظیم نشده است.');};
    const seal=(userId,secret)=>{ready();const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(userId));const body=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');};
    const open=(userId,value)=>{ready();const data=Buffer.from(value,'base64'),decipher=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(0,12));decipher.setAAD(Buffer.from(userId));decipher.setAuthTag(data.subarray(12,28));return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8');};
    const factor=id=>store.access('account-factors').findAccountFactorsByUserId(id);
    const status=id=>({enabled:!!factor(id)?.secret_cipher,setupAvailable:!!key,recoveryCodesRemaining:JSON.parse(factor(id)?.recovery_hashes||'[]').length});
    async function password(id,value){
        if(typeof value!=='string'||Buffer.byteLength(value)>72)throw fail(403,'برای ادامه، رمز عبور فعلی را تأیید کنید.');
        const row=store.access('account-factors').findAccountsById(id);
        if(!row||!await bcrypt.compare(value,row.password_hash))throw fail(403,'برای ادامه، رمز عبور فعلی را تأیید کنید.');
        return row.password_hash;
    }
    function codes(){return Array.from({length:8},()=>crypto.randomBytes(10).toString('hex').toUpperCase().match(/.{1,5}/g).join('-'));}
    function check(id,code,{consume=true}={}){
        const row=factor(id);if(!row?.secret_cipher)throw fail(400,message);
        const value=typeof code==='string'?code.trim().toUpperCase():'';
        if(/^\d{6}$/.test(value)){
            const secret=open(id,row.secret_cipher),time=Date.now();
            for(const offset of [-1,0,1]){
                const step=Math.floor(time/30000)+offset;
                if(step<=row.last_step)continue;
                if(crypto.timingSafeEqual(Buffer.from(value),Buffer.from(totp(secret,step*30000)))){
                    if(consume){const changed=store.access('account-factors').updateAccountFactorsByUserIdAndLastStep(step,id,step);if(!changed.changes)throw fail(400,message);}
                    return 'totp';
                }
            }
        }
        if(/^[A-F0-9]{5}(?:-[A-F0-9]{5}){3}$/.test(value)){
            const digest=hash(value),all=JSON.parse(row.recovery_hashes||'[]');
            if(all.includes(digest)){
                if(consume){const changed=store.access('account-factors').updateAccountFactorsByUserIdAndRecoveryHashes(JSON.stringify(all.filter(h=>h!==digest)),id,row.recovery_hashes);if(!changed.changes)throw fail(400,message);store.securityEvent('USER_RECOVERY_CODE_USED',id);}
                return 'recovery';
            }
        }
        throw fail(400,message);
    }
    function start(id){ready();if(factor(id)?.secret_cipher)throw fail(409,'تأیید دومرحله‌ای فعال است.');
        // 32 unbiased Base32 symbols from 20 random bytes.
        const bytes=crypto.randomBytes(20);let bits='';for(const b of bytes)bits+=b.toString(2).padStart(8,'0');const generated=(bits.match(/.{5}/g)||[]).map(x=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(x,2)]).join('');
        store.access('account-factors').createAccountFactors(id,seal(id,generated),Date.now()+10*60000);
        return generated;
    }
    function confirm(id,code){ready();const row=factor(id);if(!row?.pending_cipher||row.pending_until<=Date.now()||row.secret_cipher)throw fail(400,message);const secret=open(id,row.pending_cipher),value=typeof code==='string'?code.trim():'';const step=Math.floor(Date.now()/30000);let matched=-1;for(const offset of [-1,0,1])if(/^\d{6}$/.test(value)&&value===totp(secret,(step+offset)*30000))matched=step+offset;if(matched<0)throw fail(400,message);
        const recovery=codes();transaction(()=>{const changed=store.access('account-factors').updateAccountFactorsByUserIdAndSecretCipherAndPendingUntil(JSON.stringify(recovery.map(hash)),matched,id,Date.now());if(!changed.changes)throw fail(409,message);store.securityEvent('USER_2FA_ENABLED',id);});return recovery;
    }
    function disable(id,code){transaction(()=>{check(id,code);store.access('account-factors').deleteAccountFactorsByUserId(id);store.securityEvent('USER_2FA_DISABLED',id);});}
    function regenerate(id,code){return transaction(()=>{check(id,code);const recovery=codes();store.access('account-factors').updateAccountFactorsByUserId(JSON.stringify(recovery.map(hash)),id);store.securityEvent('USER_RECOVERY_CODES_REGENERATED',id);return recovery;});}
    return {status,password,check,start,confirm,disable,regenerate,enabled:id=>!!factor(id)?.secret_cipher};
}
module.exports={createAccountFactors};
