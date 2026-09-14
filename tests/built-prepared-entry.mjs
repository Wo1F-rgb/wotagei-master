// Regression for a follower which enters the comparison after a pre-roll.
// The source videos are real HTMLVideoElements backed by the bundled MP4
// fixtures.  SYNC_REFERENCE and SYNC_SELF may point at private originals.
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
  window.qaSeeks=[];window.qaCovered=false;window.qaPlayEvents=[];
  window.qaAllPlayCalls=[];
  // The optional native delay hooks are left available for private-browser
  // runs; this regression configures a post-Promise clock freeze.  The
  // underlying decoder still renders frames, so this exercises a real media
  // clock rather than a fake video.
  window.qaPlayInjection={enabled:false,delay:[250,600],freeze:[250,600],once:false};
  window.qaPlayCounts=[0,0];
  const nativePlay=HTMLMediaElement.prototype.play;
  const nativePause=HTMLMediaElement.prototype.pause;
  const time=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
  const pending=new WeakMap(),frozen=new WeakMap();
  const mediaIndex=media=>[...document.querySelectorAll('.video-stage video')].indexOf(media);
  HTMLMediaElement.prototype.play=function(...args){
   const index=this instanceof HTMLVideoElement?mediaIndex(this):-1;
   if(index>=0)window.qaAllPlayCalls.push({index,at:performance.now()});
   const config=window.qaPlayInjection;
   if(!config.enabled||index<0)return nativePlay.apply(this,args);
   const first=window.qaPlayCounts[index]++===0,use=!(config.once&&!first);
   const delay=use?(config.delay[index]||0):0,freezeMs=use?(config.freeze[index]||0):0;
   const event={index,delay,requestedAt:performance.now(),requestedTime:time.get.call(this),nativeAt:null,resolvedAt:null,freezeMs};
   window.qaPlayEvents.push(event);
   const previous=pending.get(this);
   if(previous){clearTimeout(previous.timer);pending.delete(this);previous.reject(new DOMException('The play request was superseded.','AbortError'));}
   return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
     pending.delete(this);event.nativeAt=performance.now();
     let started;
     try{started=nativePlay.apply(this,args);}catch(error){reject(error);return;}
     Promise.resolve(started).then(()=>{
      const value=time.get.call(this);event.resolvedAt=performance.now();
      frozen.set(this,{value,until:event.resolvedAt+event.freezeMs});
      resolve();
     },reject);
    },delay);
    pending.set(this,{timer,reject});
   });
  };
  HTMLMediaElement.prototype.pause=function(...args){
   const waiting=pending.get(this);
   if(waiting){clearTimeout(waiting.timer);pending.delete(this);waiting.reject(new DOMException('The play request was interrupted.','AbortError'));}
   frozen.delete(this);
   return nativePause.apply(this,args);
  };
  Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{...time,get(){
   const held=frozen.get(this);
   if(held&&performance.now()<held.until)return held.value;
   if(held)frozen.delete(this);
   return time.get.call(this);
  },set(value){time.set.call(this,value);}});
  document.addEventListener('seeking',e=>{if(e.target instanceof HTMLVideoElement)window.qaSeeks.push({at:performance.now(),time:e.target.currentTime});},true);
  new MutationObserver(()=>{if(document.querySelector('.start-sync-cover'))window.qaCovered=true;}).observe(document,{childList:true,subtree:true});
 });
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 await page.waitForFunction(()=>window.qaTools.read_practice_state);

 const button=name=>page.getByRole('button',{name,exact:true});
 const state=()=>page.evaluate(()=>window.qaTools.read_practice_state.execute({}));
 const inspect=()=>page.evaluate(()=>{
  const c=window.qaTools.read_practice_state.execute({});
  const media=[...document.querySelectorAll('.video-stage video')].map(v=>{const q=v.getVideoPlaybackQuality?.();return {time:v.currentTime,rate:v.playbackRate,paused:v.paused,seeking:v.seeking,ready:v.readyState,frames:q?.totalVideoFrames??0};});
  return {c,media,seeks:window.qaSeeks.length,covered:window.qaCovered,plays:window.qaPlayEvents.length,allPlays:window.qaAllPlayCalls.length};
 });
 const notices=()=>page.locator('.notice').allTextContents();
 const dismiss=async()=>{if(await button('メッセージを閉じる').count())await button('メッセージを閉じる').click();};
 const waitPaused=async()=>{
  await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].length===2&&[...document.querySelectorAll('.video-stage video')].every(v=>v.paused&&!v.seeking)&&!window.qaTools.read_practice_state.execute({}).playing,{},{timeout:15000});
  await page.waitForTimeout(100);
 };
 const load=async()=>{
  for(let i=0;i<2;i++)await page.getByLabel(`${i?'自分':'お手本'}の動画を選ぶ`,{exact:true}).setInputFiles(files[i]);
  await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.readyState>=2&&v.duration>=25),{},{timeout:15000});
 };
 const configure=config=>page.evaluate(v=>window.qaTools.configure_practice_tempo.execute(v),config);
 const inject=config=>page.evaluate(v=>{Object.assign(window.qaPlayInjection,v);window.qaPlayCounts=[0,0];window.qaSeeks=[];window.qaPlayEvents=[];},config);
 const saveOrigins=async values=>{
  await dismiss();await button('1拍目を合わせる').click();
  for(let i=0;i<2;i++){
   const input=page.getByLabel(`${i?'自分':'お手本'}の1拍目（秒）`,{exact:true});
   await input.fill(String(values[i]));await input.press('Tab');
  }
  await button('この2点を保存').click();await dismiss();await waitPaused();
 };
 const start=async()=>{await dismiss();await button('同期再生').click();await button('停止').waitFor({timeout:20000});};
 const stop=async()=>{if(await button('停止').count())await button('停止').click();await waitPaused();};
 const mappedGap=(c,[reference,self],master)=>((self.time-c.origins[1])*c.bpm[1]-(reference.time-c.origins[0])*c.bpm[0])/(c.bpm[master]*c.rate);
 const waitEntry=async()=>{
  // With [2,.9] the self clip has no mapped frame at reference t=0.  Wait
  // until its first common frame has actually entered, then observe a full
  // second of steady playback so a stop/retry loop cannot hide in preparation.
  await page.waitForFunction(()=>{
   const c=window.qaTools.read_practice_state.execute({}),[r,s]=document.querySelectorAll('.video-stage video');
   return c.playing&&!r.paused&&!s.paused&&!r.seeking&&!s.seeking&&c.origins[1]+(r.currentTime-c.origins[0])*c.bpm[0]/c.bpm[1]>=0;
  },{},{timeout:20000});
  const points=[];
  for(let i=0;i<8;i++){await page.waitForTimeout(140);points.push(await inspect());}
  return points;
 };
 const noCommonLoop=async()=>{
  const origins=[2,.9],bpm=[150,139.879];
  await configure({referenceBpm:bpm[0],selfBpm:bpm[1],rate:1});await saveOrigins(origins);
  await inject({enabled:false,delay:[0,0],freeze:[0,0],once:false});
  await button('区間ループを設定').click();
  await page.locator('[data-slot="switch"][aria-label="区間ループ"]').click();
  const startField=page.getByLabel('A 始点（秒）',{exact:true}),endField=page.getByLabel('B 終点（秒）',{exact:true});
  await startField.fill('0');await startField.press('Tab');await endField.fill('.5');await endField.press('Tab');
  await page.waitForFunction(()=>{const loop=window.qaTools.read_practice_state.execute({}).loop;return loop.enabled&&loop.start<.05&&loop.end>.45&&loop.end<.7;});
  await page.keyboard.press('Escape');
  const slider=page.locator('.track-seek').getByRole('slider');await slider.press('Home');
  await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.paused&&!v.seeking)&&!window.qaTools.read_practice_state.execute({}).playing,{},{timeout:5000});
  await page.evaluate(()=>{window.qaAllPlayCalls=[];window.qaSeeks=[];});
  await button('同期再生').click();await button('停止').waitFor({timeout:20000});
  await page.waitForFunction(()=>{const c=window.qaTools.read_practice_state.execute({}),notice=document.querySelector('.notice')?.textContent||'';return c.playing&&!c.loop.enabled&&notice.includes('共通区間が短いため、ループを解除しました。');},{},{timeout:15000});
  const first=await inspect(),points=[];for(let i=0;i<8;i++){await page.waitForTimeout(140);points.push(await inspect());}
  const last=points.at(-1),plays=await page.evaluate(()=>window.qaAllPlayCalls.length);
  assert.equal(last.c.loop.enabled,false,'a loop wholly before the common frame must be disabled');
  assert.ok(last.c.playing&&points.every(p=>p.c.playing),'common-frame playback must remain active after disabling the invalid loop');
  assert.ok(last.media.every((m,i)=>m.frames>first.media[i].frames),'common-frame playback must advance both real videos after disabling the loop');
  assert.ok((await notices()).join('\n').includes('共通区間が短いため、ループを解除しました。'),'loop-disable notice must remain visible after startup');
  await page.waitForTimeout(700);const settled=await inspect();
  assert.equal(settled.allPlays,plays,'disabling a pre-roll loop must not cause repeated play retries');
  assert.equal(settled.covered,false,'disabling a pre-roll loop must keep both videos visible');
  results.push({case:'loop-before-common-frame',points,playCalls:plays});
  console.log(`loop-before-common-frame: ${plays} native play calls, both videos advanced`);await stop();
 };
 const assertCase=async(master,rate)=>{
  const expectedOrigins=[2,.9],expectedBpm=[150,139.879];
  await button(`${master?'自分':'お手本'}の曲を主役にする`).click();
  await page.getByLabel('練習速度を選ぶ',{exact:true}).selectOption(String(rate));
  await configure({referenceBpm:expectedBpm[0],selfBpm:expectedBpm[1],rate});
  await saveOrigins(expectedOrigins);
  const saved=await state();assert.deepEqual(saved.origins,expectedOrigins,`master ${master} speed ${rate}: BPM save must retain both origins`);
  assert.deepEqual(saved.bpm,expectedBpm,`master ${master} speed ${rate}: BPM save must retain exact tempos`);
  const slider=page.locator('.track-seek').getByRole('slider');
  const expectedRates=master===0?[rate,rate*expectedBpm[0]/expectedBpm[1]]:[rate*expectedBpm[1]/expectedBpm[0],rate];
 const verifyAfterHome=async(label,strictPhase,cold=false)=>{
   await slider.press('Home');
   await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.paused&&!v.seeking)&&!window.qaTools.read_practice_state.execute({}).playing,{},{timeout:5000});
   const home=await inspect();assert.ok(home.media.every(m=>m.time<.08),`${label}: slider Home must seek both media to the pre-roll boundary`);
   assert.deepEqual(home.c.origins,expectedOrigins,`${label}: Home must not alter saved origins`);
   // User-originated Home seeks are expected setup.  Count only after this
   // point so startup normalization can seek once without becoming a drift
   // correction loop.
   await page.evaluate(()=>{window.qaSeeks=[];window.qaPlayEvents=[];});
   await button('同期再生').click();
   const points=await waitEntry();
   if(cold){
    const starts=await page.evaluate(()=>window.qaPlayEvents.map(e=>({index:e.index,time:e.requestedTime})));
    const firstReference=starts.find(e=>e.index===0),firstSelf=starts.find(e=>e.index===1),common=expectedOrigins[0]-expectedOrigins[1]*expectedBpm[1]/expectedBpm[0];
    assert.ok(firstReference&&firstReference.time>=common-1e-6,`${label}: first reference Play must start at the first common frame (${JSON.stringify({common,starts})})`);
    assert.ok(firstSelf&&firstSelf.time>=0&&firstSelf.time<.08,`${label}: first self Play must start at its first nonnegative frame (${JSON.stringify({starts})})`);
   }
   const first=points[0],last=points.at(-1),gaps=points.map(p=>mappedGap(p.c,p.media,master));
   const maxGap=Math.max(...gaps.map(Math.abs));
   assert.equal(last.c.playing,true,`${label}: user Play must remain playing after delayed entry`);
   assert.ok(points.every(p=>p.c.playing),`${label}: a phase gap must not force a stop/retry loop`);
   assert.ok(last.media.every((m,i)=>m.frames>first.media[i].frames),`${label}: both real videos must render new frames`);
   assert.ok(last.media.every(m=>!m.paused&&!m.seeking&&m.ready>=2),`${label}: both native media must stay playable`);
   assert.ok(last.media.every((m,i)=>Math.abs(m.rate-expectedRates[i])<1e-6),`${label}: playback rates changed during startup (${JSON.stringify(last.media)})`);
   if(strictPhase)assert.ok(maxGap<.09,`${label}: actual native clock phase gap ${(maxGap*1000).toFixed(1)} ms exceeds 90 ms (${JSON.stringify({gaps,points})})`);
   else assert.ok(Number.isFinite(maxGap),`${label}: adversarial clock phase must remain observable`);
   assert.ok(points.every(p=>p.c.origins.every((origin,i)=>origin===expectedOrigins[i])&&p.c.bpm.every((tempo,i)=>tempo===expectedBpm[i])),`${label}: playback changed saved BPM or origins`);
   assert.deepEqual(last.c.origins,expectedOrigins,`${label}: playback must not rewrite BPM origins`);
   const steadySeeks=await page.evaluate(()=>window.qaSeeks.length),steadyPlays=await page.evaluate(()=>window.qaPlayEvents.length);
   assert.ok(steadyPlays<=6,`${label}: startup Play calls must remain bounded (${steadyPlays})`);
   await page.waitForTimeout(700);
   const settled=await inspect();
   assert.equal(settled.seeks,steadySeeks,`${label}: no extra steady-state seeks after startup`);
   assert.equal(settled.plays,steadyPlays,`${label}: no repeated startup play/retry loop`);
   assert.equal(settled.covered,false,`${label}: ongoing warm resume must keep both videos visible`);
   const text=(await notices()).join('\n');
   assert.ok(!text.includes('自分の動画を再生できません'),`${label}: obsolete delayed-follower error shown: ${text}`);
   const injectedIndices=await page.evaluate(()=>[0,1].map(index=>window.qaPlayEvents.some(e=>e.index===index)));
   assert.ok(steadyPlays>0&&injectedIndices.every(Boolean),`${label}: injected native play must exercise both real videos`);
   results.push({case:label,master,rate,maxClockGapSeconds:maxGap,points,steadySeeks,steadyPlays});
   console.log(`${label}: max clock gap ${(maxGap*1000).toFixed(1)} ms, ${steadyPlays} startup plays`);
   await stop();
  };

  // Cold entry: both one-time delays are paid before audible playback.  The
  // implementation must warm real frames and preserve the common phase.
  await inject({enabled:true,delay:[250,600],freeze:[250,600],once:true});
  await verifyAfterHome(`cold prepared-entry master ${master} speed ${rate}`,true,true);

  // Repeated native Play acknowledgement latency exercises the predictor on a
  // warmed pair and must keep the same strict phase bound.
  await saveOrigins(expectedOrigins);await inject({enabled:false,delay:[250,600],freeze:[0,0],once:false});
  await start();await page.waitForTimeout(450);await stop();
  await start();await page.waitForFunction(()=>window.qaTools.read_practice_state.execute({}).playing,{},{timeout:15000});
  await inject({enabled:true,delay:[250,600],freeze:[0,0],once:false});
  await verifyAfterHome(`fixed Play-delay master ${master} speed ${rate}`,true);

  // An unpredictable post-Promise freeze must still continue with bounded
  // startup activity.  Phase precision is covered by the two strict cases;
  // this case protects against a stop/retry loop while the clock recovers.
  await saveOrigins(expectedOrigins);await inject({enabled:false,delay:[0,0],freeze:[250,600],once:false});
  await start();await page.waitForTimeout(450);await stop();
  await start();await page.waitForFunction(()=>window.qaTools.read_practice_state.execute({}).playing,{},{timeout:15000});
  await inject({enabled:true,delay:[0,0],freeze:[250,600],once:false});
  await verifyAfterHome(`adversarial startup-freeze master ${master} speed ${rate}`,false);
 };

 await load();
 await noCommonLoop();
 for(const master of [0,1])for(const rate of [.5,1,1.25])await assertCase(master,rate);

 // A cancel arriving while the native preload is pending must invalidate the
 // request.  Waiting past both injected delays proves no stale play or seek
 // can resurrect the canceled run; a speed change then starts a fresh run.
 await button('お手本の曲を主役にする').click();
 await configure({referenceBpm:150,selfBpm:139.879,rate:1});
 await saveOrigins([2,.9]);
 await inject({enabled:true,delay:[250,600],freeze:[0,0],once:false});
 await button('同期再生').click();await button('開始を中止').click();await waitPaused();
 const canceledSeeks=await page.evaluate(()=>window.qaSeeks.length);await page.waitForTimeout(1300);
 const canceled=await inspect();
 assert.equal(canceled.c.playing,false,'cancel during preload must remain stopped');
 assert.equal(canceled.seeks,canceledSeeks,'cancel during preload must not seek after cancellation');
 assert.equal(canceled.covered,false,'cancel during preload must keep the videos visible');
 await page.getByLabel('練習速度を選ぶ',{exact:true}).selectOption('1.25');
 await page.evaluate(()=>{window.qaSeeks=[];window.qaPlayEvents=[];});
 await button('同期再生').click();
 const restarted=await waitEntry(),restartLast=restarted.at(-1),restartGap=Math.max(...restarted.map(p=>Math.abs(mappedGap(p.c,p.media,0))));
 assert.equal(restartLast.c.playing,true,'restart after canceled preload must reach playing');
 assert.ok(restartLast.media.every((m,i)=>m.frames>restarted[0].media[i].frames),'restart after cancellation must advance both real videos');
 assert.ok(restartGap<.09,`restart after cancellation: native clock phase gap ${(restartGap*1000).toFixed(1)} ms`);
 assert.deepEqual(restartLast.c.origins,[2,.9],'restart after cancellation must retain BPM origins');
 assert.equal((await notices()).join('\n').includes('自分の動画を再生できません'),false,'restart after cancellation must not show obsolete delayed-follower error');
 results.push({case:'cancel-and-restart',maxClockGapSeconds:restartGap,points:restarted});
 await stop();
 assert.deepEqual(errors,[]);
 console.log(`Prepared-entry browser verification passed: ${results.length} runs, real pre-roll Home, delayed post-Promise clocks, both masters and rates, steady-state seek guard, and cancel/restart.`);
}finally{
 if(process.env.SYNC_QA_DIR){await mkdir(process.env.SYNC_QA_DIR,{recursive:true});await writeFile(resolve(process.env.SYNC_QA_DIR,'prepared-entry-results.json'),JSON.stringify(results,null,2));}
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
