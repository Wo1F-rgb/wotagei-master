// Real HTMLVideoElement clocks in the built app; optional private originals stay outside the repo.
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
 await page.setViewportSize({width:390,height:844});
 // Exercise the fallback when an iPhone browser does not expose element fullscreen.
 await page.evaluate(()=>{Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});Object.defineProperty(document.documentElement,'webkitRequestFullscreen',{configurable:true,value:undefined});});
 for(let i=0;i<2;i++)await page.getByLabel(`${i?'自分':'お手本'}の動画を選ぶ`,{exact:true}).setInputFiles(files[i]);
 await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.readyState>=2&&v.duration>=25));
 await page.evaluate(()=>{window.qaTools.configure_practice_tempo.execute({referenceBpm:150,selfBpm:120,rate:1});window.qaVideoElements=[...document.querySelectorAll('.video-stage video')];});
 await button('同期再生').click();await button('停止').waitFor({timeout:15000});await dismiss();
 const before=await page.evaluate(()=>({times:window.qaVideoElements.map(v=>v.currentTime),seeks:window.qaSeeks.length}));
 await button('全画面にする').click();await page.locator('.studio-immersive[data-fullscreen="page"]').waitFor();
 await page.waitForTimeout(3300);
 const layout=async overlay=>{
  await page.waitForTimeout(150); // ResizeObserver packs the pair after viewport/fullscreen changes.
  const data=await page.evaluate(()=>({width:innerWidth,height:innerHeight,root:document.querySelector('.decks').getBoundingClientRect().toJSON(),stages:[...document.querySelectorAll('.video-stage')].map(v=>v.getBoundingClientRect().toJSON()),videos:[...document.querySelectorAll('.video-stage video')].map(v=>({width:v.videoWidth,height:v.videoHeight})),headers:[...document.querySelectorAll('.masthead,.deck-header,.tool-rail,.practice-dock')].map(v=>getComputedStyle(v).display),same:window.qaVideoElements.every((v,i)=>v===document.querySelectorAll('.video-stage video')[i]),overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight}));
  assert.ok(data.same);assert.ok(!data.overflow);assert.ok(data.headers.every(v=>v==='none'));assert.equal(data.root.x,0);assert.equal(data.root.y,0);assert.equal(data.root.width,data.width);assert.equal(data.root.height,data.height);
  for(const [i,s] of data.stages.entries()){
   assert.ok(s.x>=-.1&&s.y>=-.1&&s.right<=data.width+.1&&s.bottom<=data.height+.1,'whole image fits');
   if(overlay){assert.equal(s.width,data.width);assert.equal(s.height,data.height);}
   else assert.ok(Math.abs(s.width/s.height-data.videos[i].width/data.videos[i].height)<.003,'no letterbox inside each frame');
  }
  if(!overlay){const [a,b]=data.stages;assert.ok(Math.abs(data.width>data.height?b.x-a.right:b.y-a.bottom)<.1,'no gap between video images');assert.ok(Math.abs(data.width>data.height?b.right-a.x-data.width:b.width-data.width)<.1,'pair uses available width');}
  return data;
 };
 results.push(await layout(false));assert.equal(await page.locator('.fullscreen-player-controls').getAttribute('data-visible'),'false');
 assert.equal(await page.evaluate(()=>window.qaSeeks.length),before.seeks,'entering fullscreen does not re-seek the videos');assert.ok((await state()).playing);
 await button('再生コントロールを表示').click({position:{x:100,y:100}});await page.getByRole('toolbar',{name:'全画面動画の操作'}).waitFor();
 // Tap must toggle in both directions, including while paused; controls themselves never toggle the stage.
 await button('再生コントロールを隠す').click({position:{x:100,y:100}});assert.equal(await page.locator('.fullscreen-player-controls').getAttribute('data-visible'),'false');
 await button('再生コントロールを表示').click({position:{x:100,y:100}});await button('一時停止').click();
 await button('再生コントロールを隠す').click({position:{x:100,y:100}});assert.equal(await page.locator('.fullscreen-player-controls').getAttribute('data-visible'),'false');
 await button('再生コントロールを表示').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.fullscreen-player-controls').getAttribute('data-visible'),'true');
 await button('再生コントロールを隠す').focus();await page.keyboard.press('Space');assert.equal(await page.locator('.fullscreen-player-controls').getAttribute('data-visible'),'false');
 await button('再生コントロールを表示').click({position:{x:100,y:100}});await button('再生').click();await page.waitForFunction(()=>window.qaVideoElements.every(v=>!v.paused));
 await page.getByRole('slider',{name:'動画の再生位置',exact:true}).focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(1300);assert.ok((await state()).playing,'seek resumes only previously playing media');
 const seekBox=await page.getByRole('slider',{name:'動画の再生位置',exact:true}).boundingBox();await page.mouse.move(seekBox.x+seekBox.width*.4,seekBox.y+seekBox.height/2);await page.mouse.down();await page.keyboard.press('Escape');await page.mouse.up();await page.locator('.studio-immersive').waitFor({state:'hidden'});await button('停止').waitFor({timeout:15000});
 await button('全画面にする').click();await page.locator('.studio-immersive').waitFor();await page.getByRole('slider',{name:'動画の再生位置',exact:true}).focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(1300);assert.ok((await state()).playing,'exiting mid-drag clears stale scrub state and restores playback');
 await button('全画面を終了').click();await page.locator('.studio-immersive').waitFor({state:'hidden'});assert.equal(await page.locator('.studio-immersive').count(),0);await dismiss();await button('停止').click();
 await page.getByRole('tab',{name:'重ねる',exact:true}).click();await button('全画面にする').click();await page.locator('.studio-immersive').waitFor();results.push(await layout(true));
 await page.setViewportSize({width:844,height:390});results.push(await layout(true));await button('全画面を終了').click();await page.locator('.studio-immersive').waitFor({state:'hidden'});
 await page.getByRole('tab',{name:'比較',exact:true}).click();await button('全画面にする').click();await page.locator('.studio-immersive').waitFor();results.push(await layout(false));await page.keyboard.press('Escape');await page.locator('.studio-immersive').waitFor({state:'hidden'});assert.equal(await page.locator('.studio-immersive').count(),0);
 // Native fullscreen path also preserves both media elements and exits through the same control.
 await page.evaluate(()=>{delete document.fullscreenEnabled;delete document.documentElement.webkitRequestFullscreen;});await button('全画面にする').click();await page.locator('.studio-immersive').waitFor();assert.equal(await page.locator('main').getAttribute('data-fullscreen'),'native');await button('全画面を終了').click();await page.locator('.studio-immersive').waitFor({state:'hidden'});
 await button('自分の設定').click();await page.getByRole('tab',{name:'表示',exact:true}).click();const gamma=page.getByRole('slider',{name:'暗部の明るさ（ガンマ）',exact:true});await gamma.focus();await gamma.press('ArrowRight');
 await page.waitForFunction(()=>document.querySelector('.deck-1 video').style.filter.includes('#video-grade-1'));
 await page.locator('[data-slot="switch"][aria-label="骨格を表示"]').click();
 if(process.env.VIEW_SELF){await page.waitForFunction(()=>document.querySelector('.deck-1 .pose-overlay line'),{},{timeout:90000});}
 else{await page.getByText('骨格を検出できない場面',{exact:true}).waitFor({timeout:90000});}
 await page.locator('[data-slot="switch"][aria-label="骨格を表示"]').click();assert.equal(await page.locator('.deck-1 .pose-overlay').count(),0);
 await button('保存して戻る').click();await dismiss();await button('自分の設定').click();await page.getByRole('tab',{name:'表示',exact:true}).click();assert.equal(await gamma.inputValue(),'1.05');
 if(process.env.VIEW_QA_DIR&&process.env.VIEW_SELF){
  await mkdir(process.env.VIEW_QA_DIR,{recursive:true});
  await button('保存して戻る').click();await dismiss();await page.getByRole('tab',{name:'重ねる',exact:true}).click();
  await page.locator('.video-stage video').evaluateAll(v=>v.forEach(el=>el.currentTime=2));
  await button('重ね合わせ調整').click();await page.getByRole('tab',{name:'表示',exact:true}).click();
  for(const [label,name] of [['骨格で比較','bones'],['人物だけ','person'],['色分け','color']]){
   await button(label).click();
   if(name==='bones')await page.waitForFunction(()=>document.querySelectorAll('.pose-overlay line').length>5,{},{timeout:90000});
   else await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.style.opacity==='0'),{},{timeout:60000});
   await button('完了').click();await button('同期再生').click();await button('停止').waitFor({timeout:15000});await dismiss();
   await button('全画面にする').click();await page.locator('.studio-immersive').waitFor();await page.waitForTimeout(3500);
   await page.screenshot({path:resolve(process.env.VIEW_QA_DIR,'viewer-'+name+'.png')});
   const poses=await page.locator('.pose-overlay line').count();if(name==='bones')assert.ok(poses>0);
   results.push({mode:name,poses,state:await state()});
   await button('再生コントロールを表示').click({position:{x:100,y:100}});await page.waitForTimeout(250);await page.screenshot({path:resolve(process.env.VIEW_QA_DIR,'viewer-'+name+'-controls.png')});
   await button('全画面を終了').click();await page.locator('.studio-immersive').waitFor({state:'hidden'});await button('停止').click();
   await button('重ね合わせ調整').click();await page.getByRole('tab',{name:'表示',exact:true}).click();
  }
 }
 assert.deepEqual(errors,[]);console.log('Viewer verified: video-only native/fallback fullscreen, gapless frames, tap show/hide while paused and playing, seek/resume, portrait/landscape comparison + overlay, live pose toggle, gamma and persisted display settings.');
}finally{if(process.env.VIEW_QA_DIR){await mkdir(process.env.VIEW_QA_DIR,{recursive:true});await writeFile(resolve(process.env.VIEW_QA_DIR,'viewer-results.json'),JSON.stringify(results,null,2));}await browser?.close();await new Promise(resolve=>server.close(resolve));}
