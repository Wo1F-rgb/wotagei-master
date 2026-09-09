import {FilesetResolver,PoseLandmarker} from '@mediapipe/tasks-vision';
let detector:PoseLandmarker|null=null;
self.onmessage=async(e:MessageEvent)=>{
 const data=e.data;
 if(data.type==='init'){
  try{const files=await FilesetResolver.forVisionTasks(data.wasm);detector=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:data.model,delegate:'CPU'},runningMode:'IMAGE',numPoses:3,minPoseDetectionConfidence:.4,minPosePresenceConfidence:.4});self.postMessage({type:'ready'});}
  catch{self.postMessage({type:'error',message:'骨格モデルを読み込めませんでした。通信を確認してもう一度試してください。'});}
  return;
 }
 if(data.type!=='frame')return;
 const frame:ImageBitmap=data.frame;
 try{if(!detector)throw Error('not ready');const result=detector.detect(frame);self.postMessage({type:'poses',poses:result.landmarks.map(p=>p.map(({x,y,visibility})=>({x,y,visibility})))});}
 catch{self.postMessage({type:'error',message:'動画の骨格を解析できませんでした。別の場面で試してください。'});}
 finally{frame.close();}
};
