// Real canvas camera + MediaRecorder + encoded video. Only the OS share endpoint
// is stubbed: desktop tests cannot confirm an iPhone's Photos library contents.
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
 const page=await browser.newPage({viewport:{width:393,height:760}}),errors=[],downloads=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d.suggestedFilename()));
 await page.addInitScript(()=>{
  window.qaRecorderEvents=[];const Recorder=window.MediaRecorder;window.MediaRecorder=class extends Recorder{constructor(...args){super(...args);window.qaRecorder=this;for(const name of ['start','stop','dataavailable','error'])this.addEventListener(name,e=>window.qaRecorderEvents.push({name,state:this.state,bytes:e.data?.size,error:e.error?.message}));}};
  window.qaShares=[];window.qaShareMode='ok';window.qaUnsupported=false;window.qaExpired=false;window.qaFrames=0;
  Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});
  const activation=navigator.userActivation;Object.defineProperty(navigator,'userActivation',{get:()=>({isActive:!window.qaExpired&&activation.isActive})});
  Object.defineProperty(navigator,'canShare',{configurable:true,value:data=>!window.qaUnsupported&&data.files?.length===1&&data.files[0] instanceof File});
  Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
   const file=data.files[0];window.qaShares.push({file,keys:Object.keys(data),active:navigator.userActivation.isActive});
   if(window.qaShareMode==='pending')await new Promise(resolve=>window.qaResolveShare=resolve);
   if(window.qaShareMode==='cancel')throw new DOMException('cancelled','AbortError');
   if(window.qaShareMode==='blocked')throw new DOMException('activation expired','NotAllowedError');
   if(window.qaShareMode==='error')throw new DOMException('OS failed','DataError');
  }});
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');
   const draw=()=>{ctx.fillStyle='#385cd4';ctx.fillRect(0,0,640,360);ctx.fillStyle='#dbff69';ctx.fillRect((window.qaFrames++*4)%560,100,80,80);};draw();
   const stream=canvas.captureStream(30),timer=setInterval(draw,33);window.qaCamera=stream;
   const track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};return stream;
  }});
 });
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 const button=name=>page.getByRole('button',{name,exact:true}),dialog=page.getByRole('dialog',{name:'録画を保存',exact:true});
 const screenshot=async name=>{if(process.env.RECORDING_QA_DIR){await mkdir(process.env.RECORDING_QA_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.RECORDING_QA_DIR,name+'.png')});}};
 const shares=()=>page.evaluate(()=>window.qaShares.map(({file,keys,active})=>({name:file.name,size:file.size,type:file.type,keys,active})));
 async function record(){await button('録画開始').click();await button('録画停止').waitFor();const start=await page.evaluate(()=>window.qaFrames);await page.waitForFunction(n=>window.qaFrames>n+60,start);}
 async function stopAndWait(count){await button('録画停止').click();await page.waitForFunction(n=>window.qaShares.length===n,count).catch(async e=>{console.log(await page.locator('body').innerText(),await page.evaluate(()=>({shares:window.qaShares.length,active:navigator.userActivation.isActive,visible:document.visibilityState,recorder:window.qaRecorder?.state,events:window.qaRecorderEvents,live:document.querySelector('.deck-1 video')?.paused})),errors);throw e;});}
 await button('インカメ').click();await page.waitForFunction(()=>document.querySelector('.deck-1 video')?.readyState>=2);
 await record();await stopAndWait(1);await dialog.waitFor({state:'hidden'});
 const first=(await shares())[0];assert.deepEqual(first.keys,['files']);assert.ok(first.active);assert.ok(first.size>1000);assert.match(first.type,/^video\/(mp4|webm)$/);assert.deepEqual(downloads,[],'stopping never silently downloads to Files');
 // Cancel keeps the exact completed recording for retry and a real preview.
 await page.evaluate(()=>window.qaShareMode='cancel');await button('録画を保存').click();await dialog.waitFor();await page.waitForFunction(()=>window.qaShares.length===2);
 const preview=page.getByLabel('録画した動画の確認',{exact:true});await preview.evaluate(async v=>{if(v.readyState<2)await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;});});
 const dimensions=await preview.evaluate(v=>({width:v.videoWidth,height:v.videoHeight}));assert.deepEqual(dimensions,{width:1280,height:720});
 const saveLabel=first.type==='video/mp4'?'写真に保存':'保存先を選ぶ';await button(saveLabel).waitFor();await screenshot('recording-save-portrait');
 await page.setViewportSize({width:844,height:390});await screenshot('recording-save-landscape');
 for(const size of [{width:393,height:760},{width:844,height:390}]){await page.setViewportSize(size);const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=size.width+1&&bounds.y+bounds.height<=size.height+1,'save dialog fits viewport');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:393,height:760});await page.evaluate(()=>window.qaShareMode='ok');await button(saveLabel).click();await dialog.waitFor({state:'hidden'});assert.equal((await shares()).length,3);assert.deepEqual(downloads,[]);
 // If finalization outlasts activation, the stop still presents a one-tap save.
 await record();await page.evaluate(()=>window.qaExpired=true);await button('録画停止').click();await dialog.waitFor();await button(saveLabel).waitFor();assert.equal((await shares()).length,3);
 await page.evaluate(()=>window.qaExpired=false);await button(saveLabel).click();await dialog.waitFor({state:'hidden'});assert.equal((await shares()).length,4);
 // Browser refusal after an active tap must be retryable too.
 await page.evaluate(()=>window.qaShareMode='blocked');await record();await stopAndWait(5);await dialog.waitFor();await button(saveLabel).waitFor();assert.equal(await button(saveLabel).isEnabled(),true);
 await page.evaluate(()=>window.qaShareMode='error');await button(saveLabel).click();await page.getByRole('status').filter({hasText:'保存メニューを開けませんでした'}).waitFor();
 await button('練習に戻る').click();await page.evaluate(()=>window.qaShareMode='ok');await button('録画を保存').click();await dialog.waitFor({state:'hidden'});assert.equal((await shares()).length,7);
 // The platform may not support file sharing. Keep an explicit file fallback.
 await page.evaluate(()=>window.qaUnsupported=true);await record();await button('録画停止').click();await dialog.waitFor();assert.equal((await shares()).length,7);assert.deepEqual(downloads,[]);
 const fileDownload=page.getByRole('link',{name:'ファイルに保存',exact:true});await fileDownload.waitFor();const download=page.waitForEvent('download');await fileDownload.click();await download;assert.equal(downloads.length,1);
 await button('練習に戻る').click();await page.evaluate(()=>{window.qaUnsupported=false;window.qaShareMode='pending';});
 // A slow OS share promise must not duplicate requests or dismiss a newer clip.
 await record();await stopAndWait(8);await dialog.waitFor();assert.equal(await dialog.locator('button').filter({hasText:'保存メニューを開いています'}).isDisabled(),true);
 await button('練習に戻る').click();await record();await button('録画停止').click();await dialog.waitFor();const newer=await preview.getAttribute('src');
 await page.evaluate(()=>{window.qaShareMode='ok';window.qaResolveShare();});await button(saveLabel).waitFor();assert.equal(await preview.getAttribute('src'),newer);assert.equal((await shares()).length,8);
 await button(saveLabel).click();await dialog.waitFor({state:'hidden'});assert.equal((await shares()).length,9);
 const last=await page.evaluate(()=>({same:window.qaShares[8].file===window.qaShares[7].file,live:window.qaCamera.getVideoTracks()[0].readyState}));assert.equal(last.same,false);assert.equal(last.live,'live');
 // An input ending inside fullscreen must expose the save retry above the page.
 const reference=await page.evaluate(async()=>({name:window.qaShares[0].file.name,type:window.qaShares[0].file.type,bytes:Array.from(new Uint8Array(await window.qaShares[0].file.arrayBuffer()))}));
 await page.getByLabel('お手本の動画を選ぶ',{exact:true}).setInputFiles({name:reference.name,mimeType:reference.type,buffer:Buffer.from(reference.bytes)});await page.waitForFunction(()=>document.querySelector('.deck-0 video')?.readyState>=2);
 await record();await button('全画面にする').click();await page.locator('.studio-immersive').waitFor();
 await page.evaluate(()=>{window.qaExpired=true;const track=window.qaCamera.getVideoTracks()[0];track.stop();track.dispatchEvent(new Event('ended'));});
 await dialog.waitFor();await page.locator('.studio-immersive').waitFor({state:'hidden'});await button(saveLabel).waitFor();assert.equal((await shares()).length,9);
 assert.deepEqual(errors,[]);console.log('Recording-save browser checks passed: actual encoded video, automatic share handoff, cancel/retry, expired gesture, OS failure, explicit fallback, late promise/new recording, camera remains live.',first,dimensions);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
