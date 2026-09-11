// Run the emitted worker + ONNX WASM in Chromium at a Pages subpath.
// Synthetic audio only; personal media is never committed.
import {readFile,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {rhythmFixture} from './audio-fixtures.mjs';
const root=fileURLToPath(new URL('../dist-pages/',import.meta.url)),prefix='/wotagei-master/';
const workers=(await readdir(resolve(root,'assets'))).filter(n=>/^rhythm\.worker-.*\.js$/.test(n));assert.equal(workers.length,1);
const config=JSON.parse(await readFile(resolve(root,'beat/config.json'),'utf8'));
for(const asset of [config.model,config.melFilterbank])assert.equal(createHash('sha256').update(await readFile(resolve(root,'beat',asset.file))).digest('hex'),asset.sha256);
const samples=rhythmFixture(150,{seconds:20});
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),route=decodeURIComponent(url.pathname);
 if(route===prefix+'test'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Worker verification</title>');return;}
 if(route===prefix+'fixture'){res.setHeader('Content-Type','application/octet-stream');res.end(Buffer.from(samples.buffer));return;}
 if(!route.startsWith(prefix))throw Error('outside root');
 const file=resolve(root,route.slice(prefix.length));if(!file.startsWith(resolve(root)+sep))throw Error('outside root');
 res.setHeader('Content-Type',({'.wasm':'application/wasm','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json'})[extname(file)]||'application/octet-stream');
 res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
 const page=await browser.newPage(),base=`http://127.0.0.1:${server.address().port}${prefix}`;await page.goto(base+'test');
 const run=async(silent=false)=>page.evaluate(async({url,base,silent})=>{
  const samples=silent?new Float32Array(22050*20):new Float32Array(await(await fetch(base+'fixture')).arrayBuffer());
  return new Promise((resolve,reject)=>{
   const w=new Worker(url,{type:'module'}),timer=setTimeout(()=>{w.terminate();reject(Error('worker timeout'));},90000),stages=[];
   w.onerror=e=>{w.terminate();clearTimeout(timer);reject(Error(e.message));};
   w.onmessage=e=>{if(e.data.stage){stages.push(e.data.stage);return;}w.terminate();clearTimeout(timer);resolve({...e.data,stages});};
   w.postMessage({samples,duration:20,assets:base+'beat/',runtime:base+'beat-runtime/1.29.0/'},[samples.buffer]);
  });
 },{url:base+'assets/'+workers[0],base,silent});
 const result=await run();assert.ok(!result.error,result.error);assert.ok(result.result.grid&&!result.result.grid.variable,JSON.stringify(result));
 assert.ok(Math.abs(result.result.grid.bpm-150)<1,JSON.stringify(result.result.grid));
 assert.ok(result.stages.some(s=>s.includes('1 / 1')),'The real neural inference must execute, not just a fallback');
 const silent=await run(true);assert.ok(silent.error);assert.ok(!silent.result,'silence cannot become a default 120 BPM grid');
 console.log('Built rhythm worker: real ONNX/WASM, Pages subpath, 150 BPM audio and silence verified.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
