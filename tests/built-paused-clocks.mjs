// Exercise asynchronous native-clock reads with real video decoding and UI seeks.
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const files=[process.env.VIEW_REFERENCE||fileURLToPath(new URL('./fixtures/sync-150.mp4',import.meta.url)),process.env.VIEW_SELF||fileURLToPath(new URL('./fixtures/sync-120.mp4',import.meta.url))];
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.wasm':'application/wasm','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=process.env.PLAYWRIGHT_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
 const page=await browser.newPage({viewport:{width:390,height:700}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.qaTools={};document.modelContext={registerTool(t){window.qaTools[t.name]=t;}};
  const clock=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime'),pending=new WeakMap();
  window.qaActualTime=v=>clock.get.call(v);window.qaClockLag=false;window.qaLagMs=0;window.qaSeeks=[];window.qaAssignments=[];
  const seekState=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'seeking');Object.defineProperty(HTMLMediaElement.prototype,'seeking',{...seekState,get(){return pending.has(this)||seekState.get.call(this);}});
  // Keep real decoding/seeking; emulate a media clock which publishes its new
  // value only when the asynchronous seek completes, not inside the setter.
  Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{...clock,get(){return pending.has(this)?pending.get(this):clock.get.call(this);},set(value){if(window.qaClockLag&&this instanceof HTMLVideoElement)pending.set(this,clock.get.call(this));window.qaAssignments.push({index:[...document.querySelectorAll('.video-stage video')].indexOf(this),time:value});clock.set.call(this,value);}});
  window.addEventListener('seeked',e=>{if(window.qaLagMs&&pending.has(e.target)){e.stopImmediatePropagation();const v=e.target,stamp=pending.get(v);setTimeout(()=>{if(pending.get(v)!==stamp)return;pending.delete(v);v.dispatchEvent(new Event('seeked'));},window.qaLagMs);}else pending.delete(e.target);},true);
  window.addEventListener('emptied',e=>pending.delete(e.target),true);
  window.addEventListener('seeking',e=>{if(e.target instanceof HTMLVideoElement)window.qaSeeks.push(clock.get.call(e.target));},true);
 });
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 const button=name=>page.getByRole('button',{name,exact:true});
 const state=()=>page.evaluate(()=>window.qaTools.read_practice_state.execute({}));
 const inspect=()=>page.evaluate(()=>({state:window.qaTools.read_practice_state.execute({}),native:[...document.querySelectorAll('.video-stage video')].map(v=>({time:window.qaActualTime(v),rate:v.playbackRate,paused:v.paused,seeking:v.seeking})),ones:[...document.querySelectorAll('.track-one')].map(e=>e.getBoundingClientRect().x)}));
 const settled=async()=>{await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>!v.seeking&&v.paused));await page.waitForTimeout(80);};
 const check=async label=>{
  await settled();const result=await inspect(),{state:c,native:[r,s],ones}=result;
  const gap=c.origins[1]+(r.time-c.origins[0])*c.bpm[0]/c.bpm[1]-s.time;
  assert.ok(Math.abs(gap)<.003,`${label}: actual media gap ${gap}s`);
  assert.ok(Math.abs(c.time-r.time)<.003,`${label}: reference state is stale ${JSON.stringify(result)}`);
  assert.ok(Math.abs(ones[0]-ones[1])<.25,`${label}: white grids are stale ${JSON.stringify(result)}`);
  assert.equal(c.playing,false);return result;
 };
 for(let i=0;i<2;i++)await page.getByLabel(`${i?'自分':'お手本'}の動画を選ぶ`,{exact:true}).setInputFiles(files[i]);
 await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.readyState>=2&&v.duration>=25)).catch(async error=>{console.log(errors,await page.locator('.notice').allTextContents(),await page.evaluate(()=>[...document.querySelectorAll('video')].map(v=>({duration:v.duration,ready:v.readyState,error:v.error?.message,code:v.error?.code,mp4:v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')}))));throw error;});
 await page.evaluate(()=>window.qaTools.configure_practice_tempo.execute({referenceBpm:150.119,selfBpm:139.879,rate:1}));
 await button('1拍目を合わせる').click();
 for(const [i,value] of [3.9,1].entries()){const field=page.getByLabel(`${i?'自分':'お手本'}の1拍目（秒）`,{exact:true});await field.fill(String(value));await field.press('Tab');}
 await button('この2点を保存').click();await check('baseline');
 // Seek through the ordinary UI to a new point, with asynchronous clock reads.
 await page.evaluate(()=>{window.qaClockLag=true;});
 const slider=page.locator('.track-seek').getByRole('slider');
 await slider.press('ArrowRight');await check('one small seek after first-beat save');
 for(const key of ['PageUp','PageUp','ArrowLeft','ArrowLeft']){
  await slider.press(key);await check(`paused ${key}`);
 }
 // Close while a master-side trial seek is still outstanding. The follower
 // must use that destination, not the pre-seek clock from a different frame.
 await page.evaluate(()=>{window.qaLagMs=180;});
 for(const master of [0,1]){
  await button(`${master?'自分':'お手本'}の曲を主役にする`).click();
  await button('1拍目を合わせる').click();
  const field=page.getByLabel(`${master?'自分':'お手本'}の1拍目（秒）`,{exact:true});
  await field.fill(String([3.9,1][master]+.4));await field.press('Tab');await button('閉じる').click();
  await check(`close during master ${master} seek`);
 }
 // First-ever comparison preparation must retain an outstanding seek too.
 await button('お手本の曲を主役にする').click();await button('1拍目を合わせる').click();
 await button('1拍目から再生').click();await button('確認を止める').waitFor({timeout:15000});await page.waitForTimeout(180);
 const preview=await inspect();assert.ok(preview.native[0].time>=3.9&&preview.native[0].time<6,'initial preview retains the requested first beat');
 await button('確認を止める').click();await button('閉じる').click();
 // Finish a seek and press Play in the same gesture, as full-screen scrubbing does.
 for(const master of [0,1])for(const rate of [.5,1,1.25]){
  await button(`${master?'自分':'お手本'}の曲を主役にする`).click();
  await page.getByLabel('練習速度を選ぶ',{exact:true}).selectOption(String(rate));
  await button('全画面にする').click();await button('再生').click();await button('一時停止').waitFor({timeout:15000});
  const input=page.getByLabel('動画の再生位置',{exact:true}),box=await input.boundingBox(),duration=Number(await input.getAttribute('max'));
  for(const destination of [14.8,3.9]){
   await page.evaluate(()=>{window.qaAssignments=[];});
   await input.click({position:{x:8+(box.width-16)*destination/duration,y:box.height/2}});
   const desired=await page.evaluate(()=>window.qaAssignments.find(v=>v.index===0)?.time);assert.ok(Math.abs(desired-destination)<.1,'test must perform the real seek near the screenshot position');
   await button('一時停止').waitFor({timeout:15000}).catch(async error=>{console.log(await inspect(),await page.locator('.notice').allTextContents(),await page.evaluate(()=>window.qaAssignments));throw error;});
   await page.waitForTimeout(220);
   const resumed=await inspect(),{state:c,native:[r,s]}=resumed;
   assert.ok(r.time>=desired-.01&&r.time<desired+2,`resume retains requested ${desired}: ${JSON.stringify(resumed)}`);
   assert.ok(Math.abs(c.origins[1]+(r.time-c.origins[0])*c.bpm[0]/c.bpm[1]-s.time)/s.rate<.09,`master ${master} rate ${rate} seek ${desired}: ${JSON.stringify(resumed)}`);
  }
  await button('一時停止').click();await button('全画面を終了').click();
 }
 // Event refreshes must not manufacture synchronization. Explicitly move only
 // the follower, and verify that its actual offset remains visible in the grid.
 await page.evaluate(()=>{window.qaLagMs=0;});
 const before=await inspect();await page.evaluate(()=>{const v=document.querySelectorAll('.video-stage video')[1];v.currentTime=window.qaActualTime(v)-.2;});await settled();
 const after=await inspect();assert.equal(after.native[0].time,before.native[0].time);
 assert.ok(Math.abs(after.ones[1]-after.ones[0])>3,'a real follower offset stays visible');
 assert.deepEqual(errors,[]);
 console.log('Paused clocks: delayed seek/state updates, pending edit closure, cold preview, both masters at 3 speeds, forward/backward fullscreen seek-resume and honest offset display verified.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
