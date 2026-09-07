import type {BpmAnalysis,AnalysisWindow} from './bpm-analysis';
export async function analyzeFile(file:Blob,signal:AbortSignal,onStage:(message:string)=>void):Promise<BpmAnalysis>{
 if(file.size>80*1024*1024)throw new Error('80MBを超える動画は、短く切り出すかMP3・M4A・WAVの音源を選んでください。');
 signal.throwIfAborted();onStage('音声を読み込み中…');
 const context=new OfflineAudioContext(1,1,22050);
 let buffer:AudioBuffer;
 try{buffer=await context.decodeAudioData(await file.arrayBuffer());}catch{throw new Error('この動画から音声を読み出せませんでした。「音源を選ぶ」でMP3・M4A・WAVを指定してください。');}
 signal.throwIfAborted();
 if(buffer.duration<8)throw new Error('8秒以上、できれば20秒以上の音がある動画・音源を使ってください。');
 if(buffer.duration>600)throw new Error('長い音源は10分以内に切り出して解析してください。');
 const length=Math.min(18,buffer.duration),last=buffer.duration-length;
 const starts=last<4?[0]:last<12?[0,last]:[0,last/2,last];
 const windows:AnalysisWindow[]=starts.map(start=>{const offset=Math.floor(start*buffer.sampleRate),size=Math.min(Math.floor(length*buffer.sampleRate),buffer.length-offset),samples=new Float32Array(size);
  // Retain the louder stereo channel: averaging anti-phase recordings can cancel the beat.
  let channel=0,best=-1;for(let c=0;c<buffer.numberOfChannels;c++){const raw=buffer.getChannelData(c);let energy=0;for(let n=offset;n<offset+size;n+=8)energy+=raw[n]*raw[n];if(energy>best){best=energy;channel=c;}}
  samples.set(buffer.getChannelData(channel).subarray(offset,offset+size));return {samples,start,sampleRate:buffer.sampleRate};});
 onStage(`${windows.length}区間の拍を解析中…`);
 return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./bpm.worker.ts',import.meta.url),{type:'module'});let done=false;
  const finish=(error?:Error,result?:BpmAnalysis)=>{if(done)return;done=true;worker.terminate();clearTimeout(timer);signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(result!);};
  const abort=()=>finish(new DOMException('解析を中止しました','AbortError'));
  const timer=setTimeout(()=>finish(new Error('解析に時間がかかっています。短い音源で試してください。')),45000);
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
  worker.onerror=()=>finish(new Error('解析処理を開始できませんでした。ページを再読み込みして試してください。'));
  worker.onmessage=e=>e.data.error?finish(new Error(e.data.error)):finish(undefined,e.data.result);
  worker.postMessage({windows},windows.map(w=>w.samples.buffer));
 });
}
