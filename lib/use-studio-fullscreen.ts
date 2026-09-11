'use client';
import {useCallback,useEffect,useRef,useState} from 'react';

export type StudioFullscreenMode='window'|'native'|'page';

type FullscreenDocument=Document&{
 webkitFullscreenElement?:Element|null;
 webkitExitFullscreen?:()=>Promise<void>|void;
};
type FullscreenRoot=HTMLElement&{
 webkitRequestFullscreen?:()=>Promise<void>|void;
};

function fullscreenElement(doc:FullscreenDocument){
 return doc.fullscreenElement||doc.webkitFullscreenElement||null;
}

// Fullscreen the document so dialogs portalled to body remain usable. Never
// fullscreen a video element: that would remove its comparison and controls.
//
// The optional argument is retained for callers of the original hook API. A
// failed native request is represented by mode='page' and help; it does not
// create a transient notice over the viewer.
export function useStudioFullscreen(_legacyNotify?:(message:string)=>void){
 const [mode,setMode]=useState<StudioFullscreenMode>('window');
 const [pending,setPending]=useState(false);
 const busy=useRef(false),mounted=useRef(false),modeRef=useRef<StudioFullscreenMode>('window');

 const commitMode=useCallback((next:StudioFullscreenMode)=>{
  modeRef.current=next;
  setMode(current=>current===next?current:next);
 },[]);

 useEffect(()=>{
  mounted.current=true;
  const doc=document as FullscreenDocument;
  const root=doc.documentElement;
  const changed=()=>{
   const active=fullscreenElement(doc);
   // A browser Escape, its native fullscreen button, or another native exit
   // path all arrive here. Keep page fallback until its own toggle/Escape.
   if(active===root)commitMode('native');
   else if(active)commitMode('window');
   else if(modeRef.current==='native')commitMode('window');
   setPending(false);
  };
  doc.addEventListener('fullscreenchange',changed);
  doc.addEventListener('webkitfullscreenchange',changed);
  changed();
  return()=>{
   mounted.current=false;
   doc.removeEventListener('fullscreenchange',changed);
   doc.removeEventListener('webkitfullscreenchange',changed);
  };
 },[commitMode]);

 useEffect(()=>{
  if(mode!=='page')return;
  const escape=(event:KeyboardEvent)=>{
   // Let an open settings dialog consume Escape before leaving page mode.
   if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('[data-slot="dialog-content"]'))commitMode('window');
  };
  window.addEventListener('keydown',escape);
  return()=>window.removeEventListener('keydown',escape);
 },[mode,commitMode]);

 const exit=useCallback(async()=>{
  if(busy.current)return;
  const doc=document as FullscreenDocument;
  const root=doc.documentElement as FullscreenRoot;
  const active=()=>fullscreenElement(doc);
  if(active()!==root){
   if(mounted.current)commitMode('window');
   return;
  }
  busy.current=true;
  if(mounted.current)setPending(true);
  try{
   if(doc.exitFullscreen)await doc.exitFullscreen();
   else if(doc.webkitExitFullscreen)await doc.webkitExitFullscreen();
   else commitMode('window');
  }catch{
   // A native Escape or platform control can race this call. Re-read the
   // document state before deciding whether the hook still claims fullscreen.
   if(mounted.current&&active()!==root)commitMode('window');
  }finally{
   busy.current=false;
   if(mounted.current){
    setPending(false);
    if(active()!==root&&modeRef.current==='native')commitMode('window');
   }
  }
 },[commitMode]);

 const toggle=useCallback(async()=>{
  if(busy.current)return;
  const doc=document as FullscreenDocument;
  const root=doc.documentElement as FullscreenRoot;
  const active=()=>fullscreenElement(doc);
  if(modeRef.current==='page'&&active()!==root){
   commitMode('window');
   return;
  }
  if(active()===root){
   await exit();
   return;
  }
  busy.current=true;
  if(mounted.current)setPending(true);
  try{
   // Some embedded or older mobile browsers expose no requestFullscreen (or
   // reject it for document roots). Page mode still keeps both videos alive.
   if(doc.fullscreenEnabled!==false&&root.requestFullscreen){
    await root.requestFullscreen({navigationUI:'hide'});
   }else if(root.webkitRequestFullscreen){
    await root.webkitRequestFullscreen();
   }else{
    commitMode('page');
    return;
   }
   if(mounted.current){
    if(active()===root)commitMode('native');
    else commitMode('page');
   }
  }catch{
   if(mounted.current)commitMode('page');
  }finally{
   busy.current=false;
   if(mounted.current)setPending(false);
  }
 },[commitMode,exit]);

 const help=mode==='page'?'ページ内最大表示中。ブラウザによってはアドレスバーなどが残ります。':null;
 return {expanded:mode!=='window',mode,pending,toggle,exit,help};
}
