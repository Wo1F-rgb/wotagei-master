export function rhythmFixture(bpm,{seconds=42,fs=22050,offset=.173,noise=.015}={}){
 const pcm=new Float32Array(seconds*fs);let seed=853;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};
 for(let n=0;n<pcm.length;n++)pcm[n]=random()*noise+.018*Math.sin(2*Math.PI*220*n/fs);
 for(let beat=0;offset+beat*60/bpm<seconds;beat++){
  const start=Math.floor((offset+beat*60/bpm)*fs);
  for(let n=0;n<fs*.12&&start+n<pcm.length;n++){const t=n/fs;pcm[start+n]+=.7*Math.sin(2*Math.PI*(55*t+20*.02*(1-Math.exp(-t/.02))))*Math.exp(-t*35);if(beat%2)pcm[start+n]+=random()*.25*Math.exp(-t*50);}
  const hat=start+Math.floor(30/bpm*fs);for(let n=0;n<fs*.03&&hat+n<pcm.length;n++)pcm[hat+n]+=random()*.1*Math.exp(-n/fs*120);
 }
 return pcm;
}
