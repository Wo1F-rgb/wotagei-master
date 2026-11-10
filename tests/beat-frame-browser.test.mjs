import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import ts from 'typescript';

test('native browser decoding exports distinct beat images without changing the main player',async t=>{
 try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{t.skip('Optional native-video smoke test requires ffmpeg.');return;}
 let browser;
 try{browser=await chromium.launch({headless:true});}catch{t.skip('Optional native-video smoke test requires Playwright Chromium.');return;}
 const directory=await mkdtemp(join(tmpdir(),'beat-frame-test-'));let server;
 try{
  const fixture=join(directory,'colors.mp4');
  execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=red:s=1920x1080:r=30:d=2','-vf',"drawbox=color=lime:t=fill:enable='gte(t,0.5)*lt(t,1)',drawbox=color=blue:t=fill:enable='gte(t,1)*lt(t,1.5)',drawbox=color=white:t=fill:enable='gte(t,1.5)'",'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart',fixture]);
  const media=await readFile(fixture),modules=new Map();
  for(const name of ['beat-frames','beat-frame-capture','beat-frame-export'])modules.set(`/${name}.ts`,ts.transpileModule(await readFile(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  server=createServer((request,response)=>{
   if(request.url==='/colors.mp4'){
    const match=/bytes=(\d+)-(\d*)/.exec(request.headers.range||'');
    if(match){const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),media.length-1):media.length-1;response.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${media.length}`,'Content-Length':end-start+1});response.end(media.subarray(start,end+1));}
    else{response.writeHead(200,{'Content-Type':'video/mp4','Content-Length':media.length});response.end(media);}
   }else if(modules.has(request.url)){response.writeHead(200,{'Content-Type':'text/javascript'});response.end(modules.get(request.url));}
   else{response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><body></body>');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async()=>{
   const {createBeatFrameGrid}=await import('/beat-frames.ts'),{createBeatFrameCapture}=await import('/beat-frame-capture.ts'),{exportBeatFrames}=await import('/beat-frame-export.ts');
   const main=document.createElement('video');main.src='/colors.mp4';main.muted=true;document.body.appendChild(main);
   await new Promise((resolve,reject)=>{main.onloadeddata=resolve;main.onerror=reject;});
   main.currentTime=.4;await new Promise(resolve=>main.addEventListener('seeked',resolve,{once:true}));main.playbackRate=.7;main.muted=false;
   const before=[main.currentTime,main.playbackRate,main.muted,main.paused];
   const reader=await createBeatFrameCapture('/colors.mp4',{signal:new AbortController().signal});
   const sample=async blob=>{const image=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);const pixel=[...context.getImageData(40,40,1,1).data].slice(0,3);const size=[image.width,image.height];image.close();return {pixel,size};};
   const pixels=[];
   for(const time of [0,.25,.75,1.25,1.75,1.75,1.99,0])pixels.push(await sample(await reader.capture(time)));
   reader.dispose();
   const progress=[],output=await exportBeatFrames({source:'/colors.mp4',grid:createBeatFrameGrid({duration:2,bpm:120,origin:.25}),signal:new AbortController().signal,onProgress:p=>progress.push(p.done)});
   const exported=[];for(const file of output.files)exported.push(await sample(file));
   return {pixels,exported,progress,before,after:[main.currentTime,main.playbackRate,main.muted,main.paused],videos:document.querySelectorAll('video').length,zipType:output.zip.type};
  });
  const red=p=>p[0]>180&&p[1]<40&&p[2]<40,green=p=>p[1]>180&&p[0]<40&&p[2]<40,blue=p=>p[2]>180&&p[0]<40&&p[1]<40,white=p=>p.every(v=>v>230);
  for(const [index,check] of [red,red,green,blue,white,white,white,red].entries())assert.ok(check(result.pixels[index].pixel),JSON.stringify(result.pixels[index]));
  for(const [index,check] of [red,green,blue,white].entries())assert.ok(check(result.exported[index].pixel));
  assert.ok(result.pixels.every(p=>p.size[0]===1280&&p.size[1]===720));
  assert.deepEqual(result.before,result.after);assert.equal(result.videos,1);assert.deepEqual(result.progress,[0,1,2,3,4]);assert.equal(result.zipType,'application/zip');
 }finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
