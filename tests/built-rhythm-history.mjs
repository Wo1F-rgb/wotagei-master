// Verify the emitted app with real analysis and IndexedDB, using synthetic audio only.
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {rhythmFixture} from './audio-fixtures.mjs';
const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const fixture=process.env.APP_TEST_FILE||fileURLToPath(new URL('./fixtures/synthetic-150-aac.mov',import.meta.url));
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.wasm':'application/wasm','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
 const page=await browser.newPage({viewport:{width:390,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const W=window.Worker;window.__rhythmWorkerCount=0;window.Worker=class extends W{constructor(...args){super(...args);if(String(args[0]).includes('rhythm.worker'))window.__rhythmWorkerCount++;}};});
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 const button=name=>page.getByRole('button',{name,exact:true});
 const dismiss=async()=>{if(await button('メッセージを閉じる').count())await button('メッセージを閉じる').click();};
 const upload=()=>page.getByLabel('お手本の動画を選ぶ',{exact:true}).setInputFiles(fixture);
 const open=async()=>{await dismiss();await button('お手本の設定').click();};
 const close=()=>button('保存して戻る').click();
 const result=()=>page.getByLabel('解析BPM',{exact:true}).waitFor({timeout:90000});
 const fields=async()=>({bpm:await page.getByLabel('解析BPM',{exact:true}).inputValue(),origin:await page.getByLabel('1拍目の位置（秒）',{exact:true}).inputValue()});
 const stored=()=>page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('wotagei:video:')).map(([,v])=>JSON.parse(v))[0]);
 const assertSaved=async expected=>{const saved=await stored();assert.equal(saved.bpm,Number(expected.bpm));assert.equal(saved.origin,Number(expected.origin));assert.equal(saved.kind,'analysis');};
 await upload();await page.waitForFunction(()=>document.querySelector('.video-stage video')?.duration>=12);await open();
 assert.deepEqual(await page.getByRole('tablist',{name:'BPMを決める方法'}).getByRole('tab').allTextContents(),['自動解析','手動']);
 assert.equal(await page.getByRole('tab',{name:'自動解析',exact:true}).getAttribute('aria-selected'),'true');
 await button('解析を開始').click();await close();assert.ok(await page.locator('main.editing').count(),'save while analysis is busy cannot close settings');await dismiss();await result();
 const initial=await fields(),anchor=Number(initial.origin),bpm=Number(initial.bpm),period=60/bpm;
 assert.notEqual((await stored())?.kind,'analysis','analysis itself is a draft, not an implicit adoption');
 assert.equal(await button('BPMと拍を使う').count(),0,'only the settings save button is needed');
 await page.getByLabel('1拍目の位置（秒）',{exact:true}).fill(String(anchor+period*2+.025));await button('フィット').click();
 assert.ok(Math.abs(Number((await fields()).origin)-(anchor+period*2))<1e-12,'fit to the nearby beat');
 await page.getByLabel('1拍目の位置（秒）',{exact:true}).fill(String(anchor+period*2.5+.02));await button('フィット').click();
 assert.ok(Math.abs(Number((await fields()).origin)-(anchor+period*2.5))<1e-12,'fit to midpoint without moving the original beat anchor');
 const midpoint=(await fields()).origin;await button('フィット').click();assert.equal((await fields()).origin,midpoint,'fit is idempotent');
 // Touch/mouse drag on the waveform moves the red dance-1 line; the white targets stay fixed.
 const wave=page.getByRole('slider',{name:'赤線の最初の1を移動',exact:true});await wave.scrollIntoViewIfNeeded();const rect=await wave.boundingBox();
 const whiteBefore=await page.locator('.rhythm-analysis__beat line').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('x1')));
 await page.mouse.move(rect.x+rect.width*.30,rect.y+rect.height*.6);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.32,rect.y+rect.height*.6);await page.mouse.up();
 const dragged=Number((await fields()).origin);assert.ok(Math.abs(dragged-2.56)<.025,'drag places an unsnapped red 1 on the visible 0–8s window');
 assert.deepEqual(await page.locator('.rhythm-analysis__beat line').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('x1'))),whiteBefore);
 assert.equal(Number(await page.locator('.rhythm-analysis__origin').getAttribute('data-origin')),dragged);
 await button('フィット').click();const snapped=Number((await fields()).origin);assert.ok(Math.abs((snapped-anchor)/(period/2)-Math.round((snapped-anchor)/(period/2)))<1e-10);
 await page.getByLabel('解析BPM',{exact:true}).fill('149.876543210987');await page.getByLabel('1拍目の位置（秒）',{exact:true}).fill('2.123456789012345');await page.getByLabel('1拍目の位置（秒）',{exact:true}).press('Tab');
 const expected=await fields();await close();await assertSaved(expected);await open();await result();assert.deepEqual(await fields(),expected);assert.equal(await page.evaluate(()=>window.__rhythmWorkerCount),1);
 // Main save must also see the draft when another video-settings tab is visible.
 await page.getByLabel('1拍目の位置（秒）',{exact:true}).fill('2.23456789012345');await page.getByRole('tab',{name:'表示',exact:true}).click();await close();expected.origin='2.23456789012345';await assertSaved(expected);
 await open();await result();await page.getByRole('tab',{name:'拍の位置',exact:true}).click();await page.getByLabel('「1」の位置（秒）',{exact:true}).fill('2.345678');await close();expected.origin='2.345678';await assertSaved(expected);
 await open();await result();assert.deepEqual(await fields(),expected,'editing the separate origin tab cannot be overwritten by a stale analysis draft');
 await page.getByLabel('解析BPM',{exact:true}).fill('');await close();assert.equal(await page.locator('main.editing').count(),1);await assertSaved(expected);await dismiss();
 await page.getByLabel('解析BPM',{exact:true}).fill(expected.bpm);await page.getByRole('tab',{name:'手動',exact:true}).click();await close();await assertSaved(expected);
 await open();await result();assert.equal(await page.getByRole('tab',{name:'自動解析',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('tab',{name:'手動',exact:true}).click();await page.getByRole('tab',{name:'自動解析',exact:true}).click();assert.deepEqual(await fields(),expected);
 if(process.env.RHYTHM_QA_DIR){await mkdir(process.env.RHYTHM_QA_DIR,{recursive:true});await wave.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(process.env.RHYTHM_QA_DIR,'rhythm-fit-portrait.png')});}
 // Leaving without Save retains the draft for later but does not change playback settings.
 await page.getByLabel('解析BPM',{exact:true}).fill('151.123456789012');await button('練習画面に戻る').click();await assertSaved(expected);
 await page.reload();await upload();await page.waitForFunction(()=>document.querySelector('.video-stage video')?.duration>=12);await open();await result();
 assert.equal((await fields()).bpm,'151.123456789012');assert.equal((await fields()).origin,expected.origin);assert.equal(await page.evaluate(()=>window.__rhythmWorkerCount),0);
 assert.ok(await page.locator('audio[aria-label="解析音声"]').evaluate(e=>e.paused));await assertSaved(expected);
 await close();expected.bpm='151.123456789012';await assertSaved(expected);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1));
 // Separate audio may supply tempo, but its time origin must never replace the video's origin.
 await open();await result();await page.locator('.rhythm-analysis__settings summary').click();
 const pcm=rhythmFixture(150,{seconds:12,noise:0}),wav=Buffer.alloc(44+pcm.length*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);for(let i=0;i<pcm.length;i++)wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),44+i*2);
 await page.getByLabel('BPM解析用の別音声を選ぶ',{exact:true}).setInputFiles({name:'separate-music.wav',mimeType:'audio/wav',buffer:wav});await button('解析を開始').click();await result();
 await page.getByLabel('解析BPM',{exact:true}).fill('148.123456789');await page.getByLabel('1拍目の位置（秒）',{exact:true}).fill('6.123456789');await close();expected.bpm='148.123456789';await assertSaved(expected);
 await open();await result();assert.equal((await fields()).origin,'6.123456789','external audio keeps its own draft origin');
 await page.getByLabel('解析BPM',{exact:true}).fill('147.23456789');
 await page.evaluate(()=>{const original=Storage.prototype.setItem;window.__restoreStorage=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if(String(key).startsWith('wotagei:video:'))throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};});
 await close();assert.equal(await page.locator('main.editing').count(),1,'storage failure cannot be reported as a completed save');await page.evaluate(()=>window.__restoreStorage());await dismiss();await close();expected.bpm='147.23456789';await assertSaved(expected);
 assert.deepEqual(errors,[]);
 console.log('Built app: analysis default, settings-only save, beat/midpoint fit and drag, cross-tab edits, invalid input guard, history reload, no implicit adoption verified.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
