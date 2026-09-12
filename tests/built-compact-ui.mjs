// Compact screens in the built app, including real media and persisted settings.
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
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
 const page=await browser.newPage({viewport:{width:390,height:700}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.qaTools={};document.modelContext={registerTool(t){window.qaTools[t.name]=t;}};});
 await page.goto(process.env.APP_TEST_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
 const button=name=>page.getByRole('button',{name,exact:true});
 const dismiss=async()=>{if(await button('メッセージを閉じる').count())await button('メッセージを閉じる').click();};
 const capture=async name=>{
  const data=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight+1,stages:[...document.querySelectorAll('.video-stage')].filter(e=>e.getBoundingClientRect().width).map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height}}),text:document.body.innerText.length}));
  assert.ok(!data.overflow,`${name}: page stays within the viewport`);results.push({name,...data});
  if(name.startsWith('speed-'))assert.ok(await page.locator('.practice-dialog').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'speed settings fit without scrolling');
  if(process.env.COMPACT_QA_DIR){await mkdir(process.env.COMPACT_QA_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.COMPACT_QA_DIR,`${name}.png`),animations:'disabled'});}
 };
 for(const [name,size] of [['portrait',{width:390,height:700}],['landscape',{width:844,height:390}]]){
  await page.setViewportSize(size);
  await capture(`empty-${name}`);
  const boxes=await page.locator('.empty-stage .source-choices').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
  assert.equal(boxes.length,2);assert.ok(boxes[0].right<=boxes[1].left||boxes[0].bottom<=boxes[1].top,'source pickers never overlap');
 }
 await page.setViewportSize({width:390,height:700});
 for(let i=0;i<2;i++)await page.getByLabel(`${i?'自分':'お手本'}の動画を選ぶ`,{exact:true}).setInputFiles(files[i]);
 await page.waitForFunction(()=>[...document.querySelectorAll('.video-stage video')].every(v=>v.readyState>=2&&v.duration>=25));
 assert.equal(await page.locator('.notice').count(),0,'loading files does not overlay a success log');
 await dismiss();await page.evaluate(()=>window.qaTools.configure_practice_tempo.execute({referenceBpm:150,selfBpm:120,rate:1}));
 for(const [name,size] of [['portrait',{width:390,height:700}],['landscape',{width:844,height:390}]]){
  await page.setViewportSize(size);await page.getByRole('tab',{name:'比較',exact:true}).click();await capture(`compare-${name}`);
  assert.equal(await page.locator('.track-row:visible').count(),2,'both tracks stay visible');
  await page.getByRole('tab',{name:'重ねる',exact:true}).click();await capture(`overlay-${name}`);
  await button('練習速度と鳴らす音を設定').click();await capture(`speed-${name}`);
  assert.equal(await page.locator('.playback-status').count(),0,'technical playback logs are not rendered');
  await page.getByLabel('矢印1回のずらし量',{exact:true}).selectOption('0.005');
  await page.getByLabel('練習速度（詳細）',{exact:true}).fill('0.875');
  await button('完了').click();
  assert.equal(await page.getByLabel('練習速度と鳴らす音を設定').locator('strong').innerText(),'0.875×');
  await button('お手本の設定').click();
  for(const tab of ['拍・BPM','拍の位置','表示','画角','動画']){
   await page.getByRole('tab',{name:tab,exact:true}).click();if(tab==='拍の位置')assert.ok(await button('この位置を1拍目にする').isVisible());await capture(`settings-${tab}-${name}`);
   await button('保存して戻る').scrollIntoViewIfNeeded();assert.ok(await button('保存して戻る').isVisible());
  }
  await page.getByRole('tab',{name:'拍の位置',exact:true}).click();await page.getByLabel('1拍目の位置（秒）',{exact:true}).fill('1.234567');
  await button('保存して戻る').click();
  assert.equal(await page.locator('.notice').count(),0,'successful save has no overlay');await dismiss();
  await button('お手本の設定').click();await page.getByRole('tab',{name:'拍の位置',exact:true}).click();assert.equal(Number(await page.getByLabel('1拍目の位置（秒）',{exact:true}).inputValue()),1.234567);
  await button('保存して戻る').click();await dismiss();
 }
 // A failing save remains visible and keeps the settings open.
 await button('お手本の設定').click();
 await page.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k.startsWith('wotagei:video:'))throw new DOMException('Full','QuotaExceededError');return original.call(this,k,v);};});
 await button('保存して戻る').click();assert.equal(await page.locator('main.editing').count(),1);assert.match(await page.locator('.notice').innerText(),/保存できません/);await page.evaluate(()=>window.restoreStorage());await dismiss();await button('保存して戻る').click();await dismiss();
 assert.deepEqual(errors,[]);
 if(process.env.COMPACT_QA_DIR)await writeFile(resolve(process.env.COMPACT_QA_DIR,'layout.json'),JSON.stringify(results,null,2));
 console.log('Compact UI: portrait/landscape, separate pickers, persistent tracks, every settings tab, fine speed/origin persistence and visible save errors verified.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
