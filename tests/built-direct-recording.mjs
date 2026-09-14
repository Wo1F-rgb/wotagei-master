// Real MediaRecorder + AAC playback; only camera and default provider responses are synthetic.
// YOUTUBE_IMPORT_TEST_URL connects the same UI to a real local import service.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/',fixture=await readFile(new URL('./fixtures/sync-150.mp4',import.meta.url));
const qa=process.env.DIRECT_QA_DIR,endpoint=process.env.YOUTUBE_IMPORT_TEST_URL;
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(route===prefix+'runtime-config.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({youtubeImportUrl:endpoint||`http://127.0.0.1:${server.address().port}/youtube`}));return;}
 if(route==='/youtube'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;assert.deepEqual(JSON.parse(body),{id:'pUOZJDfM1wk'});res.setHeader('Content-Type','video/mp4');res.end(fixture);return;}
 if(!route.startsWith(prefix))throw Error('outside root');const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(Number(process.env.DIRECT_TEST_PORT)||0,'127.0.0.1',resolve));let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:390,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.qaTools={};document.modelContext={registerTool(t){window.qaTools[t.name]=t;}};window.qaInputs=[];
  Object.defineProperty(navigator,'canShare',{value:()=>false,configurable:true});
  Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',configurable:true});
  Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:()=>{throw Error('No screen or tab capture');},configurable:true});
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async options=>{
   window.qaInputs.push(options);if(options.audio)throw Error('No microphone');
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');let n=0;
   const draw=()=>{ctx.fillStyle='#40e060';ctx.fillRect(0,0,640,360);ctx.fillStyle='white';ctx.fillRect(n++%560,100,80,80);};draw();const stream=canvas.captureStream(30);const timer=setInterval(draw,33),track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};window.qaCamera=stream;return stream;
  },configurable:true});
 });
 if(process.env.DIRECT_REAL_X!=='1'){await page.route('https://api.fxtwitter.com/2/status/2090797885625700592',route=>route.fulfill({json:{code:200,status:{id:'2090797885625700592',type:'status',author:{screen_name:'fixture'},media:{all:[{type:'video',url:'https://video.twimg.com/test/direct.mp4'}]}}}}));
 await page.route('https://video.twimg.com/test/direct.mp4',route=>route.fulfill({body:fixture,contentType:'video/mp4'}));}
 await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
 const button=name=>page.getByRole('button',{name,exact:true});
 const dismiss=async()=>{if(await button('メッセージを閉じる').count())await button('メッセージを閉じる').click();};
 const reference=page.locator('.deck-0 video');
 await button('インカメ').click();await page.waitForFunction(()=>document.querySelector('.deck-1 video')?.srcObject?.active);
 await page.evaluate(()=>localStorage.setItem('wotagei:video:youtube:pUOZJDfM1wk',JSON.stringify({bpm:146.877,kind:'manual',origin:1.25})));
 for(const source of ['youtube','x']){
  if(source==='x')await button('お手本の動画を外す').click();
  await page.getByLabel('YouTube・Xの動画リンク').fill(source==='youtube'?'https://youtu.be/pUOZJDfM1wk?t=3':'https://x.com/emakari_love/status/2090797885625700592');await page.locator('.link-form button').click();
  await page.waitForFunction(()=>document.querySelector('.deck-0 video')?.readyState>=2,null,{timeout:180000});
  assert.equal(await page.locator('.youtube-mount iframe').count(),0,'imported YouTube uses a directly playable video');
  if(source==='youtube'){assert.ok(Math.abs(await reference.evaluate(v=>v.currentTime)-3)<.1,'URL start time preserved on full timeline');const state=await page.evaluate(()=>window.qaTools.read_practice_state.execute({}));assert.equal(state.bpm[0],146.877);}
  for(let repeat=0;repeat<(source==='youtube'?2:1);repeat++){
   await button('お手本を再生').click();await page.waitForFunction(()=>!document.querySelector('.deck-0 video').paused);await dismiss();
   await button('録画開始').click();await button('録画停止').waitFor({timeout:15000});
   assert.equal(await page.getByRole('dialog',{name:'YouTubeの録画音'}).count(),0,'one Record button mixes native music without extra recording UI');
   await button('全画面にする').click();await page.getByLabel('全画面の練習速度',{exact:true}).selectOption('0.5');await page.waitForFunction(()=>document.querySelector('.deck-0 video').playbackRate===.5);await page.waitForTimeout(1800);
   await page.getByLabel('全画面の練習速度',{exact:true}).selectOption('2');await page.waitForFunction(()=>document.querySelector('.deck-0 video').playbackRate===2);await page.waitForTimeout(1300);
   if(await button('再生コントロールを表示').count())await button('再生コントロールを表示').click({position:{x:40,y:40}});
   await button('一時停止').click();await page.waitForTimeout(700);await button('再生').click();await button('一時停止').waitFor();await page.waitForTimeout(800);
   if(await button('再生コントロールを表示').count())await button('再生コントロールを表示').click({position:{x:40,y:40}});
   await button('全画面を終了').click();await button('録画停止').click();await page.getByRole('dialog',{name:'録画を保存'}).waitFor();
   const url=await page.getByRole('link',{name:'ファイルに保存',exact:true}).getAttribute('href');
   const result=await page.evaluate(async url=>{
    const buffer=await fetch(url).then(r=>r.arrayBuffer()),ctx=new AudioContext();let audio;
    try{const decoded=await ctx.decodeAudioData(buffer.slice(0)),data=decoded.getChannelData(0);audio={duration:decoded.duration,rms:Math.sqrt(data.reduce((sum,s)=>sum+s*s,0)/data.length),channels:decoded.numberOfChannels};}finally{await ctx.close();}
    const v=document.createElement('video');v.muted=true;v.src=url;await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;});const frame=new Promise(resolve=>v.requestVideoFrameCallback(resolve));await v.play();await frame;v.pause();const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const g=c.getContext('2d');g.drawImage(v,0,0);return {...audio,bytes:buffer.byteLength,width:v.videoWidth,height:v.videoHeight,pixel:Array.from(g.getImageData(100,600,1,1).data),camera:window.qaCamera.getVideoTracks()[0].readyState,microphones:window.qaInputs.filter(c=>c.audio).length};
   },url);
   console.log('recording',source,repeat,result);assert.ok(result.rms>.001,'saved MP4 contains actual decoded music');assert.ok(result.duration>4);assert.equal(result.width,1280);assert.equal(result.height,720);assert.ok(result.pixel[1]>result.pixel[0]*1.5);assert.equal(result.camera,'live');assert.equal(result.microphones,0);results.push({source,repeat,realYouTube:source==='youtube'&&!!endpoint,realX:source==='x'&&process.env.DIRECT_REAL_X==='1',...result});
   if(qa){await mkdir(qa,{recursive:true});const data=await page.evaluate(async u=>Array.from(new Uint8Array(await fetch(u).then(r=>r.arrayBuffer()))),url);await writeFile(resolve(qa,`${source}-${repeat}.mp4`),Buffer.from(data));await page.screenshot({path:resolve(qa,`${source}-${repeat}.png`)});}
   await button('練習に戻る').click();await dismiss();await button('お手本を停止').click();
  }
 }
 await button('お手本の設定').click();await page.getByRole('tab',{name:'動画',exact:true}).click();
 await button('お手本の履歴を開く').click();await page.locator('.recent-item').filter({hasText:'YouTube · pUOZJDfM1wk'}).waitFor();assert.match(await page.locator('.recent-item').filter({hasText:'YouTube · pUOZJDfM1wk'}).innerText(),/YouTube/);await page.keyboard.press('Escape');
 const original=await reference.getAttribute('src'),importUrl=endpoint||`http://127.0.0.1:${server.address().port}/youtube`;
 await page.route(importUrl,route=>route.fulfill({status:429,contentType:'application/json',body:'{}'}));
 await page.getByLabel('YouTube・Xの動画リンク').fill('https://youtu.be/pUOZJDfM1wk');await page.locator('.link-form button').click();await page.getByRole('status').filter({hasText:'混み合っています'}).waitFor();assert.equal(await reference.getAttribute('src'),original,'failed import retains previous reference');await dismiss();await page.unroute(importUrl);
 let pending;await page.route(importUrl,async route=>{await new Promise(resolve=>{pending=resolve;});await route.fulfill({body:fixture,contentType:'video/mp4'}).catch(()=>{});});
 await page.locator('.link-form button').click();while(!pending)await page.waitForTimeout(20);await page.locator('.link-form button').click();pending();await page.waitForTimeout(100);assert.equal(await reference.getAttribute('src'),original,'canceled import retains previous reference');assert.equal(await page.getByLabel('YouTube・Xの動画リンク').isEnabled(),true);
 assert.deepEqual(errors,[]);console.log(JSON.stringify(results));
}catch(e){console.error(await Promise.all((browser?.contexts()||[]).flatMap(c=>c.pages()).map(p=>p.locator('body').innerText())));throw e;}
finally{if(qa){await mkdir(qa,{recursive:true});await writeFile(resolve(qa,'results.json'),JSON.stringify(results,null,2));}await browser?.close();await new Promise(resolve=>server.close(resolve));}
