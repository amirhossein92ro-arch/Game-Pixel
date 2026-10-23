'use strict';
// Rasterize the existing vector artwork for social crawlers. No network or new
// runtime dependency is needed. Run manually only when the artwork changes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const browser = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome'
].find(file => fs.existsSync(file));
if (!browser) throw Error('Set CHROME_PATH to Chrome/Chromium to regenerate social PNGs.');
const output = path.join(root, 'img', 'social');
fs.mkdirSync(output, {recursive:true});
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'web2-social-'));
try {
    const store = path.join(temp, 'store.html');
    fs.writeFileSync(store, `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><style>html,body{margin:0;width:1200px;height:630px;background:#050816;color:#eef3ff;font-family:Arial,sans-serif}body{display:flex;align-items:center;justify-content:center;gap:70px}img{width:230px;height:230px}.name{font-size:100px;font-weight:bold;color:#00d4ff}p{font-size:42px}</style><img src="${pathToFileURL(path.join(root,'img','favicon.svg')).href}" alt=""><div><div class="name" dir="ltr">WEB 2</div><p>تجهیزات گیمینگ</p></div></html>`);
    const sources = [store, ...fs.readdirSync(path.join(root,'img','products')).filter(name => name.endsWith('.svg')).map(name => path.join(root,'img','products',name))];
    for (const source of sources) {
        const target = path.join(output, path.basename(source, path.extname(source)) + '.png');
        const result = spawnSync(browser, ['--headless=new','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--hide-scrollbars','--force-device-scale-factor=1','--default-background-color=050816ff','--window-size=1200,630',`--user-data-dir=${path.join(temp,'profile')}`,`--screenshot=${target}`,pathToFileURL(source).href], {windowsHide:true,timeout:30000,encoding:'utf8',maxBuffer:1024*1024});
        if (result.error || result.status || !fs.existsSync(target)) throw Error('Social image generation failed: ' + (result.error?.message || result.stderr));
        const png = fs.readFileSync(target);
        if (png.toString('hex',0,8) !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630) throw Error('Invalid social PNG: ' + target);
        console.log(path.relative(root,target) + ' (' + png.length + ' bytes)');
    }
} finally {
    const resolved = fs.realpathSync(temp);
    if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) || !path.basename(resolved).startsWith('web2-social-')) throw Error('Unsafe social image temp directory.');
    fs.rmSync(resolved, {recursive:true,force:true,maxRetries:5,retryDelay:200});
}
