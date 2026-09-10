'use client';
import {useEffect,useRef,useState} from 'react';

type FullscreenDocument=Document&{webkitFullscreenElement?:Element;webkitExitFullscreen?:()=>Promise<void>|void};
type FullscreenRoot=HTMLElement&{webkitRequestFullscreen?:()=>Promise<void>|void};

// Fullscreen the document so dialogs portalled to body remain usable. Never
// fullscreen a video element: that would remove its comparison and controls.
export function useStudioFullscreen(notify:(message:string)=>void){
 const [mode,setMode]=useState<'window'|'native'|'page'>('window'),[pending,setPending]=useState(false);
 const busy=useRef(false),mounted=useRef(false);
 useEffect(()=>{
  mounted.current=true;
  const doc=document as FullscreenDocument;
  const changed=()=>{
   const element=doc.fullscreenElement||doc.webkitFullscreenElement;
   setMode(old=>element===doc.documentElement?'native':old==='native'?'window':old);
  };
  doc.addEventListener('fullscreenchange',changed);doc.addEventListener('webkitfullscreenchange',changed);
  return()=>{mounted.current=false;doc.removeEventListener('fullscreenchange',changed);doc.removeEventListener('webkitfullscreenchange',changed);};
 },[]);
 useEffect(()=>{
  if(mode!=='page')return;
  const escape=(event:KeyboardEvent)=>{
   // Let an open settings dialog consume Escape before leaving page mode.
   if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('[data-slot="dialog-content"]'))setMode('window');
  };
  window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
 },[mode]);
 async function toggle(){
  if(busy.current)return;
  if(mode==='page'){setMode('window');return;}
  busy.current=true;setPending(true);
  const doc=document as FullscreenDocument,root=doc.documentElement as FullscreenRoot;
  const active=()=>doc.fullscreenElement||doc.webkitFullscreenElement;
  const expandPage=()=>{
   if(!mounted.current)return;
   setMode('page');notify('ページ内を最大表示にしました。このブラウザではアドレスバーなどが残ります。右上のアイコンで戻れます。');
  };
  try{
   if(active()===root){
    try{
     if(doc.exitFullscreen)await doc.exitFullscreen();else await doc.webkitExitFullscreen?.();
     if(mounted.current&&!active())setMode('window');
    }catch{if(mounted.current)notify('全画面を終了できませんでした。ブラウザの全画面終了操作を使ってください。');}
   }else{
    try{
     if(root.requestFullscreen)await root.requestFullscreen({navigationUI:'hide'});
     else if(root.webkitRequestFullscreen)await root.webkitRequestFullscreen();
     if(mounted.current){if(active()===root)setMode('native');else expandPage();}
    }catch{expandPage();}
   }
  }finally{busy.current=false;if(mounted.current)setPending(false);}
 }
 return {expanded:mode!=='window',mode,pending,toggle};
}
