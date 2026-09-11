'use client';
import {useImperativeHandle,useRef,useState,type ReactNode,type Ref} from 'react';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {RhythmAnalysis,type RhythmAnalysisHandle} from '@/components/rhythm-analysis';
import type {BpmKind} from '@/lib/tempo-model';
import {BeatTap} from '@/components/beat-tap';
import type {BeatGrid} from '@/lib/beat-grid';

export type TempoConfigHandle={save:()=>boolean};
type Props={ref?:Ref<TempoConfigHandle>;mediaKey:string;preview?:ReactNode;mainPlaying:boolean;active:boolean;remote?:boolean;file:File|null;live:boolean;bpm:number;origin:number;kind:BpmKind;tapRecording:boolean;tapGrid:BeatGrid|null;beginTap:()=>void;finishTap:()=>void;tapCount:number;tap:()=>void;apply:(value:number,kind:BpmKind)=>boolean;applyGrid:(bpm:number,origin:number)=>boolean;pause:()=>void};
export function TempoConfig({ref,mediaKey,preview,mainPlaying,active,remote=false,file,live,bpm,origin,tapRecording,tapGrid,beginTap,finishTap,tapCount,tap,apply,applyGrid,pause}:Props){
 const [mode,setMode]=useState('auto');
 const analysis=useRef<RhythmAnalysisHandle>(null);
 useImperativeHandle(ref,()=>({save:()=>live||mode!=='auto'?true:analysis.current?.save()??true}));
 if(live)return <div className="tempo-config"><h2>カメラはお手本に合わせて踊る</h2><p>ライブ映像は倍速にできません。録画した動画ならBPM解析・同期ができます。</p></div>;
 return <div className="tempo-config">
  <Tabs value={mode} onValueChange={v=>{pause();if(tapRecording)finishTap();setMode(String(v));}} className="tempo-methods">
   <TabsList aria-label="BPMを決める方法"><TabsTrigger value="auto">自動解析</TabsTrigger><TabsTrigger value="tap">手動</TabsTrigger></TabsList>
   <TabsContent value="auto" keepMounted className="tempo-body"><RhythmAnalysis ref={analysis} key={mediaKey} mediaKey={mediaKey} active={active&&mode==='auto'} savedBpm={bpm} savedOrigin={origin} mainPlaying={mainPlaying} file={file} remote={remote} pause={pause} apply={applyGrid} applyBpmOnly={v=>apply(v,'analysis')}/></TabsContent>
   <TabsContent value="tap" className="tempo-body">{preview}<BeatTap recording={tapRecording} count={tapCount} grid={tapGrid} begin={beginTap} finish={finishTap} tap={tap} disabled={!file&&!remote}/></TabsContent>
  </Tabs>
 </div>;
}
