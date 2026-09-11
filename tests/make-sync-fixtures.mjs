// Optional fixture generation. Only generated colors/drum pulses; no private media.
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {rhythmFixture} from './audio-fixtures.mjs';
for(const bpm of [120,150]){
 const pcm=rhythmFixture(bpm,{seconds:30,noise:0}),wav=Buffer.alloc(44+pcm.length*2);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);
 for(let i=0;i<pcm.length;i++)wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),44+i*2);
 const input=fileURLToPath(new URL(`./fixtures/generated-${bpm}.wav`,import.meta.url)),output=fileURLToPath(new URL(`./fixtures/sync-${bpm}.mp4`,import.meta.url));
 await writeFile(input,wav);
 try{execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',`color=c=${bpm===120?'purple':'green'}:s=320x180:r=30`,'-i',input,'-t','30','-c:v','libx264','-preset','veryfast','-crf','32','-g','60','-pix_fmt','yuv420p','-c:a','aac','-b:a','48k','-movflags','+faststart',output]);}finally{await unlink(input);}
}
