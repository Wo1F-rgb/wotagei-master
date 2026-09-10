"use client";
import { useEffect, useRef, useState } from 'react';
import { clamp, mapSelfTime, comparisonRates } from './rhythm';
import { prepareSoloPlayback, restoreComparisonAudio } from './solo';
import { firstBeatStart } from './first-beat';
import { restoreTempo, type BpmKind } from './tempo-model';
import { optimizeVideo } from './optimize-video';
import { startComparison } from './start-playback';
import {upcomingBeatCues} from './beat-cues';
import {fitBeatGrid,type BeatGrid} from './beat-grid';
import {YouTubeMedia,type YouTubeLink} from './youtube';
import {resolveYouTubeRate} from './youtube-rate';
import {MIN_PRACTICE_RATE,MAX_PRACTICE_RATE} from './practice-rate';
import {nudgeFollower,NUDGE_SECONDS,NUDGE_STEP_KEY,restoreNudgeStep,type NudgeResult} from './manual-timing';
import {rememberFile,rememberLink,historyError} from './recent-media';
export type Source = { url: string; name: string; key: string; youtube?: YouTubeLink; instance?:number };
export type Alignment = { x: number; y: number; scale: number; rotation: number; opacity: number; perspectiveX:number; perspectiveY:number };
const defaultAlignment: Alignment = {x:0,y:0,scale:1,rotation:0,opacity:.5,perspectiveX:0,perspectiveY:0};
const initialSources: (Source | null)[] = [null,null];
export function useStudio(){
 const reference=useRef<HTMLVideoElement>(null), self=useRef<HTMLVideoElement>(null);
 const youtubeLoadSequence=useRef(0),youtubeLoopSeekAt=useRef(-Infinity);
 const youtube=useRef<YouTubeMedia|null>(null), youtubeActive=useRef(false),starting=useRef(false);
 const youtubeNudge=useRef<{media:YouTubeMedia;masterTime:number;time:number;origin:number}|null>(null);
 const [youtubeReady,setYoutubeReady]=useState(false),[youtubeRates,setYoutubeRates]=useState([1]);
 const referenceMedia=()=>youtubeActive.current?youtube.current:reference.current;
 const [sources,setSources]=useState(initialSources), [durations,setDurations]=useState([0,0]);
 const [bpm,setBpm]=useState([120,120]), [origins,setOrigins]=useState([0,0]), [mirrors,setMirrors]=useState([false,true]);
 const [rate,setRateState]=useState(1), [time,setTime]=useState(0), [selfTime,setSelfTime]=useState(0);
 const [playing,setPlaying]=useState(false), [buffering,setBuffering]=useState(false),[preparing,setPreparing]=useState(false);
 const [soundSource,setSoundSource]=useState<0|1>(0),soundChoice=useRef<0|1>(0);
 const [nudgeStep,setNudgeStepState]=useState(NUDGE_SECONDS),nudgeStepChoice=useRef(NUDGE_SECONDS);
 useEffect(()=>{try{const saved=restoreNudgeStep(Number(localStorage.getItem(NUDGE_STEP_KEY)));nudgeStepChoice.current=saved;setNudgeStepState(saved);}catch{}},[]);
 function setNudgeStep(value:number){const next=restoreNudgeStep(value);nudgeStepChoice.current=next;setNudgeStepState(next);try{localStorage.setItem(NUDGE_STEP_KEY,String(next));}catch{setNotice('ずらし量は変更しましたが、この端末に保存できませんでした。');}}
 const [beatPreview,setBeatPreview]=useState<number|null>(null),previewCue=useRef<number|null>(null);
 const cueNodes=useRef(new Set<OscillatorNode>()),cueKey=useRef(''),cueLast=useRef(-1),cueTime=useRef<number|null>(null),followerBeforeStart=useRef(false);
 const [soloPlaying,setSoloPlaying]=useState<number|null>(null), [tapCounts,setTapCounts]=useState([0,0]);
 const [tapRecording,setTapRecording]=useState<number|null>(null),[tapGrids,setTapGrids]=useState<(BeatGrid|null)[]>([null,null]);
 const tapSession=useRef<number|null>(null);
 const solo=useRef<number|null>(null);
 const files=useRef<(File|null)[]>([null,null]);
 const [bpmKinds,setBpmKinds]=useState<BpmKind[]>(['unset','unset']);
 const [drift,setDrift]=useState(0),[quality,setQuality]=useState<{fps:number;dropped:number}|null>(null);
 const [optimizing,setOptimizing]=useState(false),[optimizeProgress,setOptimizeProgress]=useState(0),[optimized,setOptimized]=useState(false);
 const optimization=useRef<AbortController|null>(null),originalSelf=useRef<Source|null>(null),restoreTime=useRef<number|null>(null),qualityTick=useRef({now:0,frames:0});
 const [loop,setLoop]=useState({enabled:false,start:0,end:0});
 const [camera,setCamera]=useState(false), [cameraBusy,setCameraBusy]=useState(false), [recording,setRecording]=useState(false);
 const [notice,setNotice]=useState(''), [alignment,setAlignment]=useState(defaultAlignment), [click,setClick]=useState(false);
 const [recordingDownload,setRecordingDownload]=useState<Source|null>(null);
 const stream=useRef<MediaStream|null>(null), cameraRequest=useRef(0), running=useRef(false), playRequest=useRef(0), urls=useRef(new Set<string>());
 const recorder=useRef<MediaRecorder|null>(null);
 const taps=useRef<number[][]>([[],[]]), audio=useRef<AudioContext|null>(null), lastTick=useRef(0), selfPlayPending=useRef(false);
 const lifecycle=useRef(true),referenceStalled=useRef(false);
 const snapshot=useRef({bpm,bpmKinds,origins,rate,loop,sources,camera,click,durations,soundSource});
 useEffect(()=>{snapshot.current={bpm,bpmKinds,origins,rate,loop,sources,camera,click,durations,soundSource};});
 function setRate(value:number){
  if(!Number.isFinite(value)||value<MIN_PRACTICE_RATE||value>MAX_PRACTICE_RATE)return;
  if(youtubeActive.current)pause();
  snapshot.current={...snapshot.current,rate:value};setRateState(value);
 }
 function youtubeMetadata(){const el=youtube.current;if(!el)return;const d=el.duration;if(!running.current&&solo.current===null)setTime(el.currentTime);if(d>0&&Number.isFinite(d)){setDurations(a=>a[0]===d?a:[d,a[1]]);setOrigins(a=>a[0]<=d?a:[d,a[1]]);}const rates=el.rates;setYoutubeRates(a=>a.join()===rates.join()?a:rates.length?rates:[1]);}
 function attachYoutube(media:YouTubeMedia|null){youtube.current=media;setYoutubeReady(!!media);if(media){youtubeMetadata();setTime(media.currentTime);} }
 function youtubeState(state:number){
  if(state===3){mediaWaiting();return;}
  if(state===1){mediaPlaying();
   if(!starting.current&&!running.current){if(!stream.current)self.current?.pause();solo.current=0;setSoloPlaying(0);}return;}
  if(state===2&&!starting.current&&(running.current||solo.current!==null))pause();
  if(state===0&&!starting.current)mediaEnded();
 }
 function youtubeRate(value:number){if(starting.current||solo.current!==null||previewCue.current!==null)return;if(Number.isFinite(value)&&value>0){setRateState(value*(soundChoice.current===1?snapshot.current.bpm[0]/snapshot.current.bpm[1]:1));youtubeMetadata();}}
 function youtubeError(message:string){pause();setNotice(message);}
 function loadYoutube(link:YouTubeLink){
  void rememberLink(link.url,'youtube','YouTube · '+link.id).catch(e=>{if(lifecycle.current)setNotice(historyError(e));});
  pause();const previous=sources[0];if(previous&&!previous.youtube){URL.revokeObjectURL(previous.url);urls.current.delete(previous.url);}youtubeActive.current=true;youtube.current=null;setYoutubeReady(false);setYoutubeRates([1]);files.current[0]=null;
  const key='youtube:'+link.id;let saved:{bpm?:number;kind?:BpmKind;origin?:number}|null=null;
  try{saved=JSON.parse(localStorage.getItem('wotagei:video:'+key)||'null');}catch{}
  const instance=++youtubeLoadSequence.current;
  const restored=restoreTempo(saved);setSources(a=>[{url:link.url,name:'YouTube · '+link.id,key,youtube:link,instance},a[1]]);
  setBpm(a=>[restored.bpm,a[1]]);setBpmKinds(a=>[restored.kind,a[1]]);setOrigins(a=>[Math.max(0,Number(saved?.origin)||0),a[1]]);setMirrors(a=>[false,a[1]]);
  setTime(link.start);setRateState(1);setDurations(a=>[0,a[1]]);setLoop({enabled:false,start:0,end:0});resetTaps(0);
  setNotice('YouTubeを読み込みます。動画内の▶で視聴、BPMと「1」を設定すると下のボタンで同期再生できます。');
 }
 function applyBpm(index:number,value:number,kind:BpmKind='manual'){if(!Number.isFinite(value)||value<40||value>300)return;if(running.current||tapSession.current!==null)pause();resetTaps(index);const c=snapshot.current,next=c.bpm.map((n,i)=>i===index?value:n),kinds=c.bpmKinds.map((n,i)=>i===index?kind:n);snapshot.current={...c,bpm:next,bpmKinds:kinds};setBpm(next);setBpmKinds(kinds);}
 function adjustOrigin(index:number,value:number){pause();const c=snapshot.current,el=index===0?referenceMedia():self.current;if(!el)return;const origin=clamp(value,0,c.durations[index]),t=clamp(el.currentTime+origin-c.origins[index],0,c.durations[index]);const next=c.origins.map((v,i)=>i===index?origin:v);snapshot.current={...c,origins:next};setOrigins(next);el.currentTime=t;if(index===0)setTime(t);else setSelfTime(t);}
 function nudgeTiming(direction:-1|1):NudgeResult{
  const c=snapshot.current,index=soundChoice.current===0?1:0;
  if(starting.current||recording||optimizing||c.camera||c.sources.some(v=>!v)||c.bpmKinds.some(v=>v==='unset'))return {index,delta:0,reason:'2本の動画とBPMを設定してください'};
  let pendingTime:number|undefined;
  if(index===0&&youtubeActive.current&&youtube.current&&self.current){
   // The iframe clock can still report its old position after seekTo(). Project only
   // when the user taps, so a burst accumulates every step without chasing playback.
   const masterTime=self.current.currentTime,media=youtube.current;
   if(youtubeNudge.current?.media!==media)youtubeNudge.current={media,masterTime,time:media.currentTime,origin:c.origins[0]};
   const base=youtubeNudge.current;
   pendingTime=base.time+(masterTime-base.masterTime)*c.bpm[1]/c.bpm[0]+c.origins[0]-base.origin;
  }
  const result=nudgeFollower([referenceMedia(),self.current],c.origins,soundChoice.current,direction,pendingTime,nudgeStepChoice.current);
  if(result.delta&&result.origin!==undefined){const next=c.origins.map((v,i)=>i===index?result.origin!:v);snapshot.current={...c,origins:next};setOrigins(next);if(index===0)setTime(result.time!);else setSelfTime(result.time!);persistSettings(true);}
  return result;
 }
 async function makeLightVideo(){const file=files.current[1];if(!file||camera||optimizing)return;pause();optimization.current?.abort();const task=new AbortController();optimization.current=task;setOptimizing(true);setOptimizeProgress(0);try{const blob=await optimizeVideo(file,task.signal,n=>{if(lifecycle.current&&!task.signal.aborted)setOptimizeProgress(n);});if(!lifecycle.current||task.signal.aborted||files.current[1]!==file||stream.current)return;const url=URL.createObjectURL(blob);urls.current.add(url);originalSelf.current??=sources[1];restoreTime.current=self.current?.currentTime||0;setSources(v=>[v[0],{...v[1]!,url}]);setOptimized(true);setNotice('自分の動画を軽量版に切り替えました（長辺720px・30fps・元の音声を保持）。BPMとタイミングは維持します。');}catch(e){if(lifecycle.current&&!task.signal.aborted)setNotice(e instanceof Error?e.message:'軽量化できませんでした。');}finally{if(lifecycle.current&&optimization.current===task)setOptimizing(false);}}
 function cancelOptimization(){optimization.current?.abort();}
 function useOriginalVideo(){if(!originalSelf.current)return;pause();restoreTime.current=self.current?.currentTime||0;setSources(v=>[v[0],originalSelf.current]);setOptimized(false);}
 function pause(){youtubeNudge.current=null;setPreparing(false);cancelCues();previewCue.current=null;setBeatPreview(null);followerBeforeStart.current=false;tapSession.current=null;setTapRecording(null);const r=referenceMedia();starting.current=false;referenceStalled.current=false;if(r)setTime(r.currentTime);if(self.current&&!stream.current)setSelfTime(self.current.currentTime);playRequest.current++;running.current=false;solo.current=null;setSoloPlaying(null);referenceMedia()?.pause();if(!stream.current)self.current?.pause();restoreComparisonAudio(referenceMedia(),self.current,soundChoice.current);setPlaying(false);setBuffering(false);}
 async function playSolo(index:number,withBeats=false){
  if(optimizing){setNotice('軽量化が終わるか中止してから再生してください。');return;}
  pause();const el=index===0?referenceMedia():self.current;
  if(!el||!sources[index]||(!(index===0&&youtubeActive.current)&&durations[index]<=0)||(index===1&&camera))return;
  const id=++playRequest.current;starting.current=true;
  if(withBeats){enableAudio();previewCue.current=index;setBeatPreview(index);el.currentTime=clamp(origins[index]-120/bpm[index],0,durations[index]);}
  try{if(el.ended)el.currentTime=0;prepareSoloPlayback(el,index===0?(camera?null:self.current):referenceMedia());await el.play();
   if(id!==playRequest.current)return;starting.current=false;solo.current=index;setSoloPlaying(index);
  }catch{if(id!==playRequest.current)return;pause();setNotice('この動画を再生できません。もう一度再生を押してください。');}
 }
 function seekSolo(index:number,value:number){pause();const el=index===0?referenceMedia():self.current;if(!el||!sources[index]||(!Number.isFinite(el.duration)||el.duration<=0)||(index===1&&camera))return;el.currentTime=clamp(value,0,el.duration);if(index===0)setTime(el.currentTime);else setSelfTime(el.currentTime);}
 function resetTaps(index:number){taps.current[index]=[];setTapGrids(v=>v.map((n,i)=>i===index?null:n));setTapCounts(v=>v.map((n,i)=>i===index?0:n));}
 function stopCamera(){cameraRequest.current++;if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(self.current)self.current.srcObject=null;setCamera(false);setCameraBusy(false);}
 function seek(value:number,loopJump=false){
  youtubeNudge.current=null;cancelCues();if(!loopJump)pause();
  const r=referenceMedia(),s=self.current,c=snapshot.current;
  if(!r||!c.sources[0]||!Number.isFinite(r.duration)||r.duration<=0)return;
  const t=clamp(value,0,r.duration);r.currentTime=t;setTime(t);
  if(s&&c.sources[1]&&!c.camera&&c.bpmKinds.every(k=>k!=='unset')&&Number.isFinite(s.duration)){const target=mapSelfTime(t,c.origins[0],c.origins[1],c.bpm[0],c.bpm[1]);s.currentTime=clamp(target,0,s.duration);setSelfTime(s.currentTime);if(loopJump){followerBeforeStart.current=target<0||s.paused;if(target<0)s.pause();}}
 }
 async function play(){
  youtubeNudge.current=null;cancelCues();
  tapSession.current=null;setTapRecording(null);
  const r=referenceMedia(),{bpm,bpmKinds,origins,rate,loop,sources,camera,click,durations}=snapshot.current;
  solo.current=null;setSoloPlaying(null);restoreComparisonAudio(r,self.current,soundChoice.current);
  if(optimizing){setNotice('軽量化が終わるか中止してから再生してください。');return;}
  if(!r||!sources[0]||(!youtubeActive.current&&durations[0]<=0)){setNotice('先にお手本の動画を読み込んでください。');return;}
  const rates=comparisonRates(rate,bpm[0],bpm[1],soundChoice.current),sr=rates.self;
  if(sources[1]&&!camera&&durations[1]<=0){setNotice('自分の動画の読み込みが終わってから再生してください。');return;}
  if(bpmKinds[0]==='unset'||(sources[1]&&!camera&&bpmKinds[1]==='unset')){setNotice('各動画の「設定 → 拍・BPM」で拍タップ・解析・曲選択・手入力のいずれかを行ってください。');return;}
  if(!youtubeActive.current&&(rates.reference<.25||rates.reference>4||(sources[1]&&!camera&&(sr<.25||sr>4)))){setNotice('動画の速度が対応範囲（0.25〜4倍）を超えています。BPMか練習速度を調整してください。');return;}
  if(loop.enabled&&(loop.end-loop.start<.1)){setNotice('ループの終点は始点より後にしてください。');return;}
  const id=++playRequest.current;starting.current=true;running.current=false;setPreparing(true);
  if(r.ended||(durations[0]>0&&r.currentTime>=durations[0]-.01))seek(loop.enabled?loop.start:origins[0],true);
  if(loop.enabled&&(r.currentTime<loop.start||r.currentTime>=loop.end))seek(loop.start,true);
  try{
   if(click)enableAudio();
   if(!youtubeActive.current)r.playbackRate=rates.reference;
   if(self.current&&sources[1]&&!camera){
    self.current.playbackRate=clamp(sr,.25,4);
    const target=mapSelfTime(r.currentTime,origins[0],origins[1],bpm[0],bpm[1]);
    followerBeforeStart.current=target<0;
    self.current.currentTime=clamp(target,0,durations[1]);

   }
   let speedNotice='';
   // Start both players in the original gesture while verifying the YouTube rate in parallel.
   const rateReady=youtubeActive.current&&youtube.current?resolveYouTubeRate(youtube.current,bpm[0],bpm[1],soundChoice.current,rate,()=>id===playRequest.current).then(chosen=>{
    if(!chosen||id!==playRequest.current)return;
    snapshot.current={...snapshot.current,rate:chosen.rate};setRateState(chosen.rate);
    if(self.current&&sources[1]&&!camera)self.current.playbackRate=chosen.self;
    if(chosen.fallback)speedNotice=`このYouTubeで使える速度に合わせ、練習速度を${Number(chosen.rate.toFixed(4))}倍にしました。`;
   }):undefined;
   const started=await startComparison(r,sources[1]&&!camera?self.current:null,t=>mapSelfTime(t,origins[0],origins[1],bpm[0],bpm[1]),sr,()=>id===playRequest.current,rateReady);
   if(!started)return;
   starting.current=false;running.current=true;setPreparing(false);setPlaying(true);setTime(r.currentTime);if(self.current&&!camera)setSelfTime(self.current.currentTime);setNotice(speedNotice);
  }catch(e){if(id!==playRequest.current)return;pause();setNotice(e instanceof Error?e.message:'動画を再生できません。もう一度再生を押すか、MP4形式の動画でお試しください。');}
 }
 function applyFirstBeats(next:number[],save=false){
  const c=snapshot.current;
  try{firstBeatStart(next,c.bpm,c.durations);}catch(e){setNotice((e as Error).message);return false;}
  pause();const nextLoop={...c.loop,enabled:false};snapshot.current={...c,origins:[...next],loop:nextLoop};setOrigins([...next]);setLoop(nextLoop);seek(next[0]);
  if(save)saveSettings();return true;
 }
 async function previewFirstBeats(next:number[],lead=0){
  if(!applyFirstBeats(next))return;
  const c=snapshot.current,times=firstBeatStart(next,c.bpm,c.durations,lead);
  // A previously enabled loop must not override the requested downbeat preview.
  const nextLoop={...c.loop,enabled:false};snapshot.current={...c,loop:nextLoop,click:lead>0||c.click};setLoop(nextLoop);if(lead>0)changeClick(true);
  seek(times[0]);await play();
 }
 function removeVideo(index:number){
  if((index!==0&&index!==1)||recording)return;
  pause();
  const released=[sources[index]?.url];
  files.current[index]=null;if(index===1)resetSound();
  if(index===0){youtubeActive.current=false;youtube.current=null;setYoutubeReady(false);setYoutubeRates([1]);setTime(0);setRateState(1);setLoop({enabled:false,start:0,end:0});}
  else{
   optimization.current?.abort();optimization.current=null;setOptimizing(false);setOptimizeProgress(0);setOptimized(false);
   released.push(originalSelf.current?.url);originalSelf.current=null;restoreTime.current=null;
   stopCamera();setSelfTime(0);setQuality(null);qualityTick.current={now:0,frames:0};
  }
  const media=index===0?reference.current:self.current;
  if(media){media.pause();media.removeAttribute('src');media.load();}
  for(const url of released){if(url&&urls.current.delete(url))URL.revokeObjectURL(url);}
  setSources(v=>v.map((n,i)=>i===index?null:n));setDurations(v=>v.map((n,i)=>i===index?0:n));
  setBpm(v=>v.map((n,i)=>i===index?120:n));setBpmKinds(v=>v.map((n,i)=>i===index?'unset':n));
  setOrigins(v=>v.map((n,i)=>i===index?0:n));setMirrors(v=>v.map((n,i)=>i===index?index===1:n));
  snapshot.current={...snapshot.current,sources:snapshot.current.sources.map((n,i)=>i===index?null:n)};
  setDrift(0);setAlignment({...defaultAlignment});resetTaps(index);
  setNotice(`${index===0?'お手本':'自分'}の動画を外しました。別の動画を選べます。元のファイルと履歴は残ります。`);
 }
 function loadFile(index:number,file:File){
  if(!file.type.startsWith('video/')&&!/\.(mp4|mov|webm|m4v)$/i.test(file.name)){setNotice('動画ファイル（MP4・MOV・WebM）を選んでください。');return;}
  pause();if(index===0){youtubeActive.current=false;youtube.current=null;setYoutubeReady(false);}files.current[index]=file;if(index===1){resetSound();optimization.current?.abort();originalSelf.current=null;restoreTime.current=null;setOptimized(false);setQuality(null);qualityTick.current={now:0,frames:0};stopCamera();}
  const url=URL.createObjectURL(file);urls.current.add(url);
  const key=`${file.name}|${file.size}|${file.lastModified}`;
  const previous=sources[index];if(previous){URL.revokeObjectURL(previous.url);urls.current.delete(previous.url);}
  setSources(s=>s.map((v,i)=>i===index?{url,name:file.name,key}:v));setDurations(d=>d.map((v,i)=>i===index?0:v));
  let saved:{bpm?:number;kind?:BpmKind;origin?:number;mirror?:boolean}|null=null;
  try{saved=JSON.parse(localStorage.getItem('wotagei:video:'+key)||'null');}catch{}
  const restored=restoreTempo(saved);setBpm(v=>v.map((n,i)=>i===index?restored.bpm:n));setBpmKinds(v=>v.map((n,i)=>i===index?restored.kind:n));
  setOrigins(v=>v.map((n,i)=>i===index?Math.max(0,Number(saved?.origin)||0):n));
  setMirrors(v=>v.map((n,i)=>i===index?(typeof saved?.mirror==='boolean'?saved.mirror:index===1):n));
  if(index===0){setTime(0);setRate(1);setLoop({enabled:false,start:0,end:0});}else{setSelfTime(0);}
  void rememberFile(file).catch(e=>{if(lifecycle.current&&files.current[index]===file)setNotice(historyError(e));});
  resetTaps(index);setNotice(restored.kind!=='unset'?'保存済みのBPMと「1」を復元しました。':'BPMは未設定です。横の「設定 → 拍・BPM」から拍タップ・解析・曲選択・手入力ができます。');
 }
 function saveSettings(){persistSettings(false);}
 function persistSettings(quiet:boolean){
  const {sources,bpm,bpmKinds,origins}=snapshot.current;
  if(!sources.some(Boolean)){setNotice('動画を読み込んでから保存してください。');return;}
  try{sources.forEach((source,i)=>{if(source)localStorage.setItem('wotagei:video:'+source.key,JSON.stringify({bpm:bpm[i],kind:bpmKinds[i],origin:origins[i],mirror:mirrors[i]}));});if(!quiet)setNotice('この端末にBPM・「1」の位置・反転設定を保存しました。次回も同じ動画を選ぶと復元されます。');}catch{setNotice('設定を保存できません。ブラウザのストレージ設定をご確認ください。');}
 }
 async function startCamera(){
  resetSound();
  optimization.current?.abort();
  if(!navigator.mediaDevices?.getUserMedia){setNotice('カメラはHTTPSで開いたSafariなどの対応ブラウザで利用できます。');return;}
  pause();stopCamera();const id=++cameraRequest.current;setCameraBusy(true);
  try{
   const input=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});
   if(!lifecycle.current||id!==cameraRequest.current){input.getTracks().forEach(t=>t.stop());return;}
   stream.current=input;setCamera(true);setCameraBusy(false);
   if(self.current){self.current.srcObject=input;await self.current.play();}
   setNotice('インカメを起動しました。全身が映る位置に置いて、お手本に合わせて踊りましょう。');
  }catch(e){if(id!==cameraRequest.current)return;stopCamera();setNotice(e instanceof DOMException&&e.name==='NotAllowedError'?'カメラが許可されていません。Safariのカメラ設定から許可してください。':'カメラを起動できません。ほかのアプリで使用中でないか確認してください。');}
 }
 async function beginTap(index:number){resetTaps(index);await playSolo(index);if(solo.current===index){tapSession.current=index;setTapRecording(index);setNotice('動画の1、2、3…に合わせてタップ。途中で終わっても、それまでの拍とBPMを使います。');}}
 function finishTap(){pause();}
 function interruptTap(index:number){if(tapSession.current!==index)return;tapSession.current=null;setTapRecording(null);setNotice('動画の停止・読み込み・位置変更で拍の記録を終了しました。ここまでの有効な結果は残ります。');}
 function tap(index:number){
  const el=index===0?referenceMedia():self.current;
  if(tapSession.current!==index||solo.current!==index||!el||el.paused||el.seeking||el.readyState<3){setNotice('「再生して拍を記録」を押し、動画が再生されてからタップしてください。');return;}
  const t=el.currentTime,list=taps.current[index];
  if(list.length&&t<=list[list.length-1])return;
  if(list.length>=128){finishTap();setNotice('128回までの結果を採用しました。');return;}
  list.push(t);setTapCounts(v=>v.map((n,i)=>i===index?list.length:n));
  const grid=fitBeatGrid(list);
  if(!grid)return;
  setTapGrids(v=>v.map((n,i)=>i===index?grid:n));
  const value=Math.round(grid.bpm*1000)/1000;
  const c=snapshot.current,nextBpm=c.bpm.map((n,i)=>i===index?value:n),nextOrigins=c.origins.map((n,i)=>i===index?grid.origin:n),nextKinds=c.bpmKinds.map((n,i)=>i===index?'tap' as BpmKind:n);
  snapshot.current={...c,bpm:nextBpm,origins:nextOrigins,bpmKinds:nextKinds};setBpm(nextBpm);setOrigins(nextOrigins);setBpmKinds(nextKinds);

 }
 function markOrigin(index:number){pause();const t=index===0?referenceMedia()?.currentTime:self.current?.currentTime;if(t!==undefined){setOrigins(v=>v.map((n,i)=>i===index?t:n));setNotice(`${index===0?'お手本':'自分'}の「1」を ${t.toFixed(2)} 秒に設定しました。`);}}
 function setSelfPosition(t:number){pause();if(self.current&&!camera){self.current.currentTime=clamp(t,0,durations[1]);setSelfTime(self.current.currentTime);}}
 function loaded(index:number){const el=index===0?referenceMedia():self.current;if(el&&Number.isFinite(el.duration)){if(index===1&&restoreTime.current!==null){el.currentTime=clamp(restoreTime.current,0,el.duration);setSelfTime(el.currentTime);restoreTime.current=null;} setDurations(d=>d.map((v,i)=>i===index?el.duration:v));setOrigins(v=>v.map((n,i)=>i===index?clamp(n,0,el.duration):n));}}
 function toggleRecording(){
  if(recorder.current?.state==='recording'){recorder.current.stop();return;}
  if(!stream.current||typeof MediaRecorder==='undefined'){setNotice('このブラウザはカメラ録画に対応していません。');return;}
  pause();const parts:Blob[]=[];let r:MediaRecorder;
  try{r=new MediaRecorder(stream.current);}catch{setNotice('このカメラの録画形式に対応していません。動画ファイルでお試しください。');return;}
  recorder.current=r;
  r.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
  r.onstop=()=>{
   if(!lifecycle.current)return;
   setRecording(false);
   const blob=new Blob(parts,{type:r.mimeType});if(!blob.size){setNotice('録画を保存できませんでした。');return;}
   const url=URL.createObjectURL(blob);urls.current.add(url);
   setRecordingDownload({url,name:`wotagei-${new Date().toISOString().replace(/[:.]/g,'-')}.${r.mimeType.includes('mp4')?'mp4':'webm'}`,key:'recording'});
   setNotice('録画できました。「録画を保存」から端末に保存できます。音声は含まれません。');
  };
  r.onerror=()=>{setRecording(false);setNotice('録画中にエラーが発生しました。');};
  try{r.start(1000);setRecording(true);if(sources[0])void play();setNotice('録画中です。停止後に動画を端末に保存できます（音声なし）。');}catch{setNotice('録画を開始できませんでした。');}
 }
 function mediaEnded(){if(solo.current!==null){pause();return;}if(loop.enabled&&loop.end>loop.start){seek(loop.start);void play();}else pause();}
 function mediaPlaying(){referenceStalled.current=false;setBuffering(false);}
 function mediaWaiting(index=0){if(index===(solo.current??soundChoice.current))cancelCues();interruptTap(index);if(index===0&&running.current){referenceStalled.current=true;setBuffering(true);}}
 function mediaError(index:number){pause();setNotice(`${index===0?'お手本':'自分'}の動画を開けません。MP4（H.264）でお試しください。`);}
 function resetSound(){soundChoice.current=0;setSoundSource(0);snapshot.current={...snapshot.current,soundSource:0};restoreComparisonAudio(referenceMedia(),self.current);}
 function changeSound(value:0|1){
  if(value===1&&(!sources[1]||camera)){setNotice('自分の音を使うには、音声付きの動画ファイルを選んでください。');return;}
  pause();soundChoice.current=value;setSoundSource(value);if(youtubeActive.current)setRateState(1);snapshot.current={...snapshot.current,soundSource:value,...(youtubeActive.current?{rate:1}:{})};restoreComparisonAudio(referenceMedia(),self.current,value);
  setNotice('');
 }
 function cancelCues(){for(const node of cueNodes.current){try{node.stop();}catch{}}cueNodes.current.clear();cueKey.current='';cueLast.current=-1;cueTime.current=null;}
 function enableAudio(){try{audio.current??=new AudioContext();void audio.current.resume().catch(()=>setNotice('拍音を有効にするには、もう一度確認ボタンを押してください。'));}catch{setNotice('このブラウザでは拍音を利用できません。');}}
 function changeClick(enabled:boolean){setClick(enabled);cancelCues();if(enabled)enableAudio();}
 useEffect(()=>{
  const timer=setInterval(()=>{
   // Beat clicks follow the video whose soundtrack is audible, including its actual clock drift.
   const c=snapshot.current,index=solo.current!==null?(previewCue.current===solo.current?solo.current:null):(running.current&&c.click?c.soundSource:null);
   const el=index===0?referenceMedia():index===1?self.current:null,ac=audio.current;
   if(index===null||!el||el.paused||el.seeking||el.readyState<3||c.bpmKinds[index]==='unset'||ac?.state!=='running'){cancelCues();return;}
   const t=el.currentTime,key=`${index}|${c.bpm[index]}|${c.origins[index]}|${el.playbackRate}`;
   if(cueKey.current!==key||(cueTime.current!==null&&(t<cueTime.current-.01||t-cueTime.current>.3))){cancelCues();cueKey.current=key;}
   cueTime.current=t;
   for(const cue of upcomingBeatCues(t,c.origins[index],c.bpm[index],el.playbackRate)){
    if(cue.index<=cueLast.current)continue;cueLast.current=cue.index;
    const at=ac.currentTime+cue.delay,o=ac.createOscillator(),g=ac.createGain();o.frequency.value=cue.index%4===0?1200:800;
    g.gain.setValueAtTime(.12,at);g.gain.exponentialRampToValueAtTime(.001,at+.045);o.connect(g);g.connect(ac.destination);
    cueNodes.current.add(o);o.onended=()=>{cueNodes.current.delete(o);o.disconnect();g.disconnect();};o.start(at);o.stop(at+.05);
   }
  },20);
  return()=>{clearInterval(timer);cancelCues();};
 },[]);
 useEffect(()=>{
  if(solo.current!==null||starting.current)return;
  const r=referenceMedia(),rates=comparisonRates(rate,bpm[0],bpm[1],soundChoice.current);if(r&&!youtubeActive.current)r.playbackRate=rates.reference;
  const sr=rates.self;
  if(self.current&&!camera){if(sr>=.25&&sr<=4)self.current.playbackRate=sr;else if(running.current){pause();setNotice('自分の動画の速度が対応範囲を超えたため停止しました。');}}
 },[rate,bpm,camera,soundSource]);
 useEffect(()=>{
  let frame=0;
  const tick=(now:number)=>{
   const r=referenceMedia(),s=self.current,c=snapshot.current;
   if(solo.current!==null&&now-lastTick.current>32){const el=solo.current===0?r:s;if(el){if(solo.current===0)setTime(el.currentTime);else setSelfTime(el.currentTime);if(el.ended)pause();}lastTick.current=now;}
   if(r&&running.current){
    if(c.loop.enabled&&r.currentTime>=c.loop.end-.012&&(!youtubeActive.current||now-youtubeLoopSeekAt.current>1500)){youtubeLoopSeekAt.current=now;seek(c.loop.start,true);}
    const t=r.currentTime;
    if(s&&c.sources[1]&&!c.camera&&c.bpmKinds.every(k=>k!=='unset')&&Number.isFinite(s.duration)){
     const target=mapSelfTime(t,c.origins[0],c.origins[1],c.bpm[0],c.bpm[1]);
     // A clip whose mapped beginning is in the future is started once at its boundary.
     // Otherwise playback is free-running: no drift seeks, rate chasing or restart barriers.
     if(followerBeforeStart.current&&target>=0&&target<s.duration&&!selfPlayPending.current){
      followerBeforeStart.current=false;selfPlayPending.current=true;const id=playRequest.current;
      void s.play().catch(()=>{if(id!==playRequest.current)return;pause();setNotice('自分の動画を再生できません。「1拍目」から開始し直してください。');}).finally(()=>{selfPlayPending.current=false;});
     }
    }
    if(s&&!c.camera&&now-qualityTick.current.now>=1000){const q=s.getVideoPlaybackQuality?.();setDrift((mapSelfTime(t,c.origins[0],c.origins[1],c.bpm[0],c.bpm[1])-s.currentTime)/comparisonRates(c.rate,c.bpm[0],c.bpm[1],c.soundSource).self);if(q){const previous=qualityTick.current;setQuality({fps:previous.now?Math.max(0,Math.round((q.totalVideoFrames-q.droppedVideoFrames-previous.frames)*1000/(now-previous.now))):0,dropped:q.droppedVideoFrames});qualityTick.current={now,frames:q.totalVideoFrames-q.droppedVideoFrames};}else qualityTick.current={now,frames:0};}
    if(now-lastTick.current>100){setTime(t);if(s&&!c.camera)setSelfTime(s.currentTime);lastTick.current=now;}
   }
   frame=requestAnimationFrame(tick);
  };frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[]);
 useEffect(()=>{
  lifecycle.current=true;
  const visibility=()=>{if(document.hidden){pause();if(recorder.current?.state==='recording')recorder.current.stop();}};
  document.addEventListener('visibilitychange',visibility);
  return()=>{cancelCues();optimization.current?.abort();lifecycle.current=false;cameraRequest.current++;document.removeEventListener('visibilitychange',visibility);youtube.current?.cancel();stream.current?.getTracks().forEach(t=>t.stop());urls.current.forEach(u=>URL.revokeObjectURL(u));void audio.current?.close();};
 },[]);
 return {nudgeStep,setNudgeStep,saveTiming:()=>persistSettings(true),nudgeTiming,applyFirstBeats,previewFirstBeats,preparing,soundSource,changeSound,beatPreview,previewBeats:(index:number)=>playSolo(index,true),interruptTap,tapRecording,tapGrids,beginTap,finishTap,youtubeReady,youtubeRates,loadYoutube,attachYoutube,youtubeMetadata,youtubeState,youtubeRate,youtubeError,drift,quality,optimizing,optimizeProgress,optimized,makeLightVideo,cancelOptimization,useOriginalVideo,adjustOrigin,reference,self,sources,files,durations,bpm,bpmKinds,applyBpm,origins,setOrigins,mirrors,setMirrors,rate,setRate,time,selfTime,playing,buffering,setBuffering,loop,setLoop,camera,cameraBusy,recording,notice,setNotice,alignment,setAlignment,click,setClick:changeClick,recordingDownload,pause,seek,play,loadFile,removeVideo,saveSettings,startCamera,stopCamera,tap,markOrigin,setSelfPosition,loaded,toggleRecording,mediaEnded,mediaWaiting,mediaPlaying,mediaError,soloPlaying,playSolo,seekSolo,tapCounts,resetTaps};
}
