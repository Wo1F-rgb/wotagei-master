// Verify the emitted app with real analysis and IndexedDB, using synthetic audio only.
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const fixture=fileURLToPath(new URL('./fixtures/synthetic-150-aac.mov',import.meta.url));
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.wasm':'application/wasm','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
 const page=await browser.newPage({viewport:{width:390,height:700}});
 await page.addInitScript(()=>{const W=window.Worker;window.__rhythmWorkerCount=0;window.Worker=class extends W{constructor(...args){super(...args);if(String(args[0]).includes('rhythm.worker'))window.__rhythmWorkerCount++;}};});
 await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
 const upload=()=>page.getByLabel('お手本の動画を選ぶ',{exact:true}).setInputFiles(fixture);
 const open=()=>page.getByRole('button',{name:'お手本の設定',exact:true}).click();
 const close=()=>page.getByRole('button',{name:'保存して戻る',exact:false}).click();
 const result=()=>page.getByRole('button',{name:'BPMと拍を使う',exact:true}).waitFor({timeout:90000});
 const fields=async()=>({bpm:await page.getByLabel('解析BPM',{exact:true}).inputValue(),origin:await page.getByLabel('1拍目の位置（秒）',{exact:true}).inputValue()});
 await upload();await page.waitForFunction(()=>document.querySelector('.video-stage video')?.duration>=12);await open();
 assert.deepEqual(await page.getByRole('tablist',{name:'BPMを決める方法'}).getByRole('tab').allTextContents(),['拍タップ','自動解析']);
 await page.getByRole('tab',{name:'自動解析',exact:true}).click();await page.getByRole('button',{name:'解析を開始',exact:true}).click();await result();
 await page.getByRole('button',{name:'＋1拍',exact:true}).click();await page.getByRole('button',{name:'＋0.01秒',exact:true}).click();const expected=await fields();
 await close();await open();await result();assert.deepEqual(await fields(),expected);assert.equal(await page.evaluate(()=>window.__rhythmWorkerCount),1);
 await page.getByRole('tab',{name:'拍タップ',exact:true}).click();await page.getByRole('tab',{name:'自動解析',exact:true}).click();await result();assert.deepEqual(await fields(),expected);assert.equal(await page.evaluate(()=>window.__rhythmWorkerCount),1);
 await close();await page.reload();await upload();await page.waitForFunction(()=>document.querySelector('.video-stage video')?.duration>=12);await open();await result();
 assert.deepEqual(await fields(),expected);assert.equal(await page.evaluate(()=>window.__rhythmWorkerCount),0);
 assert.ok(await page.locator('audio[aria-label="解析音声"]').evaluate(e=>e.paused));
 const saved=await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('wotagei:video:')).map(([,v])=>JSON.parse(v)));
 assert.ok(saved.every(s=>s.kind!=='analysis'),'History restoration cannot adopt the grid without user confirmation');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1));
 console.log('Built app: two BPM tabs, real analysis, draft precision, settings/tab reopening, reload with IndexedDB, no extra inference or auto-apply verified.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
