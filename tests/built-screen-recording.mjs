// OS screen recording is deliberately not mocked as a successful recording.
// Default: deterministic IFrame API double + real camera frames for UI/lifecycle.
// SCREEN_REAL_YOUTUBE=1: real iframe, and real desktop tab-audio MP4 capture.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const real=process.env.SCREEN_REAL_YOUTUBE==='1',qa=process.env.SCREEN_QA_DIR;
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results={realYouTube:real,osRecordingVerified:false,layouts:[]};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required',...(real?['--enable-usermedia-screen-capturing','--auto-accept-this-tab-capture','--auto-select-tab-capture-source-by-title=ヲタ芸マスター']:[])]});
 const page=await browser.newPage({viewport:{width:390,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({real})=>{
  window.qaTools={};document.modelContext={registerTool(t){window.qaTools[t.name]=t;}};
  window.qaRecordings=[];window.qaInputs=[];window.qaFrames=0;
  const Recorder=window.MediaRecorder;window.MediaRecorder=class extends Recorder{constructor(...args){super(...args);window.qaRecordings.push(this);}};
  window.qaDesktopUA=navigator.userAgent;if(!real)Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)'});
  window.qaDisplay=navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices);
  Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:undefined});
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async options=>{
   window.qaInputs.push(options);if(options.audio)throw Error('Screen route must not request a microphone');
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');
   const draw=()=>{ctx.fillStyle='#48378b';ctx.fillRect(0,0,640,360);ctx.fillStyle='#cdfa69';ctx.fillRect((window.qaFrames++*5)%550,100,80,80);};draw();
   const stream=canvas.captureStream(30),track=stream.getVideoTracks()[0],stop=track.stop.bind(track),timer=setInterval(draw,33);
   track.stop=()=>{clearInterval(timer);stop();};window.qaCamera=stream;return stream;
  }});
  if(!real){window.YT={Player:class{
   constructor(el,{events}){this.events=events;this.time=0;this.at=performance.now();this.state=2;this.rate=1;this.muted=false;window.qaYouTube=this;setTimeout(()=>events.onReady({target:this}),0);}
   getCurrentTime(){return this.time+(this.state===1?(performance.now()-this.at)/1000*this.rate:0);}
   getDuration(){return 180;}getPlayerState(){return this.state;}getPlaybackRate(){return this.rate;}getAvailablePlaybackRates(){return [.25,.5,.75,1,1.25,1.5,1.75,2];}
   setPlaybackRate(rate){this.time=this.getCurrentTime();this.at=performance.now();this.rate=rate;this.events.onPlaybackRateChange({target:this,data:rate});}
   playVideo(){this.at=performance.now();this.state=1;this.events.onStateChange({target:this,data:1});}
   pauseVideo(){this.time=this.getCurrentTime();this.state=2;this.events.onStateChange({target:this,data:2});}
   seekTo(t){this.time=t;this.at=performance.now();}isMuted(){return this.muted;}mute(){this.muted=true;}unMute(){this.muted=false;}destroy(){}
  }};}
 },{real});
 if(!real)await page.route('https://www.youtube.com/embed/**',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#243546;color:white">YouTube API test double</body>'}));
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 await page.evaluate(()=>{Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});Object.defineProperty(document.documentElement,'webkitRequestFullscreen',{configurable:true,value:undefined});});
 const button=name=>page.getByRole('button',{name,exact:true});
 const reveal=async()=>{if(await button('再生コントロールを表示').count())await button('再生コントロールを表示').click({position:{x:50,y:50}});await page.locator('.fullscreen-player-controls[data-visible="true"]').waitFor();await page.waitForTimeout(200);};
 const state=()=>page.evaluate(()=>window.qaTools.read_practice_state.execute({}));
 const screenshot=async name=>{if(qa){await mkdir(qa,{recursive:true});await page.screenshot({path:resolve(qa,name+'.png')});}};
 await page.getByLabel('YouTube・Xの動画リンク').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');await page.locator('.link-form button').click();
 await page.waitForFunction(()=>!document.querySelector('.play-button').disabled,null,{timeout:45000});
 if(real)await page.evaluate(()=>{window.qaYTCalls=[];const player=YT.get(document.querySelector('.youtube-mount iframe').id);window.qaRealPlayer=player;for(const name of ['setPlaybackRate','playVideo','pauseVideo']){const original=player[name].bind(player);player[name]=(...args)=>{window.qaYTCalls.push({name,args,at:performance.now()});return original(...args);};}});
 await button('インカメ').click();await page.waitForFunction(()=>document.querySelector('.deck-1 video')?.srcObject?.active);
 await page.evaluate(()=>{window.qaOriginalVideo=document.querySelector('.deck-1 video');window.qaOriginalIframe=document.querySelector('.youtube-mount iframe');});
 await button('録画開始').click();await page.getByRole('dialog',{name:'YouTubeの録画音'}).waitFor();
 assert.equal(await button('タブの音で録画').count(),0);
 assert.equal(await page.locator('.recording-audio-dialog .button.primary').innerText(),'iPhoneの画面収録を使う');
 await screenshot('iphone-recording-choice');await button('iPhoneの画面収録を使う').click();
 for(const size of [{width:390,height:760},{width:844,height:390},{width:320,height:568}]){
  await page.setViewportSize(size);const guide=page.getByRole('dialog',{name:'iPhoneの画面収録',exact:true});const bounds=await guide.boundingBox();
  assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=size.width+1&&bounds.y+bounds.height<=size.height+1,'guide fits viewport');
  await button('練習画面を開く').scrollIntoViewIfNeeded();await screenshot(`guide-${size.width}`);results.layouts.push({size,bounds});
 }
 await page.setViewportSize({width:390,height:760});await button('練習画面を開く').click();await page.locator('.studio-immersive').waitFor();
 assert.equal((await state()).playing,false,'preparation does not automatically start audio');
 assert.equal(await page.evaluate(()=>window.qaRecordings.length),0);assert.equal(await page.evaluate(()=>window.qaInputs.length),1);
 assert.equal(await page.locator('.stage-badge.rec').count(),0,'never pretend the OS recorder started');
 await button('再生').click();await button('一時停止').waitFor({timeout:30000});
 if(real){const video=page.frameLocator('.youtube-mount iframe').locator('video');await video.waitFor();assert.equal(await video.evaluate(v=>v.muted),false);}
 // Simulate the browser lifecycle around Control Center, not OS audio capture.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));window.qaOriginalVideo.pause();});
 await button('再生').waitFor();assert.equal((await state()).playing,false);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 assert.equal((await state()).playing,false,'returning to Safari never auto-plays audio');
 if(!real){
  // Camera play() can acknowledge later than the reference. Canceling during
  // that gap must not let a late camera acknowledgment restart app playback.
  await page.evaluate(()=>{const video=window.qaOriginalVideo,original=video.play.bind(video);video.play=()=>{const playing=original();return new Promise((resolve,reject)=>{window.qaLatePreview=()=>playing.then(resolve,reject);});};});
  await button('再生').click();await page.waitForFunction(()=>!!window.qaLatePreview&&window.qaYouTube.getPlayerState()===1);await page.waitForTimeout(300);
  await button('再生準備を中止').click();await page.evaluate(()=>{delete window.qaOriginalVideo.play;window.qaLatePreview();});await page.waitForTimeout(150);
  assert.equal((await state()).playing,false,'a late preview acknowledgment respects cancel');
  await page.evaluate(()=>window.qaOriginalVideo.pause());
 }
 const before=(await state()).time;await button('再生').click();await button('一時停止').waitFor({timeout:30000});
 await page.waitForFunction(()=>!window.qaOriginalVideo.paused);
 await page.waitForFunction(t=>window.qaTools.read_practice_state.execute({}).time>t+.15,before);
 for(const rate of [.5,.75,1,2]){console.log('Checking speed',rate);await reveal();await page.getByLabel('全画面の練習速度',{exact:true}).selectOption(String(rate));await page.waitForFunction(r=>window.qaTools.read_practice_state.execute({}).rate===r,rate);if(real)await page.frameLocator('.youtube-mount iframe').locator('video').evaluate((v,r)=>new Promise((resolve,reject)=>{const end=Date.now()+5000;const poll=()=>v.playbackRate===r?resolve():Date.now()>end?reject(Error('YouTube speed not applied: requested='+r+', actual='+v.playbackRate+', paused='+v.paused+', time='+v.currentTime)):setTimeout(poll,50);poll();}),rate);}
 await page.waitForTimeout(3300);assert.equal(await page.locator('.fullscreen-player-controls').getAttribute('data-visible'),'false');
 await screenshot('screen-practice-playing');await reveal();await screenshot('screen-practice-controls');
 await button('再生コントロールを隠す').click({position:{x:50,y:50}});await reveal();
 await button('画面収録の手順').click();await page.getByRole('dialog',{name:'iPhoneの画面収録'}).waitFor();
 await button('練習画面を開く').click();assert.equal(await page.locator('.studio-immersive').count(),1,'opening guide in fullscreen must not toggle fullscreen off');
 await button('全画面を終了').click();await page.getByRole('tab',{name:'重ねる',exact:true}).click();
 await button('録画開始').click();await button('iPhoneの画面収録を使う').click();await button('練習画面を開く').click();
 await page.setViewportSize({width:844,height:390});await screenshot('screen-practice-overlay');
 const preserved=await page.evaluate(()=>({video:window.qaOriginalVideo===document.querySelector('.deck-1 video'),iframe:window.qaOriginalIframe===document.querySelector('.youtube-mount iframe'),track:window.qaCamera.getVideoTracks()[0].readyState,calls:window.qaInputs.length,recorders:window.qaRecordings.length,overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.deepEqual(preserved,{video:true,iframe:true,track:'live',calls:1,recorders:0,overflow:false});results.preserved=preserved;
 await button('全画面を終了').click();
 if(real){
  // Existing app recording must still capture actual YouTube tab audio. No
  // fake microphone/audio is supplied. The camera video alone is synthetic.
  await page.evaluate(()=>{Object.defineProperty(navigator,'userAgent',{configurable:true,value:window.qaDesktopUA});Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async options=>{const stream=await window.qaDisplay(options);window.qaShared=stream;return stream;}});});
  await button('お手本を再生').click();await button('お手本を停止').waitFor();
  await button('録画開始').click();await button('タブの音で録画').click();await button('録画停止').waitFor({timeout:20000});
  await button('全画面にする').click();await page.getByLabel('全画面の練習速度',{exact:true}).selectOption('0.5');await page.waitForTimeout(4000);await reveal();await page.getByLabel('全画面の練習速度',{exact:true}).selectOption('1');await page.waitForTimeout(3400);await reveal();await button('全画面を終了').click();
  await button('録画停止').click();await page.getByRole('dialog',{name:'録画を保存'}).waitFor();
  const url=await page.getByRole('link',{name:'ファイルに保存',exact:true}).getAttribute('href');
  results.tabRecording=await page.evaluate(async url=>{const buffer=await fetch(url).then(r=>r.arrayBuffer()),ctx=new AudioContext();try{const audio=await ctx.decodeAudioData(buffer.slice(0));let square=0,peak=0;const data=audio.getChannelData(0);for(const sample of data){square+=sample*sample;peak=Math.max(peak,Math.abs(sample));}return {bytes:buffer.byteLength,duration:audio.duration,rms:Math.sqrt(square/data.length),peak,channels:audio.numberOfChannels,sharedTracks:window.qaShared.getTracks().map(t=>t.readyState),camera:window.qaCamera.getVideoTracks()[0].readyState};}finally{await ctx.close();}},url);
  assert.ok(results.tabRecording.bytes>1000);assert.ok(results.tabRecording.rms>.001,'actual YouTube tab audio is not silent');assert.ok(results.tabRecording.sharedTracks.every(t=>t==='ended'));assert.equal(results.tabRecording.camera,'live');
  if(qa){const bytes=await page.evaluate(async url=>Array.from(new Uint8Array(await fetch(url).then(r=>r.arrayBuffer()))),url);await writeFile(resolve(qa,'real-youtube-tab.mp4'),Buffer.from(bytes));}
  await button('練習に戻る').click();
 }else{
  await button('全画面にする').click();await page.evaluate(()=>window.qaCamera.getVideoTracks()[0].stop());await button('再生').click();
  await page.getByRole('status').filter({hasText:'カメラが停止しました'}).waitFor();assert.equal((await state()).playing,false,'dead camera never silently records an empty preview');
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify(results));
}catch(error){if(browser)for(const context of browser.contexts())for(const page of context.pages()){console.error(await page.locator('body').innerText().catch(()=>''));console.error(await page.evaluate(()=>({state:window.qaTools?.read_practice_state.execute({}),calls:window.qaYTCalls,rate:window.qaRealPlayer?.getPlaybackRate(),rates:window.qaRealPlayer?.getAvailablePlaybackRates(),notice:document.querySelector('.notice')?.textContent})).catch(()=>null));if(qa){await mkdir(qa,{recursive:true});await page.screenshot({path:resolve(qa,'failure.png')}).catch(()=>{});}}throw error;}
finally{if(qa){await mkdir(qa,{recursive:true});await writeFile(resolve(qa,'results.json'),JSON.stringify(results,null,2));}await browser?.close();await new Promise(resolve=>server.close(resolve));}
