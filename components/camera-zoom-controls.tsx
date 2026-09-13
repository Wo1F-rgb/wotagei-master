import {cameraZoomTarget,type CameraDevice,type CameraLens} from '@/lib/camera-lenses';
import type {CameraFacing} from '@/lib/camera-recording';

export function CameraZoomControls({lens,devices,facing,busy,locked,change}:{lens:CameraLens;devices:CameraDevice[];facing:CameraFacing;busy:boolean;locked:boolean;change:(value:number)=>void}){
 return <div className="camera-zoom-controls" role="group" aria-label="カメラ倍率" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
  <span>{busy?'切替中':'画角'}</span>{[.5,1,2].map(value=>{
   const target=cameraZoomTarget(value,devices,lens,facing),available=!!target,active=target?.deviceId===lens.deviceId&&Math.abs(lens.zoom-value)<.02;
   return <button key={value} type="button" aria-label={`カメラ${value}倍`} aria-pressed={active} disabled={busy||locked||!available} title={!available?'対応する超広角レンズがありません':locked?'録画停止中に変更':value===.5?'超広角レンズ':'カメラの画角を変更'} onClick={()=>change(value)}>{value}×</button>;
  })}{![.5,1,2].some(v=>Math.abs(lens.zoom-v)<.02)?<small>{Number(lens.zoom.toFixed(2))}×</small>:lens.digital>1.01&&<small>デジタル</small>}
 </div>;
}
