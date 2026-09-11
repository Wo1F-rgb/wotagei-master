// Built-browser regression: recorded skeletons are precomputed in source time
// and then rendered from the presented video frame, without running inference
// during playback.
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const files=[fileURLToPath(new URL('./fixtures/sync-150.mp4',import.meta.url)),fileURLToPath(new URL('./fixtures/sync-120.mp4',import.meta.url))];
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.wasm':'application/wasm','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.mp4':'video/mp4'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});

await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.qaTools={};document.modelContext={registerTool(t){window.qaTools[t.name]=t;}};
  window.qaPoseFrames=0;window.qaPoseFrameTimes=[];window.qaPoseWorkerCount=0;window.qaSeeks=[];window.qaPresented=[];
  document.addEventListener('seeking',e=>{if(e.target instanceof HTMLVideoElement&&e.target.closest('.video-stage'))window.qaSeeks.push({time:e.target.currentTime,at:performance.now()});},true);
  const Original=window.Worker;
  window.Worker=class extends EventTarget{
   constructor(url,options){super();if(!String(url).includes('pose.worker'))return new Original(url,options);this.sourceIndex=window.qaPoseWorkerCount++;this.closed=false;}
   postMessage(data){
    if(data.type==='init'){queueMicrotask(()=>{if(!this.closed)this.onmessage?.({data:{type:'ready'}});});return;}
    if(data.type!=='frame')return;
    if(window.qaHoldPoses){data.frame.close();window.qaHeldWorker=this;return;}
    if(window.qaFailPose){window.qaFailPose=false;data.frame.close();queueMicrotask(()=>{if(!this.closed)this.onmessage?.({data:{type:'error',message:'Test decode failure'}})});return;}
    const videos=[...document.querySelectorAll('body>video[aria-hidden="true"]')],index=this.sourceIndex,t=videos[0]?.currentTime??0,base=index===0?.16:.24;
    const dx=base+.006*t,p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
    for(const [j,x,y] of [[0,.5,.12],[11,.43,.3],[12,.57,.3],[23,.46,.56],[24,.54,.56],[25,.43,.72],[26,.57,.72],[27,.3,.92],[28,.7,.92]])p[j]={x:x+dx,y,visibility:1};
    data.frame.close();window.qaPoseFrames++;window.qaPoseFrameTimes.push({index,time:t});
    queueMicrotask(()=>{if(!this.closed)this.onmessage?.({data:{type:'poses',poses:[p]}});});
   }
   terminate(){this.closed=true;}
  };
  // Capture the browser's presented-frame clock independently of the app's
  // observer. One callback per video is enough for this regression check.
  window.qaInstallPresented=()=>{
   document.querySelectorAll('.video-stage video').forEach((video,index)=>{
  const observe=(_now,metadata)=>{
    const overlay=video.parentElement?.querySelector('.pose-overlay'),line=overlay?.querySelector('line'),rect=overlay?.getBoundingClientRect();
    window.qaPresented.push({index,time:metadata.mediaTime,currentTime:video.currentTime,poseTime:Number(overlay?.dataset.poseTime||NaN),x1:Number(line?.getAttribute('x1')||NaN),stageWidth:rect?.width||NaN,stageHeight:rect?.height||NaN,videoWidth:video.videoWidth,videoHeight:video.videoHeight});
    video.requestVideoFrameCallback(observe);
  };
    video.requestVideoFrameCallback(observe);
   });
  };
 });
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 const button=name=>page.getByRole('button',{name,exact:true});
 const dismiss=async()=>{if(await button('メッセージを閉じる').count())await button('メッセージを閉じる').click();};
 const configure=input=>page.evaluate(v=>window.qaTools.configure_practice_tempo.execute(v),input);
 const status=(i)=>page.locator(`.deck-${i} .recorded-pose-status`);
 const skeletonSwitch=()=>page.locator('[role="switch"][aria-label="骨格を表示"]');
 const overlays=()=>page.locator('.pose-overlay');
 const videoState=()=>page.locator('.video-stage video').evaluateAll(videos=>videos.map(video=>({time:video.currentTime,paused:video.paused,rate:video.playbackRate})));

 for(let i=0;i<2;i++)await page.getByLabel(`${i?'自分':'お手本'}の動画を選ぶ`,{exact:true}).setInputFiles(files[i]);
 await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.readyState>=2&&v.duration>20));
 await configure({referenceBpm:150,selfBpm:120});

 // The visible settings switches are the user entry point for both complete
 // source analyses. The fake worker still sees real decoder currentTime while
 // videoReader performs its seek/canvas captures.
 for(let i=0;i<2;i++){
  await button(`${i?'自分':'お手本'}の設定`).click();
  await page.getByRole('tab',{name:'表示',exact:true}).click();
  await skeletonSwitch().click();
  await status(i).getByRole('status').waitFor();
  await page.waitForFunction(i=>document.querySelector(`.deck-${i} .recorded-pose-status`)?.dataset.status==='ready',i,{timeout:120000});
  assert.equal(await status(i).getAttribute('data-status'),'ready',`video ${i} preanalysis completes`);
  await button('保存して戻る').click();await dismiss();
 }
 assert.equal(await page.evaluate(()=>window.qaPoseFrames>10),true,'worker performed source-time preanalysis');
 const analysisCalls=await page.evaluate(()=>window.qaPoseFrames);
 await page.evaluate(()=>window.qaInstallPresented());

 // Use mixed BPM and both slow/fast playback. Once the timelines are ready,
 // no worker frame requests may occur; the overlays follow decoder callbacks.
 const playAtRate=async(rate)=>{
 await configure({rate});
 await button('同期再生').click();
 await button('停止').waitFor({timeout:20000});
 await dismiss();
  return await page.evaluate(()=>window.qaSeeks.length);
 };
 const slowStartSeeks=await playAtRate(.5);
 await page.waitForTimeout(1100);
 const slowCalls=await page.evaluate(()=>window.qaPoseFrames),slowFrames=await page.evaluate(()=>window.qaPresented.length);
 assert.equal(slowCalls,analysisCalls,'slow playback performs no pose inference');
 assert.ok(slowFrames>2,'slow playback presents real decoder frames');
 assert.equal(await page.evaluate(()=>window.qaSeeks.length),slowStartSeeks,'slow playback adds no repeated media seeks');
 const fastStartSeeks=await playAtRate(1.5);
 await page.waitForTimeout(1100);
 const fastCalls=await page.evaluate(()=>window.qaPoseFrames),fastFrames=await page.evaluate(()=>window.qaPresented.length);
 assert.equal(fastCalls,analysisCalls,'fast playback performs no pose inference');
 assert.ok(fastFrames>slowFrames,'fast playback presents additional real decoder frames');
 assert.equal(await page.evaluate(()=>window.qaSeeks.length),fastStartSeeks,'fast playback adds no repeated media seeks');

 // Each independently observed presented timestamp must be reflected by the
 // corresponding rendered pose. Compare the overlay clock and one torso line
 // against the deterministic linear pose used by the fake detector.
 const rendered=await page.evaluate(()=>({frames:window.qaPresented.slice(-20),overlays:[...document.querySelectorAll('.pose-overlay')].map(overlay=>Number(overlay.dataset.poseTime||NaN))}));
 assert.equal(rendered.overlays.length,2,'both recorded overlays remain mounted');
 assert.ok(rendered.overlays.every(Number.isFinite),'both recorded overlays have a displayed timestamp');
 assert.ok(rendered.frames.length>=4,'both videos produce independent presented-frame callbacks');
 for(const frame of rendered.frames){
  if(!Number.isFinite(frame.poseTime)||!Number.isFinite(frame.time))continue;
  assert.ok(Math.abs(frame.poseTime-frame.time)<.12,`overlay ${frame.index} follows rVFC (${frame.poseTime} vs ${frame.time})`);
  assert.ok(Number.isFinite(frame.x1)&&frame.x1>=0&&frame.x1<=frame.stageWidth,'rendered geometry is finite and inside its stage');
 const scale=Math.min(frame.stageWidth/frame.videoWidth,frame.stageHeight/frame.videoHeight),width=frame.videoWidth*scale,base=frame.index===0?.16:.24,expected=(frame.stageWidth-width)/2+(.43+base+.006*frame.time)*width;
  assert.ok(Math.abs(frame.x1-expected)<5,`overlay ${frame.index} renders the source-time torso geometry (${frame.x1} vs ${expected})`);
 }

 // Seeking while paused clears the old pose clock and restores the selected
 // source-time sample. It must not trigger any extra visible-media seek.
 await button('停止').click();
 const beforeSeek=await page.evaluate(()=>({seeks:window.qaSeeks.length,calls:window.qaPoseFrames}));
 await page.locator('.deck-0 video').evaluate(v=>{v.currentTime=5;});
 await page.waitForFunction(()=>document.querySelector('.deck-0 .pose-overlay')?.dataset.poseTime!=='');
 const afterSeek=await page.evaluate(()=>({seeks:window.qaSeeks.length,time:Number(document.querySelector('.deck-0 .pose-overlay')?.dataset.poseTime),calls:window.qaPoseFrames}));
 assert.equal(afterSeek.seeks,beforeSeek.seeks+1,'paused seek dispatches exactly its requested visible seek');
 assert.equal(afterSeek.calls,analysisCalls,'paused seek uses cached poses');
 assert.ok(Math.abs(afterSeek.time-5)<.2,'paused seek restores the requested source-time pose');

 // Mode changes and page fullscreen preserve the timeline and do not seek.
 const beforeMode=await page.evaluate(()=>({seeks:window.qaSeeks.length,calls:window.qaPoseFrames,time:Number(document.querySelector('.deck-0 .pose-overlay')?.dataset.poseTime)}));
 await page.getByRole('tab',{name:'重ねる',exact:true}).click();
 await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.qaSeeks.length),beforeMode.seeks,'overlay mode does not seek');
 await page.evaluate(()=>{Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});Object.defineProperty(document.documentElement,'webkitRequestFullscreen',{configurable:true,value:undefined});});
 await button('全画面にする').click();await page.locator('.studio-immersive').waitFor();
 await page.waitForTimeout(250);
 const afterFullscreen=await page.evaluate(()=>({seeks:window.qaSeeks.length,calls:window.qaPoseFrames,time:Number(document.querySelector('.deck-0 .pose-overlay')?.dataset.poseTime)}));
 assert.equal(afterFullscreen.seeks,beforeMode.seeks,'fullscreen does not seek');
 assert.equal(afterFullscreen.calls,analysisCalls,'fullscreen uses cached poses');
 assert.ok(Math.abs(afterFullscreen.time-beforeMode.time)<.2,'fullscreen preserves pose source time');
 await button('全画面を終了').click();await page.locator('.studio-immersive').waitFor({state:'hidden'});

 // OFF removes the overlay, and ON reuses the completed source-time cache.
 await page.getByRole('tab',{name:'比較',exact:true}).click();
 await button('自分の設定').click();await page.getByRole('tab',{name:'表示',exact:true}).click();
 await skeletonSwitch().click();await page.waitForFunction(()=>document.querySelectorAll('.deck-1 .pose-overlay').length===0);
 const disabledCalls=await page.evaluate(()=>window.qaPoseFrames);
 await skeletonSwitch().click();
 await page.waitForFunction(()=>document.querySelector('.deck-1 .recorded-pose-status')?.dataset.status==='ready',{},{timeout:15000});
 await page.waitForFunction(()=>document.querySelectorAll('.deck-1 .pose-overlay').length===1);
 assert.equal(await page.evaluate(()=>window.qaPoseFrames),disabledCalls,'re-enabling skeleton reuses the completed cache');
 await button('保存して戻る').click();await dismiss();

 // Hold the new worker response so a fast decoder cannot finish before the
 // loading assertion. A source replacement gets a new blob URL even for the same file.
 await page.evaluate(()=>{window.qaHoldPoses=true;});
 const oldUrl=await page.locator('.deck-1 video').getAttribute('src');
 await button('自分の設定').click();await page.getByRole('tab',{name:'動画',exact:true}).click();
 await page.getByLabel('自分の動画を選ぶ',{exact:true}).setInputFiles(files[0]);
 await page.waitForFunction(old=>document.querySelector('.deck-1 video')?.getAttribute('src')!==old,oldUrl);
 await page.getByRole('tab',{name:'表示',exact:true}).click();
 if(await skeletonSwitch().getAttribute('aria-checked')!=='true')await skeletonSwitch().click();
 await page.waitForFunction(()=>document.querySelector('.deck-1 .recorded-pose-status')?.dataset.status==='loading'&&window.qaHeldWorker,{},{timeout:15000});
 assert.equal(await page.locator('.deck-1 .pose-overlay').count(),0,'source replacement clears stale overlay');
 // Cancel an in-flight detection, then simulate a delayed response from its disposed worker.
 await skeletonSwitch().click();
 await page.waitForFunction(()=>document.querySelectorAll('body>video[aria-hidden="true"]').length===0);
 assert.ok(await page.evaluate(()=>window.qaHeldWorker.closed),'OFF terminates the waiting worker');
 await page.evaluate(()=>{window.qaHeldWorker.onmessage?.({data:{type:'poses',poses:[]}});window.qaHoldPoses=false;window.qaFailPose=true;});
 assert.equal(await page.locator('.deck-1 .pose-overlay').count(),0,'canceled result stays hidden');
 await skeletonSwitch().click();
 await page.waitForFunction(()=>document.querySelector('.deck-1 .recorded-pose-status')?.dataset.status==='error');
 await button('もう一度解析').click();
 await page.waitForFunction(()=>document.querySelector('.deck-1 .recorded-pose-status')?.dataset.status==='ready',{},{timeout:120000});
 assert.ok(await page.evaluate(()=>window.qaPoseFrames)>analysisCalls,'retry builds the replacement timeline');
 assert.deepEqual(errors,[]);
 console.log(`Recorded poses verified: ${analysisCalls} source-time worker frames, no inference during 0.5x/1.5x playback, rVFC timestamps/geometry, paused seek, mode/fullscreen, cache reuse, source replacement, cancellation and failure/retry.`);
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
