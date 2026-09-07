'use client';
import {useEffect,useRef,useState} from 'react';
import {YouTubeMedia,youtubeError,type YouTubeLink,type YouTubePlayer} from '@/lib/youtube';

type Event={target:YouTubePlayer;data:number};
type API={Player:new(el:HTMLElement,options:{events:Record<string,(event:Event)=>void>})=>YouTubePlayer};
let apiPromise:Promise<API>|null=null;
function loadAPI():Promise<API>{
 const w=window as Window & {YT?:API;onYouTubeIframeAPIReady?:()=>void};
 if(w.YT?.Player)return Promise.resolve(w.YT);
 if(apiPromise)return apiPromise;
 apiPromise=new Promise<API>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;
  const previous=w.onYouTubeIframeAPIReady;
  const fail=()=>{clearTimeout(timer);script.remove();w.onYouTubeIframeAPIReady=previous;reject(new Error('YouTubeを読み込めません。通信を確認して再読込してください。'));};
  const timer=setTimeout(fail,15000);script.onerror=fail;
  w.onYouTubeIframeAPIReady=()=>{clearTimeout(timer);w.onYouTubeIframeAPIReady=previous;previous?.();if(w.YT)resolve(w.YT);else fail();};
  document.head.appendChild(script);
 }).catch(e=>{apiPromise=null;throw e;});
 return apiPromise;
}
type Props={link:YouTubeLink;ready:(media:YouTubeMedia|null)=>void;state:(state:number)=>void;rate:(value:number)=>void;error:(message:string)=>void;metadata:()=>void};
export function YouTubeReference(props:Props){
 const mount=useRef<HTMLDivElement>(null),callbacks=useRef(props);callbacks.current=props;
 const [error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let disposed=false,failed=false,readyTimer:ReturnType<typeof setTimeout>|undefined,player:YouTubePlayer|undefined,media:YouTubeMedia|undefined,poll:ReturnType<typeof setInterval>|undefined;
  const fail=(message:string)=>{if(disposed)return;failed=true;clearTimeout(readyTimer);clearInterval(poll);media?.cancel(message);setError(message);callbacks.current.error(message);callbacks.current.ready(null);};
  setError('');
  void loadAPI().then(API=>{
   if(disposed||!mount.current)return;
   const iframe=document.createElement('iframe');
   const params=new URLSearchParams({enablejsapi:'1',origin:window.location.origin,playsinline:'1',controls:'1',start:String(props.link.start)});
   iframe.src=`https://www.youtube.com/embed/${props.link.id}?${params}`;
   iframe.title='YouTubeのお手本動画';iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';
   mount.current.replaceChildren(iframe);
   readyTimer=setTimeout(()=>fail('YouTubeの読み込みに時間がかかっています。通信を確認して再読込してください。'),20000);
   player=new API.Player(iframe,{events:{
    onReady:event=>{if(disposed||failed)return;clearTimeout(readyTimer);media=new YouTubeMedia(event.target);callbacks.current.ready(media);callbacks.current.metadata();poll=setInterval(()=>{if(!disposed&&!failed)callbacks.current.metadata();},1000);},
    onStateChange:event=>{if(disposed||failed)return;media?.stateChanged(event.data);callbacks.current.metadata();callbacks.current.state(event.data);},
    onPlaybackRateChange:event=>{if(!disposed&&!failed)callbacks.current.rate(event.data);},
    onError:event=>fail(youtubeError(event.data)),
    onAutoplayBlocked:()=>{const message='動画内の再生ボタンを一度押してから、同期再生を試してください。';media?.cancel(message);callbacks.current.error(message);},
   }});
  }).catch(e=>fail(e instanceof Error?e.message:'YouTubeを読み込めません。'));
  return()=>{disposed=true;clearTimeout(readyTimer);clearInterval(poll);media?.cancel();callbacks.current.ready(null);player?.destroy();};
 },[props.link.id,props.link.start,attempt]);
 return <div className="youtube-reference"><div ref={mount} className="youtube-mount" hidden={!!error}/>{error&&<div className="youtube-error" role="alert"><span>{error}</span><button className="button mini" onClick={()=>setAttempt(n=>n+1)}>再読込</button><a href={props.link.url} target="_blank" rel="noopener noreferrer">YouTubeで開く</a></div>}</div>;
}
