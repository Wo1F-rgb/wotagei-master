// Verify saved beat origins and actual paused video positions when leaving the editor.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const files=[process.env.VIEW_REFERENCE||fileURLToPath(new URL('./fixtures/sync-150.mp4',import.meta.url)),process.env.VIEW_SELF||fileURLToPath(new URL('./fixtures/sync-120.mp4',import.meta.url))];
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.wasm':'application/wasm','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
 const page=await browser.newPage({viewport:{width:390,height:700}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.qaTools={};document.modelContext={registerTool(t){window.qaTools[t.name]=t;}};window.qaSeeks=[];document.addEventListener('seeking',e=>{if(e.target instanceof HTMLVideoElement)window.qaSeeks.push(e.target.currentTime);},true);});
 await page.addInitScript(()=>{
  window.qaPlayback=[];window.qaCovered=false;
  for(const key of ['play','pause']){const original=HTMLMediaElement.prototype[key];HTMLMediaElement.prototype[key]=function(...args){window.qaPlayback.push({action:key,source:this.src,muted:this.muted});return original.apply(this,args);};}
  new MutationObserver(()=>{if(document.querySelector('.start-sync-cover'))window.qaCovered=true;}).observe(document,{childList:true,subtree:true});
 });
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 const button=name=>page.getByRole('button',{name,exact:true});
 const state=()=>page.evaluate(()=>window.qaTools.read_practice_state.execute({}));
 const originField=i=>page.getByLabel(`${i?'自分':'お手本'}の1拍目（秒）`,{exact:true});
 const edit=async(i,t)=>{await originField(i).fill(String(t));await originField(i).press('Tab');};
 const stored=()=>page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('wotagei:video:')).map(([key,value])=>[key,JSON.parse(value)]).sort(([a],[b])=>a.localeCompare(b)));
 const inspect=()=>page.evaluate(()=>({c:window.qaTools.read_practice_state.execute({}),media:[...document.querySelectorAll('.video-stage video')].map(v=>({time:v.currentTime,rate:v.playbackRate,paused:v.paused,seeking:v.seeking})),ones:[...document.querySelectorAll('.track-one')].map(e=>e.getBoundingClientRect().x)}));
 const checkPaused=async(label,origins)=>{
  await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>!v.seeking&&v.paused));
  const result=await inspect(),{c,media:[r,s],ones}=result;
  assert.deepEqual(c.origins,origins,`${label}: closing restores saved origins`);assert.equal(c.playing,false);
  const gap=(c.origins[1]+(r.time-c.origins[0])*c.bpm[0]/c.bpm[1]-s.time)/s.rate;
  assert.ok(Math.abs(gap)<.003,`${label}: actual paused videos differ by ${gap}s`);
  assert.ok(Math.abs(ones[0]-ones[1])<.25,`${label}: actual beat lines must overlap, not just the playback cursor`);
  return result;
 };
 for(let i=0;i<2;i++)await page.getByLabel(`${i?'自分':'お手本'}の動画を選ぶ`,{exact:true}).setInputFiles(files[i]);
 await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.readyState>=2&&v.duration>=25));
 await page.evaluate(()=>window.qaTools.configure_practice_tempo.execute({referenceBpm:150.119,selfBpm:139.879,rate:1}));
 const original=[3.9,1];await button('1拍目を合わせる').click();for(let i=0;i<2;i++)await edit(i,original[i]);await button('この2点を保存').click();
 const saved=await stored();
 // Screenshot reproduction: moving only the reference to 4.3 then closing used
 // to leave the follower at 1.0, about one beat behind the original 3.9/1.0 grid.
 for(const master of [0,1])for(const index of [0,1])for(const preview of [false,true]){
  await button(`${master?'自分':'お手本'}の曲を主役にする`).click();
  await button('1拍目を合わせる').click();await edit(index,original[index]+.4);
  if(preview){await button('1拍目から再生').click();await button('確認を止める').waitFor({timeout:15000});await page.waitForTimeout(180);}
  await button('閉じる').click();await checkPaused(`master ${master}, edit ${index}, preview ${preview}`,original);
  assert.deepEqual(await stored(),saved,'discarded preview must not write its draft to storage');
 }
 // Leaving through another screen must finish the same edit transaction.
 for(const route of ['config','fullscreen','compare']){
  await button('お手本の曲を主役にする').click();
  if(route==='compare')await page.getByRole('tab',{name:'重ねる',exact:true}).click();
  await button('1拍目を合わせる').click();await edit(0,4.3);
  await button('1拍目から再生').click();await button('確認を止める').waitFor({timeout:15000});
  if(route==='config'){await button('お手本の設定').click();await button('練習画面に戻る').click();}
  if(route==='fullscreen'){await button('全画面にする').click();await page.locator('.studio-immersive').waitFor();await button('全画面を終了').click();}
  if(route==='compare')await page.getByRole('tab',{name:'比較',exact:true}).click();
  await checkPaused(`leave through ${route}`,original);assert.deepEqual(await stored(),saved);
 }
 // A failed save is retryable and does not close the editor or commit its draft.
 await button('1拍目を合わせる').click();await edit(0,4.3);
 await page.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k.startsWith('wotagei:video:'))throw new DOMException('Full','QuotaExceededError');return original.call(this,k,v);};});
 await button('この2点を保存').click();assert.equal(await page.locator('.first-beat-editor').count(),1);assert.match(await page.locator('.notice').innerText(),/保存できません/);assert.deepEqual(await stored(),saved);
 await page.evaluate(()=>window.restoreStorage());await button('メッセージを閉じる').click();await button('閉じる').click();await checkPaused('failed save then close',original);
 // Save remains a commit; both white grids and real frames use the edited origins.
 await button('お手本の曲を主役にする').click();await button('1拍目を合わせる').click();await edit(0,4.3);await edit(1,1.2);await button('この2点を保存').click();await checkPaused('saved edit',[4.3,1.2]);
 assert.ok((await stored()).every(([,v])=>[4.3,1.2].includes(v.origin)));
 // Manual arrows still shift the beat relative to the song while paused. Only
 // leaving the editor or explicitly starting sync moves the corresponding video.
 await page.locator('.track-nudge').last().click();const adjusted=await state();assert.ok(adjusted.origins[1]>1.2);
 const manual=await inspect();assert.ok(Math.abs(manual.ones[0]-manual.ones[1])>.001);
 await button('同期再生').click();await button('停止').waitFor({timeout:15000});const seeks=await page.evaluate(()=>window.qaSeeks.length);
 await page.waitForTimeout(450);const playing=await inspect(),[r,s]=playing.media;
 assert.ok(Math.abs((s.time-playing.c.origins[1])*playing.c.bpm[1]-(r.time-playing.c.origins[0])*playing.c.bpm[0])/playing.c.bpm[0]<.09);
 assert.equal(await page.evaluate(()=>window.qaSeeks.length),seeks,'no repeated seeks while playing');
 await button('停止').click();
 // Ordinary stop/resume must keep decoded frames: one audible Play per video,
 // no muted warmup/rewind and no full-screen preparation cover.
 for(const master of [0,1]){
  await button(`${master?'自分':'お手本'}の曲を主役にする`).click();
  // A deliberate change of audio master applies its exact mapping once.
  // Subsequent ordinary pause/resumes must not repeat that positioning.
  if(master===1){await button('同期再生').click();await button('停止').waitFor({timeout:15000});await page.waitForTimeout(150);await button('停止').click();}
  for(const fullscreen of [false,true]){
   if(fullscreen)await button('全画面にする').click();
   for(let repeat=0;repeat<3;repeat++){
    const beforeResume=await inspect();await page.evaluate(()=>{window.qaPlayback=[];window.qaSeeks=[];});
    await button(fullscreen?'再生':'同期再生').click();await button(fullscreen?'一時停止':'停止').waitFor({timeout:15000});
    await page.waitForTimeout(150);
    const result=await inspect(),[a,b]=result.media,gap=(result.c.origins[1]+(a.time-result.c.origins[0])*result.c.bpm[0]/result.c.bpm[1]-b.time)/b.rate;
    assert.ok(Math.abs(gap)<.07,`resume master ${master} fullscreen ${fullscreen}: ${gap}s`);
    const activity=await page.evaluate(()=>({events:window.qaPlayback,seeks:window.qaSeeks,covered:window.qaCovered}));
    assert.deepEqual(activity.seeks,[],`ordinary resume must not seek again ${JSON.stringify({master,fullscreen,repeat,beforeResume,activity})}`);
    assert.ok(activity.events.filter(e=>e.action==='play').length<=3,'one Play per media plus at most one clock hold; no muted warmup');
    assert.ok(activity.events.filter(e=>e.action==='pause').length<=1,'at most one real clock correction, no warmup pauses');
    const audible=result.media[master];assert.ok(audible);assert.equal(activity.events.filter(e=>e.action==='play'&&!e.muted).length>=1,true,'audible source starts without a mute/unmute cycle');
    assert.equal(activity.covered,false,'videos must stay visible throughout preparation and resume');
    await button(fullscreen?'一時停止':'停止').click();
   }
   if(fullscreen)await button('全画面を終了').click();
  }
 }
 assert.deepEqual(errors,[]);
 console.log('Beat editor: screenshot reproduction, both masters/sources, preview cancel, precise save, manual beat shifts and 12 warm resumes including fullscreen verified.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
