import {publicAsset} from './public-assets';
import type {Point} from './pose-geometry';
function capture(video:HTMLVideoElement){
 if(video.readyState<2||!video.videoWidth||video.seeking)throw new Error('動画の読み込みが終わってから骨格を合わせてください。');
 const canvas=document.createElement('canvas'),ratio=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);
 canvas.getContext('2d')!.drawImage(video,0,0,canvas.width,canvas.height);
 return canvas;
}
export async function detectPoses(videos:HTMLVideoElement[]):Promise<Point[][]>{
 // Capture both frames before loading the model so a live camera cannot shift between captures.
 const frames=videos.map(capture),{FilesetResolver,PoseLandmarker}=await import('@mediapipe/tasks-vision');
 const files=await FilesetResolver.forVisionTasks(publicAsset('pose/wasm'));
 const landmarker=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:publicAsset('pose/pose_landmarker_lite.task'),delegate:'CPU'},runningMode:'IMAGE',numPoses:1,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6});
 try{return frames.map(frame=>{const landmarks=landmarker.detect(frame).landmarks[0];if(!landmarks)throw new Error('人物を検出できません。明るく、体が隠れていない場面を選んでください。');return landmarks.map(p=>({x:p.x,y:p.y,visibility:p.visibility}));});}
 finally{landmarker.close();frames.forEach(c=>{c.width=0;c.height=0;});}
}
