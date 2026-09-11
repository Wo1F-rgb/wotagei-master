// Exercise real MOV demux, packet remux and PCM decode in a browser. No personal media.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=await readFile(new URL('fixtures/synthetic-150-aac.mov',import.meta.url));
const server=await createServer({configFile:false,root,logLevel:'error',optimizeDeps:{noDiscovery:true,include:['mediabunny']},server:{host:'127.0.0.1',port:0},plugins:[{name:'audio-test-routes',configureServer(server){
 server.middlewares.use('/audio-test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Audio decoding verification</title>');});
 server.middlewares.use('/fixture.mov',(_req,res)=>{res.setHeader('Content-Type','video/quicktime');res.end(fixture);});
}}]});
await server.listen();let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/audio-test`);
 const result=await page.evaluate(async()=>{
  const {decodeAnalysisAudio,placeAnalysisAudio}=await import('/lib/analysis-audio.ts');
  const mb=await import('/node_modules/mediabunny/dist/modules/src/index.js');
  const blob=await(await fetch('/fixture.mov')).blob(),raw=await blob.arrayBuffer();
  const native=await new OfflineAudioContext(1,1,22050).decodeAudioData(raw.slice(0));
  const original=placeAnalysisAudio(native,0,native.duration).samples;
  const calls=[],stages=[],decode=OfflineAudioContext.prototype.decodeAudioData;
  globalThis.AudioDecoder=undefined;globalThis.AudioEncoder=undefined;
  OfflineAudioContext.prototype.decodeAudioData=function(data){
   const bytes=new Uint8Array(data),brand=String.fromCharCode(...bytes.subarray(8,12));calls.push(brand);
   const size=new DataView(data).getUint32(0);let mp4=brand.startsWith('mp4');
   for(let i=16;i+4<=Math.min(size,bytes.length);i+=4)mp4 ||= String.fromCharCode(...bytes.subarray(i,i+4)).startsWith('mp4');
   if(!mp4)return Promise.reject(new DOMException('Simulated Safari brand sniffing rejection','EncodingError'));
   return decode.call(this,data);
  };
  const run=(file,onStage=s=>stages.push(s))=>decodeAnalysisAudio(file,new AbortController().signal,onStage);
  const decoded=await run(blob);
  function difference(a,b,shift=0){let peak=0;for(let n=22050;n<Math.min(a.length,b.length-shift)-22050;n++)peak=Math.max(peak,Math.abs(a[n]-b[n+shift]));return peak;}
  // Add a real QuickTime empty edit (audio starts half a second later).
  async function movFrom(sourceBlob,shift=0,mp4=false){
   const input=new mb.Input({source:new mb.BlobSource(sourceBlob),formats:mb.ALL_FORMATS});
   try{
    const track=await input.getPrimaryAudioTrack(),sink=new mb.EncodedPacketSink(track),target=new mb.BufferTarget();
    const output=new mb.Output({format:mp4?new mb.Mp4OutputFormat():new mb.MovOutputFormat(),target}),source=new mb.EncodedAudioPacketSource(await track.getCodec());
    output.addAudioTrack(source);await output.start();const meta={decoderConfig:await track.getDecoderConfig()};
    for await(const p of sink.packets())await source.add(p.clone({timestamp:p.timestamp+shift}),meta);
    source.close();await output.finalize();return new Blob([target.buffer],{type:mp4?'audio/mp4':'video/quicktime'});
   }finally{input.dispose();}
  }
  const delayed=await run(await movFrom(blob,.5));
  const delayedMp4=await run(await movFrom(blob,.5,true));
  // WAV -> PCM MOV. PCM must work when neither WebCodecs nor decodeAudioData work.
  const sr=48000,length=sr*12,wav=new ArrayBuffer(44+length*2),view=new DataView(wav);
  const text=(s,p)=>{for(let i=0;i<s.length;i++)view.setUint8(p+i,s.charCodeAt(i));};
  text('RIFF',0);view.setUint32(4,wav.byteLength-8,true);text('WAVEfmt ',8);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sr,true);view.setUint32(28,sr*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text('data',36);view.setUint32(40,length*2,true);
  for(let n=0;n<length;n++)view.setInt16(44+n*2,Math.round(Math.sin(n/sr*Math.PI*2*220)*16000),true);
  const pcmMov=await movFrom(new Blob([wav],{type:'audio/wav'}));
  OfflineAudioContext.prototype.decodeAudioData=()=>Promise.reject(new DOMException('Decoder unavailable','EncodingError'));
  const pcm=await run(pcmMov);
  let pcmRms=0;for(const n of pcm.samples)pcmRms+=n*n;pcmRms=Math.sqrt(pcmRms/pcm.samples.length);
  const lawResults=[];
  for(const format of [6,7]){
   const law=new ArrayBuffer(44+8000*12),v=new DataView(law);new Uint8Array(law,0,44).set(new Uint8Array(wav,0,44));
   v.setUint32(4,law.byteLength-8,true);v.setUint16(20,format,true);v.setUint32(24,8000,true);v.setUint32(28,8000,true);v.setUint16(32,1,true);v.setUint16(34,8,true);v.setUint32(40,8000*12,true);new Uint8Array(law,44).fill(128);
   // Unsupported codecs must fail honestly, not report an empty successful grid.
   try{await run(await movFrom(new Blob([law],{type:'audio/wav'})));lawResults.push(false);}catch(e){lawResults.push(e.message.includes('音声を取り出せません'));}
  }
  // Cancelling a pending native decode returns promptly and cannot reach inference.
  OfflineAudioContext.prototype.decodeAudioData=()=>new Promise(()=>{});
  const controller=new AbortController();const pending=decodeAnalysisAudio(new Blob([wav],{type:'audio/wav'}),controller.signal,()=>{});
  setTimeout(()=>controller.abort(),10);
  const cancelled=await Promise.race([pending.then(()=>false,e=>e.name==='AbortError'),new Promise(r=>setTimeout(()=>r(false),1000))]);
  OfflineAudioContext.prototype.decodeAudioData=decode;
  let corrupt='';try{await run(new Blob(['not a movie'],{type:'video/quicktime'}));}catch(e){corrupt=e.message;}
  return {difference:difference(original,decoded.samples),delayedDifference:difference(original,delayed.samples,11025),mp4Difference:difference(original,delayedMp4.samples,11025),duration:decoded.duration,delayedDuration:delayed.duration,leadingSilence:delayed.samples.slice(0,9500).every(n=>n===0),pcmDuration:pcm.duration,pcmRms,lawResults,cancelled,corrupt,calls,stages};
 });
 assert.ok(result.difference<1e-5,JSON.stringify(result));assert.ok(result.delayedDifference<1e-5,JSON.stringify(result));
 assert.ok(result.mp4Difference<1e-5,JSON.stringify(result));
 assert.ok(result.leadingSilence);assert.ok(Math.abs(result.delayedDuration-result.duration-.5)<.002);
 assert.ok(Math.abs(result.pcmDuration-12)<.001);assert.ok(result.pcmRms>.3&&result.pcmRms<.4);
 assert.ok(result.lawResults.every(Boolean));
 assert.ok(result.cancelled);assert.match(result.corrupt,/音声を取り出せません/);assert.ok(!result.calls.includes('qt  '),'MOV should bypass the incompatible native reader');
 assert.ok(result.calls.length>=2);assert.ok(result.stages.some(s=>s.includes('音声だけ')));
 console.log('MOV audio: AAC with no WebCodecs, PCM with no native decoder, negative priming, 500ms empty edit, corrupt file and cancellation verified.');
}finally{await browser?.close();await server.close();}
