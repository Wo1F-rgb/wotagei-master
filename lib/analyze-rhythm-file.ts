import {publicAsset} from './public-assets';
import type {RhythmAnalysisResult} from './analyzed-grid';
import {decodeAnalysisAudio} from './analysis-audio';
export async function analyzeRhythmFile(file:Blob,signal:AbortSignal,onStage:(message:string)=>void):Promise<RhythmAnalysisResult>{
 const {samples,duration}=await decodeAnalysisAudio(file,signal,onStage);
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./rhythm.worker.ts',import.meta.url),{type:'module'});let done=false;
  const finish=(error?:Error,result?:RhythmAnalysisResult)=>{if(done)return;done=true;worker.terminate();clearTimeout(timer);signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(result!);};
  const abort=()=>finish(new DOMException('解析を中止しました','AbortError'));
  const timer=setTimeout(()=>finish(new Error('解析に時間がかかっています。短い区間の音源で試してください。')),Math.min(600000,90000+duration*2000));
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
  worker.onerror=()=>finish(new Error('拍の解析を開始できませんでした。ページを再読み込みして試してください。'));
  worker.onmessage=e=>{if(e.data.stage){onStage(e.data.stage);return;}if(e.data.error)finish(new Error(e.data.error));else if(e.data.result)finish(undefined,e.data.result);};
  worker.postMessage({samples,duration,assets:new URL(publicAsset('beat/'),document.baseURI).href,runtime:new URL(publicAsset('beat-runtime/1.29.0/'),document.baseURI).href},[samples.buffer]);
 });
}
