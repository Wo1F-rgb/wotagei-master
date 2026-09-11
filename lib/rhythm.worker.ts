import * as ort from 'onnxruntime-web/wasm';
import {logMelSpectrogram,rhythmBins,rhythmBorder,rhythmChunks,rhythmPeaks,downbeatsOnBeats} from './rhythm-features';
import {analyzeDetectedGrid,waveformPeaks,type RhythmAnalysisResult} from './analyzed-grid';
import {analyzeSpectralGrid} from './spectral-grid';
type Request={samples:Float32Array;duration:number;assets:string;runtime:string};
self.onmessage=async(event:MessageEvent<Request>)=>{
 let session:ort.InferenceSession|undefined;
 try{
  const {samples,duration,assets,runtime}=event.data;
  if(samples.length<22050*8||samples.length>22050*600)throw new Error('8秒〜10分の音源で解析してください。');
  let energy=0;for(const v of samples)energy+=v*v;if(energy/samples.length<1e-7)throw new Error('音がほとんどありません。曲が聞こえる動画・音源を選んでください。');
  self.postMessage({stage:'拍の解析モデルを準備中… 初回はダウンロードします。'});
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  ort.env.wasm.wasmPaths={mjs:runtime+'ort-wasm-simd-threaded.mjs',wasm:runtime+'ort-wasm-simd-threaded.wasm'};
  const response=await fetch(assets+'mel-filterbank.bin');if(!response.ok)throw new Error('解析モデルを読み込めません。通信を確認してください。');
  const bank=new Float32Array(await response.arrayBuffer());
  session=await ort.InferenceSession.create(assets+'beat-this-small0.onnx',{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  self.postMessage({stage:'曲全体の音を読み取り中…'});
  const spect=logMelSpectrogram(samples,bank),frames=spect.length/rhythmBins,chunks=rhythmChunks(frames),beatLogits=new Float32Array(frames).fill(-1000),downbeatLogits=new Float32Array(frames).fill(-1000),written=new Uint8Array(frames);
  for(const [n,chunk] of chunks.entries()){
   self.postMessage({stage:`曲全体の拍を解析中… ${n+1} / ${chunks.length}`});
   const input=new Float32Array(chunk.length*rhythmBins),from=Math.max(0,chunk.start),to=Math.min(frames,chunk.start+chunk.length);
   input.set(spect.subarray(from*rhythmBins,to*rhythmBins),(from-chunk.start)*rhythmBins);
   const tensor=new ort.Tensor('float32',input,[1,chunk.length,rhythmBins]);
   const outputs=await session.run({spect:tensor});tensor.dispose();
   const beat=outputs.beat.data as Float32Array,downbeat=outputs.downbeat.data as Float32Array;
   for(let j=rhythmBorder;j<chunk.length-rhythmBorder;j++){const index=chunk.start+j;if(index>=0&&index<frames&&!written[index]){beatLogits[index]=beat[j];downbeatLogits[index]=downbeat[j];written[index]=1;}}
   for(const output of Object.values(outputs))output.dispose();
  }
  let beats=rhythmPeaks(beatLogits).filter(t=>t<duration),downbeats=downbeatsOnBeats(beats,rhythmPeaks(downbeatLogits)),grid=analyzeDetectedGrid(beats,downbeats,duration),engine='Beat This! small0';
  if(!grid||grid.variable){
   self.postMessage({stage:'音の繰り返しから拍を確認中…'});
   const alternative=analyzeSpectralGrid({samples,sampleRate:22050});
   if(alternative.grid&&!alternative.grid.variable){beats=alternative.beats;downbeats=[];grid=alternative.grid;engine+=' + spectral fallback';}
  }
  const result:RhythmAnalysisResult={engine,duration,beats,downbeats,waveform:waveformPeaks(samples,Math.ceil(duration*100)),grid};
  self.postMessage({result});
 }catch(e){self.postMessage({error:e instanceof Error?`拍を解析できませんでした。${e.message}`:'拍を解析できませんでした。別の音源で試してください。'});}
 finally{await session?.release();}
};
