// Beat This! front end: 22050 Hz, 1024-point periodic Hann STFT, hop441,
// reflect-centred padding, magnitude / sqrt(1024), exact trained mel bank.
export const rhythmSampleRate=22050,rhythmHop=441,rhythmBins=128,rhythmWindow=1500,rhythmBorder=6;
const size=1024;
function fft(real:Float64Array,imag:Float64Array){
 for(let i=1,j=0;i<size;i++){let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const r=real[i];real[i]=real[j];real[j]=r;}}
 for(let length=2;length<=size;length*=2){const angle=-2*Math.PI/length,wr=Math.cos(angle),wi=Math.sin(angle);for(let start=0;start<size;start+=length){let r=1,im=0;for(let j=0;j<length/2;j++){const a=start+j,b=a+length/2,tr=real[b]*r-imag[b]*im,ti=real[b]*im+imag[b]*r;real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;const next=r*wr-im*wi;im=r*wi+im*wr;r=next;}}}
}
export function logMelSpectrogram(samples:Float32Array,bank:Float32Array):Float32Array{
 if(samples.length<size||bank.length!==513*rhythmBins)throw new Error('音声解析データの形式を確認してください。');
 const frames=Math.floor(samples.length/rhythmHop)+1,result=new Float32Array(frames*rhythmBins),real=new Float64Array(size),imag=new Float64Array(size),mel=new Float64Array(rhythmBins);
 const hann=Float64Array.from({length:size},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/size));
 const sparse=Array.from({length:513},(_,i)=>{const row:{mel:number;weight:number}[]=[];for(let j=0;j<rhythmBins;j++)if(bank[i*rhythmBins+j])row.push({mel:j,weight:bank[i*rhythmBins+j]});return row;});
 for(let frame=0;frame<frames;frame++){
  for(let i=0;i<size;i++){let index=frame*rhythmHop+i-size/2;if(index<0)index=-index;if(index>=samples.length)index=2*samples.length-2-index;real[i]=samples[index]*hann[i];}imag.fill(0);fft(real,imag);mel.fill(0);
  for(let i=0;i<513;i++){const magnitude=Math.hypot(real[i],imag[i])/32;for(const entry of sparse[i])mel[entry.mel]+=magnitude*entry.weight;}
  for(let j=0;j<rhythmBins;j++)result[frame*rhythmBins+j]=Math.log1p(1000*mel[j]);
 }
 return result;
}
export function rhythmChunks(frames:number):{start:number;length:number}[]{
 const starts:number[]=[];for(let start=-rhythmBorder;start<frames-rhythmBorder;start+=rhythmWindow-2*rhythmBorder)starts.push(start);
 if(frames>rhythmWindow-2*rhythmBorder)starts[starts.length-1]=frames-(rhythmWindow-rhythmBorder);
 return starts.map(start=>({start,length:Math.min(rhythmWindow,frames+2*rhythmBorder)}));
}
export function rhythmPeaks(logits:Float32Array):number[]{
 const peaks:number[]=[];
 for(let i=0;i<logits.length;i++){if(logits[i]<=0)continue;let max=-Infinity;for(let j=Math.max(0,i-3);j<=Math.min(logits.length-1,i+3);j++)max=Math.max(max,logits[j]);if(logits[i]===max)peaks.push(i);}
 const groups:{mean:number;count:number}[]=[];for(const p of peaks){const last=groups.at(-1);if(last&&p-last.mean<=1){last.count++;last.mean+=(p-last.mean)/last.count;}else groups.push({mean:p,count:1});}
 return groups.map(g=>g.mean/50);
}
export function downbeatsOnBeats(beats:number[],downbeats:number[]):number[]{
 if(!beats.length)return [];
 return [...new Set(downbeats.map(t=>beats.reduce((a,b)=>Math.abs(a-t)<=Math.abs(b-t)?a:b)))].sort((a,b)=>a-b);
}
