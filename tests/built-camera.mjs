// Exercise real preview/recording with synthetic front/rear camera streams (no device permissions).
import {readFile,mkdir} from 'node:fs/promises';
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
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:390,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__cameras=[];window.__cameraCalls=[];window.__failRear=false;window.__deferCamera=false;
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async constraints=>{
   const facing=typeof constraints.video.facingMode==='string'?constraints.video.facingMode:constraints.video.facingMode.exact;
   window.__cameraCalls.push({facing,live:window.__cameras.filter(c=>c.track.readyState==='live').length});
   if(facing==='environment'&&window.__failRear)throw new DOMException('No rear lens','OverconstrainedError');
   if(window.__deferCamera){window.__deferCamera=false;await new Promise(resolve=>window.__resolveCamera=resolve);}
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');let n=0;
   const draw=()=>{ctx.fillStyle=facing==='user'?'#8040e0':'#40e060';ctx.fillRect(0,0,640,360);ctx.fillStyle='white';ctx.fillRect(n++%560,100,80,80);};draw();
   const stream=canvas.captureStream(30),track=stream.getVideoTracks()[0],stop=track.stop.bind(track),timer=setInterval(draw,33);
   const settings=track.getSettings.bind(track);track.getSettings=()=>({...settings(),facingMode:facing});
   track.stop=()=>{clearInterval(timer);stop();};window.__cameras.push({track,stream,canvas,facing});return stream;
  }});
 });
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 const button=name=>page.getByRole('button',{name,exact:true});
 const dismiss=async()=>{if(await button('メッセージを閉じる').count())await button('メッセージを閉じる').click();};
 const live=async facing=>{await page.waitForFunction(f=>{const v=document.querySelector('video[aria-label="自分の映像"]');return v?.srcObject?.getVideoTracks()[0]?.getSettings().facingMode===f&&!v.paused&&v.readyState>=2;},facing);await dismiss();};
 assert.equal(await page.evaluate(()=>window.__cameraCalls.length),0,'camera never starts without a user choice');
 const screenshot=async name=>{if(process.env.CAMERA_QA_DIR){await mkdir(process.env.CAMERA_QA_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.CAMERA_QA_DIR,name+'.png')});}};
 await screenshot('camera-choices');
 await page.evaluate(()=>window.__failRear=true);await button('外カメ').click();await page.getByRole('status').filter({hasText:'外カメが見つかりません'}).waitFor();await dismiss();assert.equal(await page.evaluate(()=>window.__cameras.length),0);await page.evaluate(()=>window.__failRear=false);
 await button('外カメ').click();await live('environment');
 assert.equal(await page.locator('.deck-1 .filename').textContent(),'外カメ');
 assert.equal(await page.locator('.deck-1 video').evaluate(v=>v.style.transform),'scaleX(1)','rear preview is not mirrored');
 await button('インカメに切り替える').click();await live('user');
 await page.getByRole('button',{name:'自分の設定',exact:true}).click();await page.getByRole('tab',{name:'動画',exact:true}).click();
 await button('外カメ').click();await live('environment');
 await page.getByLabel('お手本の動画を選ぶ',{exact:true}).setInputFiles(fixture);await page.waitForFunction(()=>document.querySelector('.deck-0 video')?.duration>=12);
 await button('お手本を再生').click();await page.waitForFunction(()=>{const v=document.querySelector('.deck-0 video');return !v.paused&&v.currentTime>.1;});await dismiss();
 await button('録画開始').click();await button('録画停止').waitFor();await dismiss();
 assert.equal(await button('インカメに切り替える').isDisabled(),true,'lens switching cannot interrupt a recording');
 await button('練習速度と鳴らす音を設定').click();await page.getByLabel('練習速度（詳細）',{exact:true}).fill('0.75');await page.getByLabel('練習速度（詳細）',{exact:true}).press('Tab');
 await page.waitForFunction(()=>document.querySelector('.deck-0 video').playbackRate===.75);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.deck-0 video').currentTime>1.5);
 const cameraTrack=await page.evaluate(()=>{window.__fullscreenCamera=document.querySelector('.deck-1 video').srcObject;return window.__fullscreenCamera.getVideoTracks()[0].id;});
 // Linux headless Chrome cannot resize its native fullscreen window. Rotate the
 // recording first; in-fullscreen rotation is covered by built-viewer's page mode.
 await page.setViewportSize({width:844,height:390});await button('全画面にする').click();await page.locator('.studio-immersive').waitFor();await page.waitForTimeout(3500);
 assert.equal(await page.locator('.fullscreen-player-controls').getAttribute('data-visible'),'false');
 assert.equal(await page.evaluate(()=>document.querySelector('.deck-1 video').srcObject.getVideoTracks()[0].id),cameraTrack);
 assert.equal(await page.evaluate(()=>window.__fullscreenCamera.getVideoTracks()[0].readyState),'live');
 await button('再生コントロールを表示').click({position:{x:100,y:100}});await button('全画面を終了').click();await page.locator('.studio-immersive').waitFor({state:'hidden'});await page.setViewportSize({width:390,height:700});
 await button('録画停止').click();await page.getByRole('link',{name:'録画を保存',exact:true}).waitFor();await dismiss();
 const recorded=await page.getByRole('link',{name:'録画を保存',exact:true}).getAttribute('href');
 const dimensions=await page.evaluate(async url=>{const blob=await fetch(url).then(r=>r.blob());const v=document.createElement('video');v.muted=true;v.src=url;await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;});const frame=new Promise(resolve=>v.requestVideoFrameCallback(resolve));await v.play();await frame;v.pause();const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext('2d');ctx.drawImage(v,0,0);const pixel=Array.from(ctx.getImageData(640,600,1,1).data);return {width:v.videoWidth,height:v.videoHeight,bytes:blob.size,pixel};},recorded);
 console.log('Recording frame check',dimensions);assert.equal(dimensions.width,1280);assert.equal(dimensions.height,720);assert.ok(dimensions.bytes>1000);assert.ok(dimensions.pixel[1]>dimensions.pixel[0]*1.5&&dimensions.pixel[1]>dimensions.pixel[2]*1.5,'saved frames are from the green rear camera, not black or the front camera');
 await page.getByRole('tab',{name:'重ねる',exact:true}).click();await live('environment');
 const layout=async()=>{const buttons=await page.locator('.deck-1 .tool-rail button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));assert.equal(buttons.length,5);for(const b of buttons){assert.ok(b.w>25&&b.h>20,JSON.stringify(b));}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);};
 await layout();await screenshot('rear-overlay-portrait');await page.setViewportSize({width:844,height:390});await layout();await screenshot('rear-overlay-landscape');await page.setViewportSize({width:390,height:700});
 await button('インカメに切り替える').click();await live('user');
 await page.evaluate(()=>window.__failRear=true);await button('外カメに切り替える').click();await page.getByRole('status').filter({hasText:'インカメに戻しました'}).waitFor();await live('user');
 assert.ok((await page.evaluate(()=>window.__cameraCalls)).every(c=>c.live===0),'release previous camera before opening another (iOS)');
 await page.evaluate(()=>{window.__failRear=false;window.__deferCamera=true;});await button('外カメに切り替える').click();
 await page.waitForFunction(()=>!!window.__resolveCamera);await page.getByLabel('自分の動画を選ぶ',{exact:true}).setInputFiles(fixture);await page.evaluate(()=>window.__resolveCamera());
 await page.waitForFunction(()=>window.__cameras.every(c=>c.track.readyState==='ended'));
 assert.equal(await page.locator('.deck-1 video').evaluate(v=>v.srcObject),null,'late camera permission response cannot replace newly selected video');
 assert.deepEqual(errors,[]);console.log('Camera browser checks passed: both entry points, lens switching/recovery, recording + speed, overlay, layout, cancellation.',dimensions);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
