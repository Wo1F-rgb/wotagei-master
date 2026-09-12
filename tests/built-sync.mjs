// Real HTMLVideoElement clocks in the built app; optional private originals stay outside the repo.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const files=[process.env.SYNC_REFERENCE||fileURLToPath(new URL('./fixtures/sync-150.mp4',import.meta.url)),process.env.SYNC_SELF||fileURLToPath(new URL('./fixtures/sync-120.mp4',import.meta.url))];
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.wasm':'application/wasm','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Capture the app's existing structured controls, without adding a production debug API.
 await page.addInitScript(()=>{window.qaTools={};document.modelContext={registerTool(t){window.qaTools[t.name]=t;}};window.qaSeeks=[];document.addEventListener('seeking',e=>{if(e.target instanceof HTMLVideoElement)window.qaSeeks.push({at:performance.now(),time:e.target.currentTime});},true);});
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 const button=name=>page.getByRole('button',{name,exact:true});
 const dismiss=async()=>{if(await button('メッセージを閉じる').count())await button('メッセージを閉じる').click();};
 const state=()=>page.evaluate(()=>window.qaTools.read_practice_state.execute({}));
 const configure=async config=>{await page.evaluate(v=>window.qaTools.configure_practice_tempo.execute(v),config);};
 const load=async()=>{for(let i=0;i<2;i++)await page.getByLabel(`${i?'自分':'お手本'}の動画を選ぶ`,{exact:true}).setInputFiles(files[i]);await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.readyState>=2&&v.duration>=25));};
 const origins=async values=>{await dismiss();await button('1拍目を合わせる').click();for(let i=0;i<2;i++){const input=page.getByLabel(`${i?'自分':'お手本'}の1拍目（秒）`,{exact:true});await input.fill(String(values[i]));await input.press('Tab');}await button('この2点を保存').click();await dismiss();};
 const play=async()=>{await dismiss();await button('同期再生').click();await button('停止').waitFor({timeout:15000});};
 const stop=async()=>{if(await button('停止').count())await button('停止').click();};
 async function measure(name,{start=true,seconds=1.1,master=0,free=true,warmup=450}={}){
  if(start)await play();else await button('停止').waitFor({timeout:15000});
  // A negative mapped time precedes the second file: no corresponding frame
  // exists there. Measure after that file actually enters the shared timeline.
  await page.waitForFunction(()=>{const c=window.qaTools.read_practice_state.execute({}),[r,s]=document.querySelectorAll('.video-stage video');return !r.paused&&!s.paused&&c.origins[1]+(r.currentTime-c.origins[0])*c.bpm[0]/c.bpm[1]>=0;},{},{timeout:15000});
  await page.waitForTimeout(warmup);const seekCount=await page.evaluate(()=>window.qaSeeks.length),points=[];
  for(let i=0;i<Math.ceil(seconds/.14);i++){
   await page.waitForTimeout(140);
   points.push(await page.evaluate(()=>{const c=window.qaTools.read_practice_state.execute({});return {c,media:[...document.querySelectorAll('.video-stage video')].map(v=>({time:v.currentTime,rate:v.playbackRate,paused:v.paused,seeking:v.seeking,ready:v.readyState,frames:v.getVideoPlaybackQuality().totalVideoFrames}))};}));
  }
  const gaps=points.map(({c,media:[r,s]})=>((s.time-c.origins[1])*c.bpm[1]-(r.time-c.origins[0])*c.bpm[0])/(c.bpm[master]*c.rate));
  const max=Math.max(...gaps.map(Math.abs));results.push({name,maxClockGapSeconds:max,points});
  assert.ok(max<.09,`${name}: actual media clocks differ by ${max.toFixed(4)} seconds`);
  for(const {c,media:[r,s]} of points){assert.equal(c.playing,true,`${name}: unexpectedly stopped`);assert.ok(!r.paused&&!s.paused);assert.ok(Math.abs(r.rate*c.bpm[0]-s.rate*c.bpm[1])<1e-6,`${name}: effective BPMs differ`);assert.ok(Math.abs((master?s:r).rate-c.rate)<1e-6,`${name}: chosen soundtrack speed differs`);}
  if(free)assert.equal(await page.evaluate(()=>window.qaSeeks.length),seekCount,`${name}: no repeated drift seeks during steady playback`);
  assert.ok(points.at(-1).media.every((m,i)=>m.frames>points[0].media[i].frames),`${name}: both videos render frames`);
  await stop();console.log(`${name}: max clock gap ${(max*1000).toFixed(1)} ms`);
 }
 await load();
 for(const bpm of [[150,120],[120,150],[146.877,139.992],[150,150]]){
  await configure({referenceBpm:bpm[0],selfBpm:bpm[1]});
  for(const master of [0,1])for(const rate of [.5,1,1.25]){
   await dismiss();await button(`${master?'自分':'お手本'}の曲を主役にする`).click();await configure({rate});await origins([1.25,.8]);
   await measure(`BPM ${bpm.join('/')} master ${master} speed ${rate}`,{master});
  }
 }
 // Tap at source-media beat times while the selected practice speed is 0.5.
 await button('お手本の曲を主役にする').click();await configure({referenceBpm:150,selfBpm:120,rate:.5});await origins([0,0]);
 for(let i=0;i<2;i++){
  await dismiss();await button(`${i?'自分':'お手本'}の設定`).click();await page.getByRole('tab',{name:'手動',exact:true}).click();await button('再生して拍を記録').click();
  const tapping=await page.evaluate(async i=>{const v=document.querySelectorAll('.video-stage video')[i],period=i?.5:.4,start=v.currentTime+.2;let count=0;const rates=[];
   await new Promise(resolve=>{function tick(){if(v.currentTime>=start+count*period){rates.push(v.playbackRate);document.querySelector('.beat-tap-target').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));count++;}if(count===10)resolve();else requestAnimationFrame(tick);}tick();});return rates;},i);
  assert.ok(tapping.every(rate=>rate===1),'BPM changes from taps never change the solo recording speed');
  await button('ここまでで終わる').click();await button('保存して戻る').click();assert.equal((await state()).bpmKinds[i],'tap');
  await measure(`tap ${i} saved immediately`);
 }
 // Genuine ONNX inference and UI Save, not seeded/fabricated analysis results.
 for(let i=0;i<2;i++){
  await dismiss();await button(`${i?'自分':'お手本'}の設定`).click();await button('解析を開始').click();await page.getByLabel('解析BPM',{exact:true}).waitFor({timeout:90000});
  const expected={bpm:Number(await page.getByLabel('解析BPM',{exact:true}).inputValue()),origin:Number(await page.getByLabel('解析結果の1拍目の位置（秒）',{exact:true}).inputValue())};
  await button('保存して戻る').click();const c=await state();assert.equal(c.bpm[i],expected.bpm);assert.equal(c.origins[i],expected.origin);assert.equal(c.bpmKinds[i],'analysis');
  await measure(`analysis ${i} saved immediately`);
 }
 const saved=await state();await page.reload();await load();const restored=await state();assert.deepEqual(restored.bpm,saved.bpm);assert.deepEqual(restored.origins,saved.origins);assert.deepEqual(restored.bpmKinds,saved.bpmKinds);
 await measure('analysis history restored');
 await origins([1.25,.8]);await play();await page.locator('.track-nudge').last().click();
 assert.equal((await state()).playing,false,'editing the beat origin must not leave two clocks playing with the old phase');
 const nudged=(await state()).origins;assert.ok(nudged[1]>.8);await measure('nudge and resume');assert.deepEqual((await state()).origins,nudged);
 // Changing views and seeking must retain the same saved beat mapping.
 await page.getByRole('tab',{name:'重ねる',exact:true}).click();await measure('overlay');await page.getByRole('tab',{name:'比較',exact:true}).click();
 const seek=page.locator('.track-seek').getByRole('slider');await seek.press('Home');await measure('pre-roll then follower entry',{seconds:3,free:false,warmup:1400});
 assert.deepEqual((await state()).origins,nudged);
 for(const master of [0,1]){
  await dismiss();await button(`${master?'自分':'お手本'}の曲を主役にする`).click();await origins([1.25,.8]);
  for(const rate of [1.25,.5,1]){await play();await page.getByLabel('練習速度を選ぶ',{exact:true}).selectOption(String(rate));await measure(`change speed while playing ${rate} master ${master}`,{start:false,master});}
 }
 // A second change can arrive while the first restart is preparing its clocks.
 await button('お手本の曲を主役にする').click();await origins([1.25,.8]);await play();await button('練習速度と鳴らす音を設定').click();
 await page.locator('.speed-presets').getByRole('button',{name:'0.5×',exact:true}).click();await page.locator('.speed-presets').getByRole('button',{name:'1.25×',exact:true}).click();await page.keyboard.press('Escape');
 await measure('consecutive speed changes during preparation',{start:false});assert.equal((await state()).rate,1.25);
 // The ends of the public 0.25–2.5 preset range use equal BPMs so neither clip's
 // derived speed exceeds the browser's supported range.
 await configure({referenceBpm:150,selfBpm:150});
 for(const rate of [.25,2.5]){await configure({rate});await origins([1.25,.8]);await measure(`preset limit ${rate}`);}
 // Fault injection: hold one real media clock as if its decoder were buffering.
 for(const master of [0,1])for(const stalled of [0,1]){
  await dismiss();await button(`${master?'自分':'お手本'}の曲を主役にする`).click();await origins([1.25,.8]);await play();
  await page.evaluate(i=>{const v=document.querySelectorAll('.video-stage video')[i];window.qaStalled=v;v.pause();Object.defineProperty(v,'readyState',{configurable:true,get:()=>2});v.dispatchEvent(new Event('waiting'));},stalled);
  await page.waitForFunction(()=>document.querySelectorAll('.video-stage video').length===2&&[...document.querySelectorAll('.video-stage video')].every(v=>v.paused),{},{timeout:1500});
  assert.equal((await state()).playing,false,'a stalled decoder stops both once instead of leaving a permanent beat error');
  await page.evaluate(()=>{delete window.qaStalled.readyState;});await measure(`recover decoder ${stalled} master ${master}`,{master});
 }
 // Several actual loop boundaries, including non-integer BPM ratios.
 await button('お手本の曲を主役にする').click();await configure({referenceBpm:146.877,selfBpm:139.992,rate:1});await origins([1.25,.8]);await dismiss();await button('区間ループを設定').click();await button('1小節').click();await page.keyboard.press('Escape');await play();
 const loopSamples=[];for(let i=0;i<45;i++){await page.waitForTimeout(150);loopSamples.push(await page.evaluate(()=>{const c=window.qaTools.read_practice_state.execute({});return {c,times:[...document.querySelectorAll('.video-stage video')].map(v=>v.currentTime)};}));}
 const wraps=loopSamples.slice(1).filter((p,i)=>p.times[0]<loopSamples[i].times[0]-.5).length;assert.ok(wraps>=2,'test must traverse multiple real loop boundaries');
 const stable=loopSamples.filter(p=>p.c.playing&&p.times[0]>p.c.loop.start+.25);assert.ok(stable.length>6);
 assert.ok(stable.every(({c,times:t})=>Math.abs((t[1]-c.origins[1])*c.bpm[1]-(t[0]-c.origins[0])*c.bpm[0])/c.bpm[0]<.09),'loop reloads use a shared prepared start');await stop();
 await dismiss();await button('区間ループを設定').click();await page.locator('[data-slot="switch"][aria-label="区間ループ"]').click();await page.keyboard.press('Escape');await origins([1.25,.8]);await measure('long free-running playback',{seconds:12});
 // Place the follower three seconds from its actual end using the beat mapping.
 // Its ended event must stop the other clip, and replay must restart together.
 const nearEnd=await page.evaluate(()=>document.querySelectorAll('.video-stage video')[1].duration-3);
 await configure({referenceBpm:150,selfBpm:150,rate:1});await origins([1,nearEnd]);await play();
 await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.paused)&&!window.qaTools.read_practice_state.execute({}).playing,{},{timeout:6000});
 assert.equal(await page.evaluate(()=>document.querySelectorAll('.video-stage video')[1].ended),true);
 await measure('replay after follower end');
 assert.deepEqual(errors,[]);console.log(`Sync browser verification passed: ${results.length} runs, 24 rate combinations, real tap/inference/save/history, nudge/seek/view, stalls and ${wraps} loop boundaries.`);
}finally{
 if(process.env.SYNC_QA_DIR){await mkdir(process.env.SYNC_QA_DIR,{recursive:true});await writeFile(resolve(process.env.SYNC_QA_DIR,'sync-results.json'),JSON.stringify(results,null,2));}
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
