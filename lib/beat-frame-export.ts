import {beatFrameFilename,beatFrameTime,createBeatFrameGrid,type BeatFrameGrid} from './beat-frames.ts';
import {checkBeatFrameAbort,createBeatFrameCapture} from './beat-frame-capture.ts';

export const DEFAULT_BEAT_FRAME_MAX_BYTES=128*1024*1024;
export type BeatFrameProgress={done:number;total:number;bytes:number};
type ZipOptions={signal?:AbortSignal;maxBytes?:number};
const encoder=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,value)=>{
 for(let i=0;i<8;i++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;
 return value>>>0;
});
export function crc32(bytes:Uint8Array):number {
 let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);
 return (crc^0xffffffff)>>>0;
}
function memoryLimit(value=DEFAULT_BEAT_FRAME_MAX_BYTES){
 if(!Number.isSafeInteger(value)||value<1)throw new RangeError('保存容量の上限が正しくありません。');
 return value;
}
const capacityError=()=>new Error('すべての画像を保存するための容量上限を超えました。短い動画を使用してください。一部だけの保存は行っていません。');
function zipSize(files:readonly File[]){
 if(files.length>65535)throw new Error('画像が65,535枚を超えるためZIPに保存できません。動画を短くしてください。');
 let size=22;
 for(const file of files){
  const length=encoder.encode(file.name).length;
  if(length>65535||file.size>0xffffffff)throw capacityError();
  size+=file.size+76+2*length;
 }
 if(size>0xffffffff)throw capacityError();
 return size;
}
function header(length:number){const bytes=new Uint8Array(length);return {bytes,view:new DataView(bytes.buffer)};}

/** ZIP32, UTF-8 names, stored entries. JPEGs are already compressed. */
export async function createStoredZip(files:readonly File[],options:ZipOptions={}):Promise<Blob>{
 const maxBytes=memoryLimit(options.maxBytes),size=zipSize(files);
 checkBeatFrameAbort(options.signal);
 // Budget both the individual photos and their archive, plus one CRC read buffer.
 const photoBytes=files.reduce((sum,file)=>sum+file.size,0),largest=files.reduce((max,file)=>Math.max(max,file.size),0);
 if(photoBytes+size+largest>maxBytes)throw capacityError();
 const chunks:BlobPart[]=[],central:Uint8Array<ArrayBuffer>[]=[];let offset=0;
 for(const file of files){
  checkBeatFrameAbort(options.signal);
  const name=encoder.encode(file.name),data=new Uint8Array(await file.arrayBuffer());
  checkBeatFrameAbort(options.signal);const crc=crc32(data);
  const local=header(30+name.length),lv=local.view;
  lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(12,33,true);
  lv.setUint32(14,crc,true);lv.setUint32(18,file.size,true);lv.setUint32(22,file.size,true);lv.setUint16(26,name.length,true);local.bytes.set(name,30);
  chunks.push(local.bytes,file);
  const entry=header(46+name.length),ev=entry.view;
  ev.setUint32(0,0x02014b50,true);ev.setUint16(4,20,true);ev.setUint16(6,20,true);ev.setUint16(8,0x800,true);ev.setUint16(14,33,true);
  ev.setUint32(16,crc,true);ev.setUint32(20,file.size,true);ev.setUint32(24,file.size,true);ev.setUint16(28,name.length,true);ev.setUint32(42,offset,true);entry.bytes.set(name,46);
  central.push(entry.bytes);offset+=local.bytes.byteLength+file.size;
  // Yield between images so cancellation and browser painting remain responsive.
  await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 checkBeatFrameAbort(options.signal);
 const directorySize=central.reduce((sum,part)=>sum+part.byteLength,0),end=header(22),ev=end.view;
 ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,directorySize,true);ev.setUint32(16,offset,true);
 return new Blob([...chunks,...central,end.bytes],{type:'application/zip'});
}

export type BeatFrameExportOptions={
 grid:BeatFrameGrid;source:string|Blob;signal:AbortSignal;mirror?:boolean;prefix?:string;
 maxBytes?:number;onProgress?:(progress:BeatFrameProgress)=>void;
};

export async function exportBeatFrames(options:BeatFrameExportOptions):Promise<{files:File[];zip:Blob}>{
 const {signal,onProgress}=options,maxBytes=memoryLimit(options.maxBytes);
 checkBeatFrameAbort(signal);
 // Revalidate public input, retaining the exact source BPM and first-beat origin.
 const grid=createBeatFrameGrid(options.grid);
 if(grid.count>65535)throw new Error('画像が65,535枚を超えるため保存できません。動画を短くしてください。');
 // Even empty JPEG entries must fit. No frame list is allocated in advance.
 if(grid.count*256>maxBytes)throw capacityError();
 const capture=await createBeatFrameCapture(options.source,{signal,mirror:options.mirror});
 const files:File[]=[];let bytes=0,largest=0,overhead=22;
 try{
  // Prevent accidental use of a timeline belonging to another/replaced video.
  if(Math.abs(capture.duration-grid.duration)>.05)throw new Error('動画の長さが変わりました。拍の設定を確認してください。');
  onProgress?.({done:0,total:grid.count,bytes:0});
  for(let index=0;index<grid.count;index++){
   checkBeatFrameAbort(signal);
   const time=beatFrameTime(grid,index),blob=await capture.capture(time),name=beatFrameFilename(index,time,options.prefix);
   checkBeatFrameAbort(signal);bytes+=blob.size;largest=Math.max(largest,blob.size);overhead+=76+2*encoder.encode(name).length;
   if(2*bytes+overhead+largest>maxBytes)throw capacityError();
   files.push(new File([blob],name,{type:'image/jpeg',lastModified:0}));
   onProgress?.({done:index+1,total:grid.count,bytes});
  }
  const zip=await createStoredZip(files,{signal,maxBytes});
  checkBeatFrameAbort(signal);return {files,zip};
 }finally{capture.dispose();}
}
