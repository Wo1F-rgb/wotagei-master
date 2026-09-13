// Browser regression coverage for the physical-lens and digital-zoom camera UI.
// The camera source is a real canvas capture stream. No fake <video> elements or
// hardware camera permissions are used; MediaRecorder encodes the generated stream.
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {inflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const fixture=fileURLToPath(new URL('./fixtures/synthetic-150-aac.mov',import.meta.url));
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.wasm':'application/wasm','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));

// Decode the small PNGs returned by page.screenshot without adding an image
// package just for this test. Chromium emits 8-bit RGB(A), non-interlaced PNGs.
function screenshotPixel(buffer,x,y){
 const png=Buffer.from(buffer),signature=Buffer.from([137,80,78,71,13,10,26,10]);assert.deepEqual(png.subarray(0,8),signature);
 let offset=8,width=0,height=0,colorType=6,parts=[];
 while(offset<png.length){const length=png.readUInt32BE(offset);const type=png.toString('ascii',offset+4,offset+8);const body=png.subarray(offset+8,offset+8+length);offset+=12+length;
  if(type==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);colorType=body[9];assert.equal(body[8],8);assert.equal(body[12],0);}
  if(type==='IDAT')parts.push(body);
  if(type==='IEND')break;
 }
 assert.ok(width>0&&height>0);assert.ok(colorType===2||colorType===6);
 x=Math.max(0,Math.min(width-1,Math.round(x)));y=Math.max(0,Math.min(height-1,Math.round(y)));
 const channels=colorType===6?4:3,raw=inflateSync(Buffer.concat(parts)),stride=width*channels;let cursor=0,previous=Buffer.alloc(stride);
 for(let row=0;row<=y;row++){
  const filter=raw[cursor++],current=Buffer.alloc(stride);
  for(let i=0;i<stride;i++){
   const value=raw[cursor++],left=i>=channels?current[i-channels]:0,up=previous[i]||0,upLeft=i>=channels?previous[i-channels]||0:0;
   current[i]=(value+(filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,upLeft):0))&255;
  }
  previous=current;
 }
 const i=x*channels;return [previous[i],previous[i+1],previous[i+2],channels===4?previous[i+3]:255];
}
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function isRed([r,g,b]){return r>g*1.35&&r>b*1.35;}
function isBlue([r,g,b]){return b>r*1.35&&b>g*1.2;}
function isGreen([r,g,b]){return g>r*1.35&&g>b*1.35;}

