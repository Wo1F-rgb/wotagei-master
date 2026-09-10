import {ChevronLeft,ChevronRight} from 'lucide-react';
import {adjacentTwitterVideo,type TwitterLink,type TwitterSource} from '@/lib/twitter';

export function TwitterVideoSwitch({source,loading,disabled,select,cancel}:{source:TwitterSource;loading:boolean;disabled:boolean;select:(link:TwitterLink)=>void;cancel:()=>void}){
 if(source.videos.length<2)return null;
 const previous=adjacentTwitterVideo(source,-1),next=adjacentTwitterVideo(source,1);
 return <div className="twitter-switch" role="group" aria-label="投稿内の動画を選ぶ" aria-busy={loading}>
  <button aria-label="投稿内の前の動画" disabled={disabled||loading||!previous} onClick={()=>{if(previous)select(previous);}}><ChevronLeft size={17}/></button>
  {loading?<button className="twitter-switch-cancel" aria-label="X動画の切り替えを中止" onClick={cancel}>中止</button>:<span role="status" aria-live="polite">動画 {source.videos.indexOf(source.video??-1)+1}/{source.videos.length}</span>}
  <button aria-label="投稿内の次の動画" disabled={disabled||loading||!next} onClick={()=>{if(next)select(next);}}><ChevronRight size={17}/></button>
 </div>;
}
