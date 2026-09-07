'use client';
import {useEffect,useRef,type RefObject,type CSSProperties} from 'react';
import {publicAsset} from '@/lib/public-assets';
import {containRect,type BackgroundSettings} from '@/lib/background';
type Props={video:RefObject<HTMLVideoElement|null>;settings:BackgroundSettings;style:CSSProperties;source:string;active:boolean;status:(ready:boolean,message?:string)=>void};
export function BackgroundVideo({video,settings,style,source,active,status}:Props){
 const canvas=useRef<HTMLCanvasElement>(null),current=useRef({settings,status});current.current={settings,status};
 useEffect(()=>{
  const el=video.current,surface=canvas.current;
  if(!active||settings.mode==='off'||!el||!surface)return;
  let disposed=false,worker:Worker|null=null,ready=false,busy=false,epoch=0,lastTime=-1,lastThreshold=-1,lastSent=0,raf=0,bitmap:ImageBitmap|null=null;
  let watchdog:ReturnType<typeof setTimeout>|undefined;
  const ctx=surface.getContext('2d');
  const clear=()=>{bitmap?.close();bitmap=null;ctx?.clearRect(0,0,surface.width,surface.height);current.current.status(false);};
  const fail=(message:string)=>{if(disposed)return;ready=false;worker?.terminate();worker=null;clearTimeout(watchdog);clear();current.current.status(false,message);};
  const draw=()=>{
   if(!ctx||!bitmap)return;
   const width=Math.max(1,Math.round(surface.clientWidth)),height=Math.max(1,Math.round(surface.clientHeight));
   if(surface.width!==width||surface.height!==height){surface.width=width;surface.height=height;}
   ctx.clearRect(0,0,width,height);const r=containRect(bitmap.width,bitmap.height,width,height);ctx.drawImage(bitmap,r.x,r.y,r.width,r.height);
  };
  const invalidate=()=>{epoch++;lastTime=-1;clear();};
  const tick=(now:number)=>{
   if(disposed)return;
   if(ready&&!busy&&!document.hidden&&!el.seeking&&el.readyState>=2&&el.videoWidth&&now-lastSent>=33&&(lastTime!==el.currentTime||lastThreshold!==current.current.settings.threshold)){
    busy=true;lastSent=now;lastTime=el.currentTime;lastThreshold=current.current.settings.threshold;const sentEpoch=epoch;
    const ratio=Math.min(1,640/Math.max(el.videoWidth,el.videoHeight));
    void createImageBitmap(el,{resizeWidth:Math.max(1,Math.round(el.videoWidth*ratio)),resizeHeight:Math.max(1,Math.round(el.videoHeight*ratio))}).then(frame=>{
     if(disposed||!worker||sentEpoch!==epoch){frame.close();busy=false;return;}
     watchdog=setTimeout(()=>fail('背景処理が止まったため元の映像に戻しました。背景をOFFにしてから再度ONにできます。'),10000);
     worker.postMessage({type:'frame',frame,epoch:sentEpoch,timestamp:now,threshold:current.current.settings.threshold},[frame]);
    }).catch(()=>{busy=false;fail('動画の画像を取得できませんでした。元の映像を表示しています。');});
   }
   raf=requestAnimationFrame(tick);
  };
  ctx?.clearRect(0,0,surface.width,surface.height);
  current.current.status(false,'背景を準備中です。初回は人物モデルを読み込みます。');
  if(!ctx||typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined'){current.current.status(false,'このブラウザは背景切り抜きに対応していません。元の映像を表示しています。');return;}
  try{
   // Classic worker permits the MediaPipe WASM loader's importScripts call.
   worker=new Worker(new URL('../lib/background.worker.ts',import.meta.url));
   worker.onerror=()=>fail('背景処理を読み込めませんでした。元の映像を表示しています。');
   worker.onmessage=e=>{
    if(disposed){e.data.bitmap?.close();return;}
    if(e.data.type==='error'){fail(e.data.message);return;}
    clearTimeout(watchdog);
    if(e.data.type==='ready'){ready=true;return;}
    if(e.data.type==='frame'){
     busy=false;
     if(e.data.epoch!==epoch){e.data.bitmap.close();return;}
     bitmap?.close();bitmap=e.data.bitmap;draw();current.current.status(true);
    }
   };
   watchdog=setTimeout(()=>fail('背景モデルの読み込みに時間がかかっています。通信を確認して背景をONにし直してください。'),45000);
   worker.postMessage({type:'init',mode:settings.mode,wasm:new URL(publicAsset('pose/wasm'),document.baseURI).href,model:new URL(publicAsset('pose/selfie_segmenter.tflite'),document.baseURI).href});
   el.addEventListener('seeking',invalidate);el.addEventListener('emptied',invalidate);
   const resize=new ResizeObserver(draw);resize.observe(surface);raf=requestAnimationFrame(tick);
   return()=>{disposed=true;worker?.terminate();clearTimeout(watchdog);cancelAnimationFrame(raf);resize.disconnect();el.removeEventListener('seeking',invalidate);el.removeEventListener('emptied',invalidate);bitmap?.close();ctx?.clearRect(0,0,surface.width,surface.height);};
  }catch{fail('背景処理を起動できませんでした。元の映像を表示しています。');}
 },[active,settings.mode,source,video]);
 return <canvas ref={canvas} className="background-video" style={style} aria-hidden="true"/>;
}
