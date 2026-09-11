'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {RhythmAnalysis} from '@/components/rhythm-analysis';
import {bpmLabels,type BpmKind} from '@/lib/tempo-model';
import {BeatTap} from '@/components/beat-tap';
import type {BeatGrid} from '@/lib/beat-grid';
import {rhythmHistory} from '@/lib/rhythm-history';

type Props={mediaKey:string;preview?:ReactNode;mainPlaying:boolean;remote?:boolean;file:File|null;live:boolean;bpm:number;kind:BpmKind;tapRecording:boolean;tapGrid:BeatGrid|null;beginTap:()=>void;finishTap:()=>void;tapCount:number;tap:()=>void;apply:(value:number,kind:BpmKind)=>void;applyGrid:(bpm:number,origin:number)=>boolean;pause:()=>void};
export function TempoConfig({mediaKey,preview,mainPlaying,remote=false,file,live,bpm,kind,tapRecording,tapGrid,beginTap,finishTap,tapCount,tap,apply,applyGrid,pause}:Props){
 const [mode,setMode]=useState(kind==='analysis'||rhythmHistory().peek(mediaKey)?'auto':'tap');
 const [message,setMessage]=useState(''),methodChosen=useRef(false);
 useEffect(()=>{let current=true;if(mediaKey)void rhythmHistory().load(mediaKey).then(entry=>{if(current&&entry&&!methodChosen.current)setMode('auto');}).catch(()=>{});return()=>{current=false;};},[mediaKey]);
 useEffect(()=>setMessage(''),[file]);
 function adopt(value:number,from:BpmKind){apply(value,from);setMessage(`${value} BPMを設定しました。拍の位置は「拍の位置」で確認できます。`);}
 if(live)return <div className="tempo-config"><h2>カメラはお手本に合わせて踊る</h2><p>ライブ映像は倍速にできません。録画した動画ならBPM解析・同期ができます。</p></div>;
 return <div className="tempo-config">
  <div className="tempo-summary"><strong>{kind==='unset'?'BPM 未設定':`${Number(bpm.toFixed(3))} BPM`}</strong><span>{bpmLabels[kind]}</span>{kind!=='unset'&&<><button className="button mini" disabled={bpm<80} onClick={()=>adopt(bpm/2,'manual')} aria-label="設定BPMを半分にする">½</button><button className="button mini" disabled={bpm>150} onClick={()=>adopt(bpm*2,'manual')} aria-label="設定BPMを2倍にする">×2</button></>}</div>
  <Tabs value={mode} onValueChange={v=>{methodChosen.current=true;if(tapRecording)finishTap();setMode(String(v));setMessage('');}} className="tempo-methods">
   {mode!=='auto'&&preview}<TabsList aria-label="BPMを決める方法"><TabsTrigger value="tap">拍タップ</TabsTrigger><TabsTrigger value="auto">自動解析</TabsTrigger></TabsList>
   <TabsContent value="tap" className="tempo-body"><BeatTap recording={tapRecording} count={tapCount} grid={tapGrid} begin={beginTap} finish={finishTap} tap={tap} disabled={!file&&!remote}/></TabsContent>
   <TabsContent value="auto" className="tempo-body"><RhythmAnalysis key={mediaKey} mediaKey={mediaKey} mainPlaying={mainPlaying} file={file} remote={remote} pause={pause} apply={applyGrid} applyBpmOnly={v=>adopt(v,'analysis')}/></TabsContent>
  </Tabs>
  {message&&<p className="tempo-message" role="status">{message}</p>}
 </div>;
}
