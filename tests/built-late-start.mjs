// Regression for a delayed native play after startup clock correction.
// The videos remain real HTMLVideoElements backed by the bundled MP4 fixtures.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../dist-pages/',import.meta.url));
const prefix='/wotagei-master/';
const files=[
 process.env.SYNC_REFERENCE||fileURLToPath(new URL('./fixtures/sync-150.mp4',import.meta.url)),
 process.env.SYNC_SELF||fileURLToPath(new URL('./fixtures/sync-120.mp4',import.meta.url)),
];
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length)||'index.html');
 if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.wasm':'application/wasm','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');
 res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});

await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const results=[];
try{
 browser=await chromium.launch({
  headless:true,
  executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),
  args:['--autoplay-policy=no-user-gesture-required'],
 });
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.qaTools={};
  document.modelContext={registerTool(t){window.qaTools[t.name]=t;}};
  window.qaSeeks=[];window.qaCovered=false;window.qaPlayDelays={enabled:false,reference:140,self:380};window.qaPlayEvents=[];
  const originalPlay=HTMLMediaElement.prototype.play;
  const originalPause=HTMLMediaElement.prototype.pause;
  const pending=new WeakMap();
  const mediaIndex=media=>[...document.querySelectorAll('.video-stage video')].indexOf(media);
  HTMLMediaElement.prototype.play=function(...args){
   const index=this instanceof HTMLVideoElement?mediaIndex(this):-1;
   const config=window.qaPlayDelays;
   const delay=config.enabled&&index>=0?(index===0?config.reference:config.self):0;
   if(!delay)return originalPlay.apply(this,args);
   const event={index,delay,requestedAt:performance.now(),nativeAt:null};window.qaPlayEvents.push(event);
   const prior=pending.get(this);if(prior){clearTimeout(prior.timer);prior.reject(new DOMException('The play request was superseded.','AbortError'));}
   return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
     pending.delete(this);event.nativeAt=performance.now();
     Promise.resolve(originalPlay.apply(this,args)).then(resolve,reject);
    },delay);
    pending.set(this,{timer,reject});
   });
  };
  HTMLMediaElement.prototype.pause=function(...args){
   const pendingPlay=pending.get(this);
   if(pendingPlay){clearTimeout(pendingPlay.timer);pending.delete(this);pendingPlay.reject(new DOMException('The play request was interrupted.','AbortError'));}
   return originalPause.apply(this,args);
  };
  document.addEventListener('seeking',e=>{if(e.target instanceof HTMLVideoElement)window.qaSeeks.push({at:performance.now(),time:e.target.currentTime});},true);
  new MutationObserver(()=>{if(document.querySelector('.start-sync-cover'))window.qaCovered=true;}).observe(document,{childList:true,subtree:true});
 });
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);

 const button=name=>page.getByRole('button',{name,exact:true});
 const state=()=>page.evaluate(()=>window.qaTools.read_practice_state.execute({}));
 const inspect=()=>page.evaluate(()=>{
  const c=window.qaTools.read_practice_state.execute({});
  const media=[...document.querySelectorAll('.video-stage video')].map(v=>({
   time:v.currentTime,rate:v.playbackRate,paused:v.paused,seeking:v.seeking,ready:v.readyState,
   frames:v.getVideoPlaybackQuality?.().totalVideoFrames??0,dropped:v.getVideoPlaybackQuality?.().droppedVideoFrames??0,
  }));
  return {c,media,seeks:window.qaSeeks.length,covered:window.qaCovered};
 });
 const dismiss=async()=>{if(await button('メッセージを閉じる').count())await button('メッセージを閉じる').click();};
 const waitPaused=async()=>{
  await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].length===2&&[...document.querySelectorAll('.video-stage video')].every(v=>v.paused&&!v.seeking),{},{timeout:15000});
  await page.waitForTimeout(100);
 };
 const load=async()=>{
  for(let i=0;i<2;i++)await page.getByLabel(`${i?'自分':'お手本'}の動画を選ぶ`,{exact:true}).setInputFiles(files[i]);
  await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.readyState>=2&&v.duration>=25),{},{timeout:15000});
 };
 const configure=async config=>{await page.evaluate(v=>window.qaTools.configure_practice_tempo.execute(v),config);};
 const saveOrigins=async values=>{
  await dismiss();await button('1拍目を合わせる').click();
  for(let i=0;i<2;i++){
   const input=page.getByLabel(`${i?'自分':'お手本'}の1拍目（秒）`,{exact:true});
   await input.fill(String(values[i]));await input.press('Tab');
  }
  await button('この2点を保存').click();await dismiss();await waitPaused();
 };
 const start=async()=>{await dismiss();await button('同期再生').click();await button('停止').waitFor({timeout:15000});};
 const stop=async()=>{if(await button('停止').count())await button('停止').click();await waitPaused();};
 const mappedGap=(c,[reference,self],master)=>((self.time-c.origins[1])*c.bpm[1]-(reference.time-c.origins[0])*c.bpm[0])/(c.bpm[master]*c.rate);
 const expectedRates=(master,rate,bpm)=>master===0?[rate,rate*bpm[0]/bpm[1]]:[rate*bpm[1]/bpm[0],rate];

 await load();
 await configure({referenceBpm:150.119,selfBpm:139.879,rate:1});
 await saveOrigins([3.9,1]);

 // Prime the pair through the normal user path. Delays are enabled only after
 // this successful warm run, so the delayed play below exercises the resume
 // path for already decoded native media.
 await start();await page.waitForTimeout(350);await stop();
 const warmed=await inspect();assert.ok(warmed.media.every(m=>m.frames>0),'normal warm run must decode frames');
 await page.evaluate(()=>{window.qaPlayDelays.enabled=true;window.qaPlayEvents=[];window.qaSeeks=[];});

 for(const master of [0,1])for(const rate of [.5,1,1.25]){
  await button(`${master?'自分':'お手本'}の曲を主役にする`).click();
  await page.getByLabel('練習速度を選ぶ',{exact:true}).selectOption(String(rate));
  await saveOrigins([3.9,1]);
  await page.evaluate(()=>{window.qaPlayEvents=[];window.qaSeeks=[];});
  await start();
  // The state changes to playing only after the startup barrier completes.
  // Sample afterward for a full second so a final corrective play cannot leave
  // a permanent phase error hidden by the preparation state.
  const points=[];
  for(let i=0;i<8;i++){
   await page.waitForTimeout(140);
   points.push(await inspect());
  }
  const first=points[0],last=points.at(-1),gaps=points.map(p=>mappedGap(p.c,p.media,master));
  const maxGap=Math.max(...gaps.map(Math.abs));
  const [expectedReferenceRate,expectedSelfRate]=expectedRates(master,rate,[150.119,139.879]);
  assert.ok(maxGap<.09,`master ${master} speed ${rate}: native clocks differ by ${maxGap.toFixed(4)}s (${JSON.stringify({gaps,points})})`);
  assert.ok(last.media.every((media,index)=>media.frames>first.media[index].frames),`master ${master} speed ${rate}: both native videos must render new frames`);
  assert.equal(last.c.playing,true,`master ${master} speed ${rate}: playback stopped during startup`);
  assert.ok(last.media.every(media=>!media.paused&&!media.seeking&&media.ready>=2),`master ${master} speed ${rate}: media did not remain natively playable`);
  assert.ok(Math.abs(last.media[0].rate-expectedReferenceRate)<1e-6&&Math.abs(last.media[1].rate-expectedSelfRate)<1e-6,`master ${master} speed ${rate}: nominal playback rates were not restored (${JSON.stringify(last.media)})`);
  assert.equal(await button(`${master?'自分':'お手本'}の曲を主役にする`).getAttribute('aria-pressed'),'true',`master ${master} speed ${rate}: selected soundtrack changed`);
  assert.ok(Math.abs(last.c.bpm[master]*rate-(last.c.bpm[0]*last.media[0].rate))<1e-5&&Math.abs(last.c.bpm[master]*rate-(last.c.bpm[1]*last.media[1].rate))<1e-5,`master ${master} speed ${rate}: effective BPMs differ`);
  assert.equal(last.seeks,0,`master ${master} speed ${rate}: startup introduced an extra seek`);
  assert.equal(last.covered,false,`master ${master} speed ${rate}: startup hid the videos`);
  const delayed=await page.evaluate(()=>window.qaPlayEvents.map(e=>({index:e.index,delay:e.delay,elapsed:e.nativeAt===null?null:e.nativeAt-e.requestedAt})));
  assert.ok(delayed.some(e=>e.index===0)&&delayed.some(e=>e.index===1),`master ${master} speed ${rate}: both native play calls must be delayed`);
  assert.ok(delayed.every(e=>e.elapsed!==null&&e.elapsed>=e.delay-20),`master ${master} speed ${rate}: delay injection did not defer native play (${JSON.stringify(delayed)})`);
  results.push({master,rate,maxClockGapSeconds:maxGap,points,playDelays:delayed});
  console.log(`late-start master ${master} speed ${rate}: max native clock gap ${(maxGap*1000).toFixed(1)} ms`);
  await stop();
 }

 // Cancellation is independent of the gap assertions: a pending delayed
 // native play must not resurrect a run after the user cancels and changes
 // speed, and the subsequent restart must still satisfy the same checks.
 await button('お手本の曲を主役にする').click();await page.getByLabel('練習速度を選ぶ',{exact:true}).selectOption('1');await saveOrigins([3.9,1]);
 await page.evaluate(()=>{window.qaPlayEvents=[];window.qaSeeks=[];});
 await button('同期再生').click();await button('開始を中止').click();
 await waitPaused();await page.waitForTimeout(500);
 const canceled=await inspect();assert.equal(canceled.c.playing,false,'canceled delayed start must remain stopped');assert.equal(canceled.seeks,0,'canceled delayed start must not seek after cancellation');assert.equal(canceled.covered,false,'canceled delayed start must keep videos visible');
 await page.getByLabel('練習速度を選ぶ',{exact:true}).selectOption('1.25');await page.evaluate(()=>{window.qaPlayEvents=[];window.qaSeeks=[];});await start();await page.waitForTimeout(700);
 const restarted=await inspect(),restartGap=Math.abs(mappedGap(restarted.c,restarted.media,0));
 assert.ok(restartGap<.09,`restart after cancellation: native clocks differ by ${restartGap.toFixed(4)}s`);
 assert.equal(await button('お手本の曲を主役にする').getAttribute('aria-pressed'),'true');assert.equal(restarted.seeks,0);assert.equal(restarted.covered,false);assert.ok(restarted.media.every(m=>m.frames>0&&!m.paused&&!m.seeking));
 results.push({case:'cancel-and-restart-speed-change',maxClockGapSeconds:restartGap,point:restarted});
 await stop();
 assert.deepEqual(errors,[]);
 console.log(`Late-start browser verification passed: ${results.length} runs, delayed native Play on both real videos, frame progress, nominal soundtrack rates, no startup seeks/cover, and cancellation/restart.`);
}finally{
 if(process.env.SYNC_QA_DIR){await mkdir(process.env.SYNC_QA_DIR,{recursive:true});await writeFile(resolve(process.env.SYNC_QA_DIR,'late-start-results.json'),JSON.stringify(results,null,2));}
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
