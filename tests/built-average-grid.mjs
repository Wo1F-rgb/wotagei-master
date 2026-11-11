// Real native playback/save/history; deterministic detector responses exercise variable-grid consent.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {analyzeDetectedGrid} from '../lib/analyzed-grid.ts';
import {rhythmFixture} from './audio-fixtures.mjs';

const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const qa=resolve(process.env.AVERAGE_QA_DIR||'work/average-grid-qa');await mkdir(qa,{recursive:true});
const fixture=fileURLToPath(new URL('./fixtures/sync-150.mp4',import.meta.url)),media=await readFile(fixture);
const key='twitter:2090797885625700592:1';
const beats=Array.from({length:72},(_,i)=>.2+i*.4+i*i*.00016),grid=analyzeDetectedGrid(beats,[],30);
assert.equal(grid?.variable,true,'a real varying detector sequence must produce the warning');
const detection={engine:'variable detector fixture',duration:30,beats,downbeats:[],waveform:[.1,.8,.2,.6],grid};
const pcm=rhythmFixture(150,{seconds:30}),wav=Buffer.alloc(44+pcm.length*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);
for(let i=0;i<pcm.length;i++)wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),44+i*2);
const server=createServer(async(req,res)=>{try{const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,page;const results={grid,layouts:[]};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
 page=await browser.newPage({viewport:{width:390,height:700}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.qaTools={};document.modelContext={registerTool(t){window.qaTools[t.name]=t;}};
  const NativeWorker=window.Worker;window.Worker=class{constructor(url,options){if(!String(url).includes('rhythm.worker'))return new NativeWorker(url,options);}postMessage(){setTimeout(()=>{if(!this.dead)this.onmessage?.({data:{result:structuredClone(window.qaDetection)}});},30);}terminate(){this.dead=true;}};
  window.qaClicks=[];const original=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){const oscillator=original.call(this),start=oscillator.start.bind(oscillator);oscillator.start=time=>{window.qaClicks.push(time);return start(time);};return oscillator;};
 });
 await page.route('https://api.fxtwitter.com/2/status/2090797885625700592',r=>r.fulfill({json:{code:200,status:{id:'2090797885625700592',type:'status',author:{screen_name:'fixture'},media:{all:[{type:'video',url:'https://video.twimg.com/test/average.mp4'}]}}}}));
 await page.route('https://video.twimg.com/test/average.mp4',r=>r.fulfill({body:media,contentType:'video/mp4'}));
 const url=process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`;
 const button=name=>page.getByRole('button',{name,exact:true}),state=()=>page.evaluate(()=>window.qaTools.read_practice_state.execute({}));
 const analyze=async name=>{const settings=page.locator('details.rhythm-analysis__settings');if(!await settings.evaluate(e=>e.open))await settings.locator('summary').click();await button(name).click();};
 const bpm=()=>page.getByLabel('解析BPM',{exact:true}),origin=()=>page.getByLabel('解析結果の1拍目の位置（秒）',{exact:true});
 const load=async()=>{await page.getByLabel('YouTube・Xの動画リンク').fill('https://x.com/emakari_love/status/2090797885625700592');await page.locator('.link-form button').click();await page.waitForFunction(()=>document.querySelector('.deck-0 video')?.readyState>=2);};
 const rows=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('wotagei-rhythm-history-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('results','readonly'),q=t.objectStore('results').getAll();q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};}));
 await page.goto(url);
 await page.evaluate(async({key,result})=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('wotagei-rhythm-history-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('results',{keyPath:'key'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('results','readwrite');t.objectStore('results').put({key,version:1,updatedAt:Date.now(),bytes:4096,source:'video',audio:null,bpmText:String(result.grid.bpm),originText:String(result.grid.origin),position:0,baseline:{bpm:120,origin:0},result});t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};});},{key,result:detection});
 await load();await button('お手本の設定').click();await button('平均の拍を使う').waitFor();
 const before=await state();assert.equal(await button('平均の拍を使う').getAttribute('aria-pressed'),'false');assert.equal(await button('フィット').isDisabled(),true);
 await button('保存して戻る').click();assert.equal(await page.locator('main.editing').count(),1);assert.deepEqual((await state()).bpm,before.bpm,'unaccepted varying grid is never saved');if(await button('メッセージを閉じる').count())await button('メッセージを閉じる').click();
 await origin().fill('4.37683142456');await button('平均の拍を使う').click();assert.equal(await origin().inputValue(),'4.37683142456','acceptance keeps the user-adjusted first beat');
 assert.equal(await button('平均の拍を使う').getAttribute('aria-pressed'),'true');assert.deepEqual((await state()).bpm,before.bpm,'acceptance remains a draft');assert.equal(await button('フィット').isEnabled(),true);
 for(const size of [{width:390,height:700},{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(size);await button('平均の拍を使う').scrollIntoViewIfNeeded();
  const bounds=await page.locator('.rhythm-analysis__average').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  assert.ok(bounds.x>=0&&bounds.x+bounds.w<=size.width+1&&bounds.y>=0&&bounds.y+bounds.h<=size.height+1,JSON.stringify({size,bounds}));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));results.layouts.push({size,bounds});
  await page.screenshot({path:resolve(qa,`average-${size.width}.png`)});
 }
 await page.setViewportSize({width:390,height:700});
 const target=grid.origin+8.5*60/grid.bpm;await origin().fill(String(target+.02));await button('フィット').click();assert.ok(Math.abs(Number(await origin().inputValue())-target)<1e-11);
 const positions=await page.locator('.rhythm-analysis__beat line').evaluateAll(e=>e.map(n=>Number(n.getAttribute('x1'))));
 assert.ok(positions.length>4);assert.ok(positions.slice(2).every((x,i)=>Math.abs(x-positions[i+1]-(positions[1]-positions[0]))<1e-7),'averaged white lines are equally spaced');
 await page.evaluate(()=>window.qaClicks=[]);await button('拍音で再生').click();await page.waitForFunction(()=>window.qaClicks.length>=3,null,{timeout:6000});await page.locator('.rhythm-analysis__preview-row').getByRole('button',{name:'停止',exact:true}).click();
 const clicks=await page.evaluate(()=>window.qaClicks);assert.ok(clicks.slice(1).every((time,i)=>Math.abs(time-clicks[i]-60/grid.bpm)<.04),'audible click schedule uses the averaged tempo');results.clicks=clicks;
 await button('保存して戻る').click();await page.waitForFunction(()=>!document.querySelector('main.editing'));
 const saved=await state();assert.equal(saved.bpm[0],grid.bpm);assert.ok(Math.abs(saved.origins[0]-target)<1e-11);
 await button('コマ送りを開く').click();await button('次の拍へ').click();assert.ok(Math.abs(Number(await page.locator('.beat-frames').getAttribute('data-frame-time'))-(target+60/grid.bpm))<1e-11,'frames use the saved averaged grid');await button('完了').click();
 const stored=(await rows()).find(r=>r.key===key);assert.equal(stored.useAverage,true);assert.equal(stored.result.grid.variable,true);assert.deepEqual(stored.result.beats,beats);
 await button('お手本の設定').click();assert.equal(await button('平均の拍を使う').getAttribute('aria-pressed'),'true');await bpm().fill('144.123456789012');await button('練習画面に戻る').click();assert.equal((await state()).bpm[0],grid.bpm,'leaving an accepted draft does not implicitly save');
 await page.reload();await load();await button('お手本の設定').click();await button('平均の拍を使う').waitFor();assert.equal(await button('平均の拍を使う').getAttribute('aria-pressed'),'true');assert.equal(await bpm().inputValue(),'144.123456789012');assert.equal((await state()).bpm[0],grid.bpm,'restoring consent and draft does not apply it');
 await page.evaluate(result=>window.qaDetection=result,detection);await analyze('もう一度解析');await button('平均の拍を使う').waitFor({timeout:15000});assert.equal(await button('平均の拍を使う').getAttribute('aria-pressed'),'false','a new result requires a new choice');assert.equal(await button('フィット').isDisabled(),true);
 await button('平均の拍を使う').click();await page.getByLabel('BPM解析用の別音声を選ぶ').setInputFiles({name:'average-150.wav',mimeType:'audio/wav',buffer:wav});await analyze('解析を開始');await button('平均の拍を使う').waitFor({timeout:15000});assert.equal(await button('平均の拍を使う').getAttribute('aria-pressed'),'false','another audio source does not inherit acceptance');
 await button('平均の拍を使う').click();await bpm().fill('143.234567890123');await origin().fill('6.123456789');await button('保存して戻る').click();
 assert.equal((await state()).bpm[0],143.234567890123);assert.ok(Math.abs((await state()).origins[0]-target)<1e-11,'external audio cannot move the video first beat');
 await button('お手本の設定').click();await button('平均の拍を使う').waitFor();assert.equal(await button('平均の拍を使う').getAttribute('aria-pressed'),'true');
 await page.evaluate(result=>window.qaDetection={...result,grid:null},detection);await analyze('もう一度解析');await page.getByText('拍のグリッドを作れませんでした。音源を変えるか、手動の拍設定を使ってください。',{exact:true}).waitFor({timeout:15000});assert.equal(await button('平均の拍を使う').count(),0,'a missing grid is never invented by averaging');
 await button('保存して戻る').click();assert.equal(await page.locator('main.editing').count(),1);assert.equal((await state()).bpm[0],143.234567890123);
 assert.deepEqual(errors,[]);results.saved=saved;console.log(JSON.stringify(results));
}catch(error){if(page){console.error(await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:resolve(qa,'failure.png')}).catch(()=>{});}throw error;}
finally{await writeFile(resolve(qa,'results.json'),JSON.stringify(results,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));}
