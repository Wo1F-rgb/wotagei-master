'use client';
import {useEffect,useRef,useState} from 'react';
import {canShareRecording,shareRecording,usesPhotoLibrary,type RecordedVideo} from './recording-save';

export function useRecordingSave(){
 const [recording,setRecording]=useState<RecordedVideo|null>(null),current=useRef<RecordedVideo|null>(null);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [shareable,setShareable]=useState(false),[photos,setPhotos]=useState(false);
 const sharing=useRef(false),mounted=useRef(true),view=useRef(0);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;view.current++;};},[]);
 async function save(automatic=false){
  const video=current.current;if(!video||sharing.current)return;
  const ticket=view.current;sharing.current=true;setBusy(true);setError('');
  const result=await shareRecording(video.file,navigator,automatic);
  sharing.current=false;if(!mounted.current)return;setBusy(false);
  if(current.current!==video||view.current!==ticket)return;
  // A resolved share only means handoff to the OS, not confirmed Photos saving.
  if(result==='handed-off'){setOpen(false);return;}
  if(result==='unsupported')setShareable(false);
  if(result==='failed')setError('保存メニューを開けませんでした。もう一度お試しください。');
  if(result==='needs-tap')setError('下のボタンから保存メニューを開いてください。');
 }
 function offer(video:RecordedVideo){
  view.current++;current.current=video;setRecording(video);setOpen(true);setError('');
  setShareable(canShareRecording(video.file,navigator));setPhotos(usesPhotoLibrary(video.file,navigator));
  // Called directly by MediaRecorder.onstop, before a render/effect or any I/O.
  // If finalization outlasts the stop tap's activation, keep the retry button.
  if(document.visibilityState==='visible')void save(true);
 }
 function reopen(){if(!current.current)return;view.current++;setOpen(true);setError('');void save();}
 function close(){view.current++;setOpen(false);setError('');}
 return {recording,open,busy,error,shareable,photos,offer,reopen,save:()=>save(),close};
}
