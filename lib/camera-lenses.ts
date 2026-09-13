import type {CameraFacing} from './camera-recording';

export type CameraDevice={id:string;label:string;kind:'ultrawide'|'wide'|'telephoto'|'other';facing?:CameraFacing};
export type CameraLens={deviceId:string;base:number;zoom:number;digital:number;canWiden:boolean};
export const defaultCameraLens:CameraLens={deviceId:'',base:1,zoom:1,digital:1,canWiden:false};
type ZoomTrack=MediaStreamTrack;
type ZoomSettings=MediaTrackSettings&{zoom?:number};
type ZoomCapabilities=MediaTrackCapabilities&{zoom?:{min:number;max:number;step?:number}};

export function cameraKind(label:string):CameraDevice['kind']{
 const text=label.toLowerCase();
 // Virtual dual/triple cameras do not identify the currently selected lens.
 if(/dual|triple|デュアル|トリプル/.test(text))return 'other';
 if(/ultra[\s-]*wide|超広角|超广角|超廣角|ultra grand|ultraweit/.test(text))return 'ultrawide';
 if(/telephoto|tele[\s-]*lens|望遠|长焦|長焦|téléobjectif/.test(text))return 'telephoto';
 if(/wide|広角|广角|廣角|grand.angle|weitwinkel/.test(text))return 'wide';
 return 'other';
}
function facingLabel(label:string):CameraFacing|undefined{
 if(/front|user|facetime|前面|前置|インカメ|avant|frontal|vorder/i.test(label))return 'user';
 if(/back|rear|environment|背面|后置|後置|外カメ|arrière|rück/i.test(label))return 'environment';
}
export function cameraDevices(list:MediaDeviceInfo[],track:MediaStreamTrack,facing:CameraFacing):CameraDevice[]{
 const active=track.getSettings().deviceId,seen=new Set<string>();
 return list.filter(d=>d.kind==='videoinput'&&d.deviceId&&!seen.has(d.deviceId)&&seen.add(d.deviceId)).map((d,i)=>{
  let direction=facingLabel(d.label);
  try{const modes=(d as InputDeviceInfo).getCapabilities?.().facingMode;if(modes?.length===1&&(modes[0]==='user'||modes[0]==='environment'))direction=modes[0];}catch{}
  if(d.deviceId===active)direction=facing;
  const kind=cameraKind(d.label);
  // An unlabelled direction stays manual: front cameras can be ultrawide too.
  return {id:d.deviceId,label:d.label||`カメラ ${i+1}`,kind,facing:direction};
 });
}
function zoomRange(track:ZoomTrack){
 try{const z=(track.getCapabilities?.() as ZoomCapabilities|undefined)?.zoom;return z&&Number.isFinite(z.min)&&Number.isFinite(z.max)&&z.min>0&&z.max>=z.min?z:null;}catch{return null;}
}
function hardwareZoom(track:ZoomTrack){const n=(track.getSettings() as ZoomSettings).zoom;return typeof n==='number'&&Number.isFinite(n)&&n>0?n:null;}
export function readCameraLens(track:ZoomTrack,devices:CameraDevice[]):CameraLens{
 const settings=track.getSettings(),device=devices.find(d=>d.id===settings.deviceId);
 const kind=device&&device.kind!=='other'?device.kind:cameraKind(track.label);
 const base=kind==='ultrawide'?.5:1,range=zoomRange(track);
 return {deviceId:settings.deviceId||'',base,zoom:base*(hardwareZoom(track)??1),digital:1,canWiden:!!range&&range.min*base<=.5&&hardwareZoom(track)!==null};
}
export function cameraZoomTarget(value:number,devices:CameraDevice[],active:CameraLens,facing:CameraFacing){
 if(![.5,1,2].includes(value))return null;
 const rear=devices.filter(d=>d.facing==='environment');
 const device=facing==='environment'?(value===.5?rear.find(d=>d.kind==='ultrawide'):rear.find(d=>d.kind==='wide')):undefined;
 const base=device?(device.kind==='ultrawide'?.5:1):active.base;
 if(value<base&&!active.canWiden&&!device)return null;
 return {deviceId:device?.id||active.deviceId,base,zoom:value};
}
/** Hardware crop when exposed; otherwise a real crop shared by preview and encoder. */
export async function applyCameraZoom(track:ZoomTrack,lens:CameraLens,value:number):Promise<CameraLens>{
 const raw=value/lens.base,range=zoomRange(track);let actual=hardwareZoom(track);
 if(range&&actual!==null){
  const step=range.step||.01,target=Math.max(range.min,Math.min(range.max,range.min+Math.floor((raw-range.min)/step+1e-6)*step));
  try{await track.applyConstraints({...track.getConstraints(),zoom:{exact:target}} as MediaTrackConstraints);}catch{}
  actual=hardwareZoom(track);
 }
 const hardware=actual??1;
 if(track.readyState!=='live')throw new Error('カメラが停止しました。');
 if(raw<hardware-.015)throw new Error('このレンズではこれ以上広くできません。別のレンズを選んでください。');
 const digital=Math.max(1,raw/hardware);
 return {...lens,zoom:lens.base*hardware*digital,digital};
}
