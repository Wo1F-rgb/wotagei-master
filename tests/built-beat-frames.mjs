// Built UI: the same saved white-line grid drives pixels, navigation and every exported JPEG.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const qa=resolve(process.env.FRAMES_QA_DIR||'work/beat-frames-qa');await mkdir(qa,{recursive:true});
const fixture=resolve(qa,'colors.mp4');execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=red:s=640x360:r=30:d=2','-vf',"drawbox=color=lime:t=fill:enable='gte(t,0.5)*lt(t,1)',drawbox=color=blue:t=fill:enable='gte(t,1)*lt(t,1.5)',drawbox=color=white:t=fill:enable='gte(t,1.5)'",'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart',fixture]);
const media=await readFile(fixture);
const server=createServer(async(req,res)=>{try{const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results={layouts:[],photos:[],youtube:null};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
 const page=await browser.newPage({viewport:{width:390,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.qaTools={};document.modelContext={registerTool(t){window.qaTools[t.name]=t;}};window.qaShares=[];
  Object.defineProperty(navigator,'canShare',{configurable:true,value:d=>!!d.files?.length});
  Object.defineProperty(navigator,'share',{configurable:true,value:async d=>{window.qaShares.push(d.files.map(f=>({name:f.name,type:f.type,size:f.size})));if(window.qaShareCancel)throw new DOMException('Cancelled','AbortError');}});
 });
 await page.route('https://api.fxtwitter.com/2/status/2090797885625700592',r=>r.fulfill({json:{code:200,status:{id:'2090797885625700592',type:'status',author:{screen_name:'fixture'},media:{all:[{type:'video',url:'https://video.twimg.com/test/frames.mp4'}]}}}}));
 await page.route('https://video.twimg.com/test/frames.mp4',r=>r.fulfill({body:media,contentType:'video/mp4'}));
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 const button=name=>page.getByRole('button',{name,exact:true}),state=()=>page.evaluate(()=>window.qaTools.read_practice_state.execute({}));
 await page.getByLabel('YouTube・Xの動画リンク').fill('https://x.com/emakari_love/status/2090797885625700592');await page.locator('.link-form button').click();await page.waitForFunction(()=>document.querySelector('.deck-0 video')?.readyState>=2);
 await button('コマ送りを開く').click();await button('拍の設定へ').waitFor();assert.equal(await page.getByRole('button',{name:'エクスポート',exact:true}).count(),0,'unset BPM cannot silently use 120');await button('練習画面に戻る').click();
 await page.evaluate(()=>window.qaTools.configure_practice_tempo.execute({referenceBpm:120,rate:2}));
 await button('お手本の設定').click();await page.getByRole('tab',{name:'拍の位置',exact:true}).click();await page.getByLabel('1拍目の位置（秒）',{exact:true}).fill('0.25');await page.getByLabel('1拍目の位置（秒）',{exact:true}).press('Tab');await button('保存して戻る').click();
 await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const request=indexedDB.open('wotagei-rhythm-history-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('results',{keyPath:'key'});request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('results','readwrite');tx.objectStore('results').put({key:'twitter:2090797885625700592:1',version:1,updatedAt:Date.now(),bytes:2048,source:'video',audio:null,bpmText:'150',originText:'0.5',position:0,baseline:{bpm:120,origin:.25},result:{engine:'test draft',duration:12,beats:[.5,.9,1.3],downbeats:[.5],waveform:[.1,.6,.2],grid:{bpm:150,origin:.5,errorMs:2,driftMs:1,coverage:.98,variable:false,beatCount:30}}});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});});
 const before=await state();await button('コマ送りを開く').click();
 const panel=page.locator('.beat-frames');const pixel=async index=>{
  await page.waitForFunction(i=>{const panel=document.querySelector('.beat-frames'),img=document.querySelector('.beat-frame-still img');return Number(panel?.dataset.frameIndex)===i&&img?.complete&&img.naturalWidth>0&&img.alt.includes(`${i+1}拍目`);},index);
  return page.locator('.beat-frame-still img').evaluate(img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return [...ctx.getImageData(100,100,1,1).data].slice(0,3);});
 };
 const checks=[p=>p[0]>180&&p[1]<40,p=>p[1]>180&&p[0]<40,p=>p[2]>180&&p[0]<40,p=>p.every(v=>v>230)];
 assert.equal(await panel.getAttribute('data-frame-count'),'4');assert.ok(checks[0](await pixel(0)));assert.equal(await button('前の拍へ').isDisabled(),true);
 for(let i=1;i<4;i++){await button('次の拍へ').click();assert.ok(checks[i](await pixel(i)));assert.equal(Number(await panel.getAttribute('data-frame-time')),.25+i*.5);}
 assert.equal(await button('次の拍へ').isDisabled(),true);await button('前の拍へ').click();assert.ok(checks[2](await pixel(2)));await button('1拍目').click();assert.ok(checks[0](await pixel(0)));
 // Fast taps replace an in-flight preview; the latest target wins.
 await button('次の拍へ').click();await button('次の拍へ').click();await button('次の拍へ').click();assert.ok(checks[3](await pixel(3)));
 for(const size of [{width:390,height:700},{width:320,height:568},{width:844,height:390},{width:1280,height:800}]){
  await page.setViewportSize(size);await page.waitForTimeout(100);
  const bounds=await page.locator('.beat-frame-navigation,.beat-frame-actions,.beat-frame-still').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  assert.ok(bounds.every(b=>b.w>0&&b.h>0&&b.x>=0&&b.y>=0&&b.x+b.w<=size.width+1&&b.y+b.h<=size.height+1),JSON.stringify({size,bounds}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  await page.screenshot({path:resolve(qa,`frames-${size.width}.png`)});results.layouts.push({size,bounds});
 }
 await page.setViewportSize({width:390,height:700});const playerBefore=await page.locator('.deck-0 video').evaluate(v=>({time:v.currentTime,rate:v.playbackRate,paused:v.paused}));
 await button('エクスポート').click();const zip=page.getByRole('link',{name:'全画像をZIPで保存',exact:true});await zip.waitFor();assert.equal(await page.evaluate(()=>window.qaShares.length),0,'no automatic OS handoff before a save tap');
 const zipUrl=await zip.getAttribute('href');results.photos=await page.evaluate(async url=>{
  const buffer=await fetch(url).then(r=>r.arrayBuffer()),view=new DataView(buffer),result=[];let at=0;
  while(view.getUint32(at,true)===0x04034b50){const size=view.getUint32(at+18,true),nl=view.getUint16(at+26,true),extra=view.getUint16(at+28,true),start=at+30+nl+extra;const name=new TextDecoder().decode(new Uint8Array(buffer,at+30,nl));const img=await createImageBitmap(new Blob([buffer.slice(start,start+size)],{type:'image/jpeg'})),c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);result.push({name,width:img.width,height:img.height,pixel:[...ctx.getImageData(100,100,1,1).data].slice(0,3)});img.close();at=start+size;}
  return result;
 },zipUrl);
 assert.equal(results.photos.length,4);results.photos.forEach((p,i)=>{assert.ok(checks[i](p.pixel));assert.match(p.name,new RegExp(String(250+i*500).padStart(9,'0')+'ms.jpg$'));});
 const download=page.waitForEvent('download');await zip.click();await (await download).saveAs(resolve(qa,'all-beats.zip'));
 await button('写真に保存').click();assert.equal(await page.evaluate(()=>window.qaShares[0].length),4);assert.ok((await page.evaluate(()=>window.qaShares[0])).every(f=>f.type==='image/jpeg'&&f.size>0));
 await page.evaluate(()=>window.qaShareCancel=true);await button('写真に保存').click();assert.equal(await zip.count(),1,'canceled OS share retains prepared photos');
 assert.deepEqual(await page.locator('.deck-0 video').evaluate(v=>({time:v.currentTime,rate:v.playbackRate,paused:v.paused})),playerBefore,'export never changes player clocks');
 assert.deepEqual((await state()).origins,before.origins);assert.deepEqual((await state()).bpm,before.bpm);assert.equal((await state()).rate,2);
 // Delay JPEG encoding so the real export can be canceled while a frame is pending.
 await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;window.qaToBlob=original;HTMLCanvasElement.prototype.toBlob=function(cb,...args){return original.call(this,b=>setTimeout(()=>cb(b),500),...args);};});
 await button('コマ送りに戻る').click();await button('エクスポート').click();await button('中止').click();await page.getByRole('status').filter({hasText:'書き出しを中止'}).waitFor();await page.waitForTimeout(650);assert.equal(await zip.count(),0);await page.evaluate(()=>HTMLCanvasElement.prototype.toBlob=window.qaToBlob);
 await page.getByRole('tab',{name:'拍・BPM',exact:true}).click();await page.getByText('150.000 BPM',{exact:true}).waitFor();await page.getByRole('tab',{name:'コマ送り',exact:true}).click();assert.deepEqual((await state()).bpm,before.bpm,'entering frames never applies an analysis draft');assert.deepEqual((await state()).origins,before.origins);await button('完了').click();assert.deepEqual((await state()).bpm,before.bpm,'completing frames never applies an analysis draft');assert.deepEqual((await state()).origins,before.origins);await page.waitForFunction(()=>document.querySelectorAll('video').length===2,'all dedicated decoders are released');
 await page.evaluate(()=>window.qaTools.configure_practice_tempo.execute({referenceBpm:150.119,rate:.5}));await button('コマ送りを開く').click();await button('次の拍へ').click();await pixel(1);assert.ok(Math.abs(Number(await panel.getAttribute('data-frame-time'))-(.25+60/150.119))<1e-10);
 await page.getByRole('tab',{name:'動画',exact:true}).click();await page.getByLabel('お手本の動画を選ぶ',{exact:true}).setInputFiles(fixture);await page.waitForFunction(()=>document.querySelector('.deck-0 video')?.readyState>=2);await page.getByRole('tab',{name:'コマ送り',exact:true}).click();await button('拍の設定へ').waitFor();assert.equal(await zip.count(),0,'replacement media cannot retain stale exported photos');
 assert.deepEqual(errors,[]);
 // Official iframe controls can step, but cannot export pixels without a native import.
 const yt=await browser.newPage({viewport:{width:390,height:700}});await yt.addInitScript(()=>{
  window.qaTools={};document.modelContext={registerTool(t){window.qaTools[t.name]=t;}};window.qaSeek=[];
  window.YT={Player:class{constructor(el,{events}){this.events=events;this.time=0;this.rate=1;setTimeout(()=>events.onReady({target:this}),0);}getCurrentTime(){return this.time;}getDuration(){return 10;}getPlayerState(){return 2;}getPlaybackRate(){return this.rate;}getAvailablePlaybackRates(){return [1];}setPlaybackRate(r){this.rate=r;}playVideo(){}pauseVideo(){}seekTo(t){this.time=t;window.qaSeek.push(t);}isMuted(){return false;}mute(){}unMute(){}destroy(){}}};
 });await yt.route('https://www.youtube.com/embed/**',r=>r.fulfill({contentType:'text/html',body:'<body>YouTube API test double</body>'}));await yt.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 await yt.getByLabel('YouTube・Xの動画リンク').fill('https://youtu.be/M7lc1UVf-VE');await yt.locator('.link-form button').click();await yt.waitForFunction(()=>!document.querySelector('.beat-frame-entry').disabled);await yt.evaluate(()=>window.qaTools.configure_practice_tempo.execute({referenceBpm:120}));
 await yt.getByRole('button',{name:'コマ送りを開く',exact:true}).click();await yt.getByRole('button',{name:'次の拍へ',exact:true}).click();assert.equal(await yt.getByRole('button',{name:'エクスポート',exact:true}).isDisabled(),true);results.youtube=await yt.evaluate(()=>window.qaSeek);assert.deepEqual(results.youtube.slice(-2),[0,.5]);assert.equal(await yt.locator('.youtube-mount iframe').count(),1);
 console.log(JSON.stringify(results));
}catch(e){if(browser)for(const c of browser.contexts())for(const p of c.pages()){console.error(await p.locator('body').innerText().catch(()=>''));await p.screenshot({path:resolve(qa,'failure.png')}).catch(()=>{});}throw e;}
finally{await writeFile(resolve(qa,'results.json'),JSON.stringify(results,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));}
