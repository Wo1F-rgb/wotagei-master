// Orchestration regression: real video clocks/decoders with deterministic pose-worker responses.
// This checks UI wiring, NOT model accuracy; private real-model validation is documented separately.
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const files=[fileURLToPath(new URL('./fixtures/sync-150.mp4',import.meta.url)),fileURLToPath(new URL('./fixtures/sync-120.mp4',import.meta.url))];
const server=createServer(async(req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length)||'index.html');if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.wasm':'application/wasm','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.qaTools={};document.modelContext={registerTool(t){window.qaTools[t.name]=t}};window.qaSeeks=[];window.qaPoseFrames=0;
  document.addEventListener('seeking',e=>{if(e.target instanceof HTMLVideoElement&&e.target.closest('.video-stage'))window.qaSeeks.push(e.target.currentTime)},true);
  const Original=window.Worker;
  window.Worker=class extends EventTarget{
   constructor(url,options){super();if(!String(url).includes('pose.worker'))return new Original(url,options);this.index=0;this.closed=false;}
   postMessage(data){
    let response={type:'ready'};
    if(data.type==='frame'){
     const i=this.index++%2,t=[...document.querySelectorAll('body>video[aria-hidden="true"]')][i]?.currentTime||0,dx=i===0?.055*Math.sin(t*1.3):0;
     const p=Array.from({length:33},()=>({x:.5+dx,y:.5,visibility:1}));
     for(const [j,x,y] of [[0,.5,.12],[11,.43,.3],[12,.57,.3],[23,.46,.56],[24,.54,.56],[27,.3,.92],[28,.7,.92]])p[j]={x:x+dx,y,visibility:1};
     response={type:'poses',poses:[p]};data.frame.close();window.qaPoseFrames++;
    }
    queueMicrotask(()=>{if(!this.closed)this.onmessage?.({data:response})});
   }
   terminate(){this.closed=true;}
  };
 });
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 const button=name=>page.getByRole('button',{name,exact:true});
 const dismiss=async()=>{if(await button('メッセージを閉じる').count())await button('メッセージを閉じる').click();};
 const configure=input=>page.evaluate(v=>window.qaTools.configure_practice_tempo.execute(v),input);
 const layers=()=>page.locator('.motion-layer').evaluateAll(els=>els.map(el=>({transform:el.style.transform,tracking:el.dataset.tracking})));
 const confirm=async()=>{await button('この2人で解析').waitFor();await page.waitForFunction(()=>!document.querySelector('.auto-alignment-actions .primary')?.disabled);await button('この2人で解析').click();await page.locator('.auto-alignment-dialog').waitFor({state:'hidden',timeout:60000});await dismiss();};
 for(let i=0;i<2;i++)await page.getByLabel(`${i?'自分':'お手本'}の動画を選ぶ`,{exact:true}).setInputFiles(files[i]);
 await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.readyState>=2));
 await button('お手本の三脚').click();await page.waitForTimeout(250);assert.equal(await page.locator('.auto-alignment-dialog').count(),0,'BPM required before tracking');
 await configure({referenceBpm:150,selfBpm:120});await page.locator('.auto-alignment-dialog').waitFor();
 await page.locator('.auto-alignment-actions').getByRole('button',{name:'閉じる',exact:true}).click();await page.waitForTimeout(300);assert.equal(await page.locator('.auto-alignment-dialog').count(),0,'cancel does not reopen');
 await dismiss();await button('お手本の追従設定').click();await confirm();assert.ok((await layers())[0].tracking==='true');
 await button('同期再生').click();await button('停止').waitFor({timeout:15000});await dismiss();await page.waitForTimeout(800);
 const startSeeks=await page.evaluate(()=>window.qaSeeks.length),poseFrames=await page.evaluate(()=>window.qaPoseFrames);
 const moving=async mode=>{
  const samples=[];for(let i=0;i<8;i++){await page.waitForTimeout(180);samples.push({layers:await layers(),time:await page.locator('.deck-0 video').evaluate(v=>v.currentTime)});}
  assert.ok(samples.at(-1).time>samples[0].time+1);assert.ok(new Set(samples.map(v=>v.layers[0].transform)).size>5,mode+' position updates');assert.ok(samples.every(v=>v.layers[1].transform===''));results.push({mode,samples});
 };
 await moving('comparison');await page.getByRole('tab',{name:'重ねる',exact:true}).click();await moving('overlay');
 // Undo removes only the added tracking transform and keeps playback/tempo/analysis intact.
 await button('追従を解除').click();assert.ok((await layers()).every(v=>v.transform===''&&v.tracking===undefined));
 await page.getByRole('tab',{name:'比較',exact:true}).click();await page.waitForTimeout(250);assert.ok((await layers()).every(v=>v.transform===''));
 assert.ok((await page.evaluate(()=>window.qaTools.read_practice_state.execute({}))).playing);await button('追従を再開').click();await moving('resumed comparison');
 await page.getByRole('tab',{name:'比較',exact:true}).click();await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});Object.defineProperty(document.documentElement,'webkitRequestFullscreen',{configurable:true,value:undefined});});
 await button('全画面にする').click();await moving('fullscreen comparison');
 if(await button('再生コントロールを表示').count())await button('再生コントロールを表示').click({position:{x:100,y:100}});
 assert.ok((await button('位置追従を設定').textContent()).includes('位置追従'));
 await button('追従を解除').click();assert.ok((await layers()).every(v=>v.transform===''));assert.equal(await page.locator('.studio-immersive').count(),1,'undo stays fullscreen');
 assert.ok((await button('位置追従を設定').textContent()).includes('OFF'));await button('追従を再開').click();
 await page.setViewportSize({width:844,height:390});await moving('rotated fullscreen');
 assert.equal(await page.evaluate(()=>window.qaSeeks.length),startSeeks,'tracking and view changes do not seek');assert.equal(await page.evaluate(()=>window.qaPoseFrames),poseFrames,'no pose inference during playback');
 if(await button('再生コントロールを表示').count())await button('再生コントロールを表示').click({position:{x:100,y:100}});
 await button('位置追従を設定').click();await page.locator('.studio-immersive').waitFor({state:'hidden'});await page.getByRole('region',{name:'重ね合わせ調整',exact:true}).waitFor();
 // Static manual corrections remain the baseline; tracking never overwrites them.
 const x=page.locator('[data-slot=slider][aria-label=左右] input[type=range]');await x.focus();await x.press('ArrowRight');const manual=await x.inputValue();assert.equal(manual,'1');
 const strength=page.locator('.motion-strength input[type=range]');await strength.focus();await strength.press('ArrowLeft');const savedStrength=await strength.inputValue();
 await button('追従を解除').click();assert.ok((await layers()).every(v=>v.transform===''));assert.equal(await x.inputValue(),manual);assert.equal(await strength.inputValue(),savedStrength);
 await button('追従を再開').click();assert.equal(await x.inputValue(),manual);assert.equal(await strength.inputValue(),savedStrength);
 await strength.focus();await strength.press('Home');await button('追従を解除').click();await button('追従を再開').click();assert.equal(await strength.inputValue(),'0','undo/redo keeps zero strength');assert.ok((await layers()).every(v=>v.transform===''));await strength.press('End');
 await button('完了').click();await page.getByRole('tab',{name:'比較',exact:true}).click();await button('お手本の三脚').click();assert.ok((await layers()).every(v=>v.transform===''));
 await button('お手本の三脚').click();await page.waitForTimeout(200);assert.equal(await page.locator('.auto-alignment-dialog').count(),0,'re-enable reuses analysis');
 await button('自分の三脚').click();await page.waitForTimeout(200);assert.equal((await layers())[1].tracking,'true','both moving defaults to reference spatial master');
 await page.getByRole('tab',{name:'重ねる',exact:true}).click();await button('重ね合わせ調整').click();assert.equal(await x.inputValue(),manual);
 await button('自分を位置の主役にする').click();assert.equal((await layers())[0].tracking,'true');await button('完了').click();await dismiss();
 await button('追従を解除').click();assert.ok((await layers()).every(v=>v.transform===''),'both moving undo clears both layers');
 await button('お手本の三脚').click();await page.waitForTimeout(200);assert.ok((await layers()).every(v=>v.transform===''),'tripod target changes do not re-enable tracking');
 await button('お手本の三脚').click();await dismiss();await button('追従を再開').click();await page.waitForTimeout(200);assert.equal(await page.locator('.auto-alignment-dialog').count(),0);assert.equal((await layers())[0].tracking,'true');
 // Saving settings while disabled cannot re-enable tracking or reopen analysis, even after a seek.
 await button('追従を解除').click();await button('お手本の設定').click();await page.getByRole('tab',{name:'拍の位置',exact:true}).click();await button('保存して戻る').click();await page.waitForTimeout(200);
 assert.equal(await page.locator('.auto-alignment-dialog').count(),0);assert.ok((await layers()).every(v=>v.transform===''));
 await page.locator('.deck-0 video').evaluate(v=>v.currentTime=10);await page.waitForTimeout(150);assert.ok((await layers()).every(v=>v.transform===''));
 await configure({referenceBpm:150.5});await button('お手本の設定').click();await page.getByRole('tab',{name:'拍の位置',exact:true}).click();await button('保存して戻る').click();await page.waitForTimeout(200);assert.equal(await page.locator('.auto-alignment-dialog').count(),0,'changed BPM save while disabled never opens analysis');assert.ok((await layers()).every(v=>v.transform===''));
 await configure({referenceBpm:150});await dismiss();await button('追従を再開').click();
 // A changed tempo invalidates sample pairing. Saving the timing page queues a new confirmation.
 await configure({referenceBpm:151});await page.waitForTimeout(150);assert.ok((await layers()).every(v=>v.transform===''));assert.equal(await page.locator('.auto-alignment-dialog').count(),0,'editing itself never interrupts with a dialog');
 await button('お手本の設定').click();await page.getByRole('tab',{name:'拍の位置',exact:true}).click();await button('保存して戻る').click();await page.locator('.auto-alignment-dialog').waitFor();await confirm();
  await page.locator('.track-nudge').last().click();await page.waitForTimeout(150);assert.ok((await layers()).every(v=>v.transform===''),'beat-origin edit invalidates old pairing');assert.equal(await page.locator('.auto-alignment-dialog').count(),0,'fine nudging remains uninterrupted');
 // Delay the separate single-frame detector across a settings/BPM edit. Its old fit must never overwrite the manual baseline.
 await page.route('**/vision_bundle-*.js',route=>route.fulfill({contentType:'text/javascript',body:`
  export const FilesetResolver={forVisionTasks:async()=>({})};
  export const PoseLandmarker={createFromOptions:()=>new Promise(resolve=>{window.qaReleasePose=()=>{let n=0;resolve({close(){},detect(){const dx=n++===0?0:.15,p=Array.from({length:33},()=>({x:.5+dx,y:.5,visibility:1}));for(const [i,x,y] of [[0,.5,.12],[11,.43,.3],[12,.57,.3],[23,.46,.56],[24,.54,.56],[27,.3,.92],[28,.7,.92]])p[i]={x:x+dx,y,visibility:1};window.qaOldPoseReturned=true;return{landmarks:[p]}}})}})};
 `}));
 await dismiss();await button('重ね合わせ調整').click();const savedX=await x.inputValue();
 await button('今の1コマで合わせる').click();await page.waitForFunction(()=>typeof window.qaReleasePose==='function');
 await button('お手本の設定').click();await configure({referenceBpm:152});await page.evaluate(()=>window.qaReleasePose());await page.waitForFunction(()=>window.qaOldPoseReturned);
 await button('練習画面に戻る').click();await dismiss();await button('重ね合わせ調整').click();assert.equal(await x.inputValue(),savedX,'late single-frame result cannot overwrite manual alignment');
  assert.deepEqual(errors,[]);console.log('Motion orchestration passed: BPM gating, confirmation/cancel, continuous CSS in comparison/overlay/fullscreen, fixed-side preservation, no playback seeks/inference, static baseline, spatial master, tempo/origin invalidation.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