let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:390,height:700},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  // The world is 640x360. Ultra-wide sees all of it: blue edge, red middle,
  // green center/right. The wide physical lens sees world x=160..480, so a
  // further digital 2x crop is centered on the green boundary.
  const devices={
   front:{id:'front-camera',label:'Front Camera',facing:'user',kind:'other',crop:null,zoom:{min:1,max:1,step:.1}},
   ultra:{id:'rear-ultra-camera',label:'背面超広角カメラ',facing:'environment',kind:'ultrawide',crop:null,zoom:{min:1,max:2,step:.1}},
   wide:{id:'rear-wide-camera',label:'Back Wide Angle Camera',facing:'environment',kind:'wide',crop:{x:160,y:90,width:320,height:180},zoom:{min:1,max:1,step:.1}},
   tele:{id:'rear-tele-camera',label:'Back Telephoto Camera',facing:'environment',kind:'telephoto',crop:{x:205,y:115,width:230,height:130},zoom:{min:1,max:4,step:.1}},
  };
  window.__qaCameraMode='missing-ultra';window.__qaFailId='';window.__qaDeferNext=false;window.__qaResolveCamera=null;
  window.__qaCameras=[];window.__qaCameraCalls=[];window.__qaZoomApplies=[];window.__qaWorldFrames=0;
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});
  const visible=()=>{const all=Object.values(devices);if(window.__qaCameraMode==='missing-ultra')return all.filter(d=>d!==devices.ultra);if(window.__qaCameraMode==='ultra-only')return all.filter(d=>d===devices.front||d===devices.ultra);return all;};
  const requestedFacing=video=>{const f=video?.facingMode;if(typeof f==='string')return f;return f?.exact||f?.ideal||'user';};
  const exactDevice=video=>{const d=video?.deviceId;return typeof d==='string'?d:d?.exact||d?.ideal||'';};
  const makeWorld=()=>{const world=document.createElement('canvas');world.width=640;world.height=360;const c=world.getContext('2d');c.fillStyle='#2f63dc';c.fillRect(0,0,640,360);c.fillStyle='#dd443d';c.fillRect(160,0,140,360);c.fillStyle='#36c96b';c.fillRect(300,0,340,360);return world;};
  Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{configurable:true,value:async()=>visible().map(d=>({kind:'videoinput',deviceId:d.id,label:d.label,getCapabilities:()=>({facingMode:[d.facing]})}))});
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async constraints=>{
   const video=constraints?.video||{},facing=requestedFacing(video),requested=exactDevice(video),list=visible();
   const selected=list.find(d=>d.id===requested)||(facing==='user'?list.find(d=>d.facing==='user'):list.find(d=>d.kind==='wide')||list.find(d=>d.facing==='environment'));
   const live=window.__qaCameras.filter(c=>c.track.readyState==='live').length;
   window.__qaCameraCalls.push({requestedId:requested||null,facing,live,mode:window.__qaCameraMode});
   if(!selected||selected.facing!==facing||window.__qaFailId===selected.id)throw new DOMException('Requested camera is unavailable','OverconstrainedError');
   if(window.__qaDeferNext){window.__qaDeferNext=false;await new Promise(resolve=>{window.__qaResolveCamera=resolve;});}
   const world=makeWorld(),canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');let nativeZoom=1,timer;
   const redraw=()=>{const source=selected.crop||{x:0,y:0,width:640,height:360};const crop={...source};if(nativeZoom>1){crop.x+=crop.width*(1-1/nativeZoom)/2;crop.y+=crop.height*(1-1/nativeZoom)/2;crop.width/=nativeZoom;crop.height/=nativeZoom;}ctx.drawImage(world,crop.x,crop.y,crop.width,crop.height,0,0,640,360);window.__qaWorldFrames++;};
   redraw();const stream=canvas.captureStream(30),track=stream.getVideoTracks()[0],stop=track.stop.bind(track);timer=setInterval(redraw,33);
   const originalSettings=track.getSettings.bind(track),originalCapabilities=track.getCapabilities?.bind(track),originalConstraints=track.getConstraints?.bind(track);
   track.getSettings=()=>({...originalSettings(),deviceId:selected.id,facingMode:selected.facing,zoom:nativeZoom});
   track.getCapabilities=()=>({...(originalCapabilities?originalCapabilities():{}),zoom:selected.zoom});
   track.getConstraints=()=>({...((originalConstraints&&originalConstraints())||{width:{ideal:1280},height:{ideal:720},frameRate:{max:30}})});
   track.applyConstraints=async next=>{const exact=next?.zoom?.exact;if(typeof exact==='number')nativeZoom=exact;window.__qaZoomApplies.push({deviceId:selected.id,zoom:exact??null});redraw();};
   track.stop=()=>{clearInterval(timer);stop();};window.__qaCameras.push({id:selected.id,track,stream,canvas,world,get nativeZoom(){return nativeZoom;}});return stream;
  }});
 });

 const base=process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`;
 await page.goto(base);
 const button=name=>page.getByRole('button',{name,exact:true});
 const status=text=>page.getByRole('status').filter({hasText:text});
 const dialog=page.getByRole('dialog',{name:'録画を保存',exact:true});
 const screenshot=async(name,options={})=>{if(process.env.CAMERA_ZOOM_QA_DIR){await mkdir(resolve(process.env.CAMERA_ZOOM_QA_DIR),{recursive:true});await page.screenshot({path:resolve(process.env.CAMERA_ZOOM_QA_DIR,name+'.png'),...options});}};
 const live=async(facing,id)=>{await page.waitForFunction(({facing,id})=>{const v=document.querySelector('video[aria-label="自分の映像"]'),t=v?.srcObject?.getVideoTracks()[0],record=document.querySelector('button[aria-label="録画開始"]');return t?.readyState==='live'&&v?.readyState>=2&&t.getSettings().facingMode===facing&&(!id||t.getSettings().deviceId===id)&&!record?.disabled;},{facing,id});};
 const lens=()=>page.getByRole('group',{name:'カメラ倍率',exact:true});
 const zoomButton=value=>button(`カメラ${value}倍`);
 const state=()=>page.evaluate(()=>{const v=document.querySelector('video[aria-label="自分の映像"]'),t=v?.srcObject?.getVideoTracks()[0];return {settings:t?.getSettings(),cameras:window.__qaCameras.map(c=>({id:c.id,state:c.track.readyState,nativeZoom:c.nativeZoom})),calls:window.__qaCameraCalls,applies:window.__qaZoomApplies};});
 const qaPreviewPixel=async(name,xRatio,yRatio=.45)=>{const stage=page.locator('.deck-1 .video-stage'),box=await stage.boundingBox();assert.ok(box&&box.width>0&&box.height>0);const clip={x:Math.max(0,box.x),y:Math.max(0,box.y),width:box.width,height:box.height};const png=await page.screenshot({clip});await screenshot(name,{clip});return screenshotPixel(png,png.readUInt32BE(16)*xRatio,png.readUInt32BE(20)*yRatio);};
 const decodeRecorded=async href=>page.evaluate(async url=>{const blob=await fetch(url).then(r=>r.blob()),v=document.createElement('video');v.muted=true;v.playsInline=true;v.src=url;await new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=reject;});await v.play();await new Promise(resolve=>v.requestVideoFrameCallback(()=>resolve()));const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const x=c.getContext('2d');x.drawImage(v,0,0);const p=(px,py)=>Array.from(x.getImageData(px,py,1,1).data);return {bytes:blob.size,type:blob.type,width:v.videoWidth,height:v.videoHeight,left:p(80,360),cropProbe:p(512,360),center:p(640,360),right:p(1120,360)};},href);
 const record=async()=>{await button('録画開始').click();await status('● REC').waitFor();const start=await page.evaluate(()=>window.__qaWorldFrames);await page.waitForFunction(n=>window.__qaWorldFrames>n+60,start);await button('録画停止').click();await dialog.waitFor();const href=await page.getByRole('link',{name:'ファイルに保存',exact:true}).getAttribute('href');assert.ok(href);const decoded=await decodeRecorded(href);await page.getByRole('button',{name:'練習に戻る',exact:true}).click();await dialog.waitFor({state:'hidden'});return decoded;};

 // No device order or label guessing can create a missing ultra-wide camera.
 await button('外カメ').click();await live('environment','rear-wide-camera');assert.equal(await zoomButton(.5).isDisabled(),true,'missing ultra-wide stays unavailable');
 await button('インカメに切り替える').click();await live('user','front-camera');
 await page.evaluate(()=>window.__qaCameraMode='full');await button('外カメに切り替える').click();await live('environment','rear-wide-camera');

 // The actual 0.5x action must request the exact physical ultra device and
 // release the old stream before getUserMedia is called.
 await zoomButton(.5).click();await live('environment','rear-ultra-camera');let current=await state();assert.equal(current.settings.deviceId,'rear-ultra-camera');assert.ok(current.calls.at(-1).live===0,'old stream released before exact ultra request');assert.match(await page.locator('.deck-1 .filename').textContent(),/外カメ · 超広角/);
 const halfPreview=await qaPreviewPixel('camera-zoom-0_5-preview',.12);assert.ok(isBlue(halfPreview),`0.5x preview keeps the blue ultra-wide edge: ${halfPreview}`);
 await screenshot('camera-zoom-0_5-full');

 // Return to the standard wide lens, then verify the manual settings selector
 // also acquires the same exact device.
 await zoomButton(1).click();await live('environment','rear-wide-camera');assert.equal((await lens().getByRole('button',{name:'カメラ1倍'}).getAttribute('aria-pressed')),'true');
 await page.getByRole('button',{name:'自分の設定',exact:true}).click();await page.getByRole('tab',{name:'動画',exact:true}).click();const lensSelect=page.getByLabel('使用するカメラのレンズ',{exact:true});await lensSelect.waitFor();assert.ok(await lensSelect.locator('option').evaluateAll(options=>options.some(o=>o.textContent?.includes('背面超広角カメラ'))));await lensSelect.selectOption('rear-tele-camera');await live('environment','rear-tele-camera');await page.waitForFunction(()=>document.querySelector('select[aria-label="使用するカメラのレンズ"]')?.value==='rear-tele-camera');
 // Select the wide physical lens again before testing its digital fallback.
 await lensSelect.selectOption('rear-wide-camera');await live('environment','rear-wide-camera');await page.waitForFunction(()=>document.querySelector('select[aria-label="使用するカメラのレンズ"]')?.value==='rear-wide-camera');
 await page.getByRole('button',{name:'自分の設定',exact:true}).click();
 const onePreview=await qaPreviewPixel('camera-zoom-1-standard-preview',.4);assert.ok(isRed(onePreview),`1x crop boundary starts red: ${onePreview}`);
 await zoomButton(2).click();await page.waitForFunction(()=>document.querySelector('video[aria-label="自分の映像"]')?.srcObject?.getVideoTracks()[0]?.getSettings().deviceId==='rear-wide-camera'&&!document.querySelector('button[aria-label="録画開始"]')?.disabled);await page.waitForTimeout(200);
 current=await state();assert.equal(current.settings.deviceId,'rear-wide-camera');assert.equal(current.settings.zoom,1,'wide synthetic track has no usable hardware zoom');assert.ok((await page.evaluate(()=>window.__qaZoomApplies)).at(-1).zoom===1,'hardware probe preserved the wide stream');
 const digitalPreview=await qaPreviewPixel('camera-zoom-2-digital-preview',.4);assert.ok(isGreen(digitalPreview),`2x preview is the centered green world: ${digitalPreview}`);await screenshot('camera-zoom-2-digital-full');

 // Zoom and lens controls are locked while the real recorder is running.
 await page.getByRole('button',{name:'自分の設定',exact:true}).click();await page.getByRole('tab',{name:'動画',exact:true}).click();await lensSelect.waitFor();await button('録画開始').click();await status('● REC').waitFor();assert.equal(await zoomButton(2).isDisabled(),true);assert.equal(await lens().getByLabel('カメラ0.5倍',{exact:true}).isDisabled(),true);assert.equal(await lensSelect.isDisabled(),true);const recordingStart=await page.evaluate(()=>window.__qaWorldFrames);await page.waitForFunction(n=>window.__qaWorldFrames>n+60,recordingStart);await button('録画停止').click();await dialog.waitFor();await page.getByRole('button',{name:'練習に戻る',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'自分の設定',exact:true}).click();

 // The saved MP4 and the preview must represent the same central crop.
 const saved2x=await record();assert.equal(saved2x.width,1280);assert.equal(saved2x.height,720);assert.ok(saved2x.bytes>1000);assert.match(saved2x.type,/^video\/(mp4|webm)$/);assert.ok(isGreen(saved2x.cropProbe),`2x moves the 1x red crop boundary into green: ${saved2x.cropProbe}`);assert.ok(isGreen(saved2x.center),`2x saved center is green: ${saved2x.center}`);assert.ok(isGreen(saved2x.right),`2x saved right is green: ${saved2x.right}`);assert.ok(!isBlue(saved2x.center),'2x saved frame is not the ultra-wide blue edge');
 // Return to 0.5x and save a second real clip to prove the two recordings are
 // observing different lenses, not merely sharing a CSS transform.
 await zoomButton(.5).click();await live('environment','rear-ultra-camera');const savedHalf=await record();assert.equal(savedHalf.width,1280);assert.equal(savedHalf.height,720);assert.ok(savedHalf.bytes>1000);assert.ok(isBlue(savedHalf.left),`0.5x saved left is blue: ${savedHalf.left}`);assert.ok(!isGreen(savedHalf.left),'0.5x saved frame did not use the central green crop');

 // Check native zoom independently with only the ultra-wide lens exposed. At
 // 1x, base .5 plus native zoom 2 is the requested physical 1x image.
 await page.evaluate(()=>window.__qaCameraMode='ultra-only');await button('インカメに切り替える').click();await live('user','front-camera');await button('外カメに切り替える').click();await live('environment','rear-ultra-camera');await zoomButton(1).click();await page.waitForFunction(()=>{const t=document.querySelector('video[aria-label="自分の映像"]')?.srcObject?.getVideoTracks()[0];return t?.getSettings().deviceId==='rear-ultra-camera'&&t.getSettings().zoom===2;});current=await state();assert.equal(current.settings.zoom,2);assert.equal(current.cameras.at(-1).nativeZoom,2);assert.ok(current.applies.some(c=>c.deviceId==='rear-ultra-camera'&&c.zoom===2),'native zoom constraint reached synthetic track');const nativePreview=await qaPreviewPixel('camera-zoom-1-native-preview',.5);assert.ok(isGreen(nativePreview),`native 1x preview is the rendered green crop: ${nativePreview}`);await screenshot('camera-zoom-1-native-full');

 // Failed manual lens acquisition must restore the exact old device and its
 // previous zoom. The old stream is stopped before both attempts.
 await page.evaluate(()=>window.__qaCameraMode='full');await button('インカメに切り替える').click();await live('user','front-camera');await button('外カメに切り替える').click();await live('environment','rear-wide-camera');await page.getByRole('button',{name:'自分の設定',exact:true}).click();await page.getByRole('tab',{name:'動画',exact:true}).click();const selectAgain=page.getByLabel('使用するカメラのレンズ',{exact:true});await selectAgain.selectOption('rear-wide-camera');await live('environment','rear-wide-camera');await zoomButton(2).click();await page.waitForFunction(()=>!document.querySelector('button[aria-label="録画開始"]')?.disabled);const beforeFailure=await state();assert.equal(beforeFailure.settings.deviceId,'rear-wide-camera');await page.evaluate(()=>window.__qaFailId='rear-tele-camera');await selectAgain.selectOption('rear-tele-camera');await status('レンズに切替不可・外カメに戻しました').waitFor();await live('environment','rear-wide-camera');const afterFailure=await state();assert.equal(afterFailure.settings.deviceId,'rear-wide-camera');assert.equal(afterFailure.settings.zoom,1);assert.ok(afterFailure.cameras.at(-1).nativeZoom===1);assert.equal(await selectAgain.inputValue(),'rear-wide-camera');assert.equal(await zoomButton(2).getAttribute('aria-pressed'),'true','restored previous digital zoom state');assert.equal(await lens().locator('small').textContent(),'デジタル');assert.ok(afterFailure.calls.slice(-2).every(c=>c.live===0),'failed exact lens and exact restoration both released prior tracks');await page.evaluate(()=>window.__qaFailId='');
 await page.getByRole('button',{name:'自分の設定',exact:true}).click();

 // Verify portrait and landscape layouts keep controls reachable and avoid
 // page overflow, including the narrow mobile viewport used by the feature.
 if(await button('メッセージを閉じる').count())await button('メッセージを閉じる').click();
 const fits=async()=>{const size=await page.evaluate(()=>({width:innerWidth,height:innerHeight})),overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1);assert.equal(overflow,false,`no page overflow at ${size.width}x${size.height}`);const box=await lens().boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1);const save=await page.locator('.deck-1 .recording-save').boundingBox();if(save)assert.ok(save.x+save.width<=box.x||box.x+box.width<=save.x||save.y+save.height<=box.y||box.y+box.height<=save.y,'recording save and zoom controls do not overlap');};
 await fits();await page.setViewportSize({width:844,height:390});await fits();await screenshot('camera-zoom-landscape');await page.setViewportSize({width:390,height:700});await fits();await screenshot('camera-zoom-portrait');

 // A late permission result must not replace a newer file selection. Keep the
 // input deferred, select a real fixture, then resolve the stale getUserMedia.
 await page.getByRole('button',{name:'自分の設定',exact:true}).click();await page.getByRole('tab',{name:'動画',exact:true}).click();await page.evaluate(()=>window.__qaDeferNext=true);await button('インカメに切り替える').click();await page.waitForFunction(()=>window.__qaResolveCamera!==null);await page.getByLabel('自分の動画を選ぶ',{exact:true}).setInputFiles(fixture);await page.evaluate(()=>window.__qaResolveCamera?.());await page.waitForFunction(()=>window.__qaCameras.every(c=>c.track.readyState==='ended'));assert.equal(await page.evaluate(()=>document.querySelector('video[aria-label="自分の映像"]')?.srcObject),null,'stale permission result cannot replace selected video');

 assert.deepEqual(errors,[]);console.log('Camera-zoom browser checks passed: exact ultra/wide lenses, real preview and MP4 crops, native zoom, digital fallback, manual selection/recovery, recording lock, stale permission, and portrait/landscape fit.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
