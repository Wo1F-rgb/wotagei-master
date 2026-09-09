import {FilesetResolver,ImageSegmenter} from '@mediapipe/tasks-vision';
import {maskAlpha,removeGreen} from './background';
let segmenter:ImageSegmenter|null=null;
const output=new OffscreenCanvas(1,1),maskCanvas=new OffscreenCanvas(1,1);
const ctx=output.getContext('2d',{willReadFrequently:true})!,maskCtx=maskCanvas.getContext('2d')!;
const send=(value:unknown,transfer:Transferable[]=[])=>self.postMessage(value,{transfer});
self.onmessage=async(e:MessageEvent)=>{
 const data=e.data;
 if(data.type==='init'){
  try{
   if(!ctx||!maskCtx)throw new Error('OffscreenCanvas 2D unavailable');
   if(data.mode==='person'){
    const files=await FilesetResolver.forVisionTasks(data.wasm);
    segmenter=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:data.model,delegate:'CPU'},runningMode:'VIDEO',outputCategoryMask:false,outputConfidenceMasks:true});
   }
   send({type:'ready'});
  }catch{send({type:'error',message:'背景処理を開始できませんでした。対応するSafari / Chromeで再読み込みするか、背景をOFFにしてください。'});}
  return;
 }
 if(data.type!=='frame')return;
 const frame:ImageBitmap=data.frame;
 try{
  if(output.width!==frame.width||output.height!==frame.height){output.width=frame.width;output.height=frame.height;}
  ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,output.width,output.height);ctx.drawImage(frame,0,0);
  if(segmenter){
   segmenter.segmentForVideo(frame,data.timestamp,result=>{
    const masks=result.confidenceMasks;
    // The square selfie model's single sigmoid output represents the person;
    // runtimes exposing both categories put person at index 1.
    const mask=masks?.length===1?masks[0]:masks?.[1];
    if(!mask)throw new Error('Foreground mask unavailable');
    maskCanvas.width=mask.width;maskCanvas.height=mask.height;
    maskCtx.putImageData(new ImageData(maskAlpha(mask.getAsFloat32Array(),data.threshold),mask.width,mask.height),0,0);
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(maskCanvas,0,0,output.width,output.height);ctx.globalCompositeOperation='source-over';
   });
  }else{
   const pixels=ctx.getImageData(0,0,output.width,output.height);removeGreen(pixels.data,data.threshold);ctx.putImageData(pixels,0,0);
  }
  const bitmap=output.transferToImageBitmap();send({type:'frame',bitmap,epoch:data.epoch,mediaTime:data.mediaTime},[bitmap]);
 }catch{send({type:'error',message:'この動画の背景を処理できませんでした。元の映像を表示しています。'});}
 finally{frame.close();}
};
