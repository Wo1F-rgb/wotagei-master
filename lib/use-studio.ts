"use client";
import { useEffect, useLayoutEffect, useRef, useState,type SetStateAction } from 'react';
import { clamp, mapSelfTime, comparisonRates } from './rhythm';
import { prepareSoloPlayback, restoreComparisonAudio } from './solo';
import { firstBeatStart } from './first-beat';
import { restoreTempo, type BpmKind } from './tempo-model';
import { optimizeVideo } from './optimize-video';
import { startComparison, startDelayedFollower } from './start-playback';
import {SeekPositions} from './seek-position';
import {upcomingBeatCues} from './beat-cues';
import {fitBeatGrid,type BeatGrid} from './beat-grid';
import {YouTubeMedia,type YouTubeLink} from './youtube';
import {resolveYouTubeRate} from './youtube-rate';
import {MIN_PRACTICE_RATE,MAX_PRACTICE_RATE} from './practice-rate';
import {nudgeBeatOrigin,NUDGE_SECONDS,NUDGE_STEP_KEY,restoreNudgeStep,type NudgeResult} from './manual-timing';
import {rememberFile,rememberLink,historyError} from './recent-media';
import {fetchTwitterVideo,type TwitterLink,type TwitterSource} from './twitter';
import {restoreVideoDisplay} from './video-display';
import {PracticeRecordingAudio,recordingMime} from './practice-recording';
import {cameraConstraints,cameraFacingLabel,captureCameraFrame,type CameraFormat,type CameraFacing} from './camera-recording';
import {prepareRecordingClock} from './recording-clock';
import {requestRecordingSound,recordingSoundError,type RecordingSound} from './recording-sound';
export type Source = { url: string; name: string; key: string; youtube?: YouTubeLink; twitter?:TwitterSource; instance?:number };
export type Alignment = { x: number; y: number; scale: number; rotation: number; opacity: number; perspectiveX:number; perspectiveY:number };
const defaultAlignment: Alignment = {x:0,y:0,scale:1,rotation:0,opacity:.5,perspectiveX:0,perspectiveY:0};
const initialSources: (Source | null)[] = [null,null];
export function useStudio(){
 const reference=useRef<HTMLVideoElement>(null), self=useRef<HTMLVideoElement>(null);
 const [linkLoading,setLinkLoading]=useState(false),linkRequest=useRef<AbortController|null>(null);
 function cancelLinkLoad(){linkRequest.current?.abort();linkRequest.current=null;setLinkLoading(false);}
 async function loadTwitter(link:TwitterLink){
  cancelLinkLoad();pause();const job=new AbortController();linkRequest.current=job;setLinkLoading(true);setNotice('');
  const timer=setTimeout(()=>job.abort(new DOMException('X動画の読み込みがタイムアウトしました。もう一度試してください。','TimeoutError')),45000);
  try{const video=await fetchTwitterVideo(link,job.signal);if(job.signal.aborted||linkRequest.current!==job||!lifecycle.current)return false;
   linkRequest.current=null;setLinkLoading(false);loadFile(0,video.file,{link:video.link,title:video.title});return true;
  }catch(e){if(linkRequest.current===job&&lifecycle.current){if(job.signal.reason?.name==='TimeoutError')setNotice(job.signal.reason.message);else if(!job.signal.aborted)setNotice(e instanceof TypeError?'Xの動画を取得できません。通信を確認して再度読み込むか、動画ファイルを選んでください。':e instanceof Error?e.message:'Xの動画を取得できませんでした。');}return false;
  }finally{clearTimeout(timer);if(linkRequest.current===job){linkRequest.current=null;setLinkLoading(false);}}
 }
 const youtubeLoadSequence=useRef(0);
 const youtube=useRef<YouTubeMedia|null>(null), youtubeActive=useRef(false),starting=useRef(false);
 const [youtubeReady,setYoutubeReady]=useState(false),[youtubeRates,setYoutubeRates]=useState([1]);
 const referenceMedia=()=>youtubeActive.current?youtube.current:reference.current;
 const [sources,setSources]=useState(initialSources), [durations,setDurations]=useState([0,0]);
 const [bpm,setBpm]=useState([120,120]), [origins,setOriginsState]=useState([0,0]), [mirrors,setMirrors]=useState([false,false]);
 const [tripods,setTripods]=useState([true,true]);
 function setTripod(index:number,value:boolean){
  if((index!==0&&index!==1)||sources[index]?.youtube||recording)return;
  pause();setTripods(v=>v.map((old,i)=>i===index?value:old));
  const source=sources[index];if(!source)return;
  try{const c=snapshot.current;localStorage.setItem('wotagei:video:'+source.key,JSON.stringify({bpm:c.bpm[index],kind:c.bpmKinds[index],origin:c.origins[index],mirror:mirrors[index],tripod:value}));}catch{setNotice('三脚設定を保存できません');}
 }
 const [rate,setRateState]=useState(1), [time,setTime]=useState(0), [selfTime,setSelfTime]=useState(0);
 const [playing,setPlaying]=useState(false), [buffering,setBuffering]=useState(false),[preparing,setPreparing]=useState(false);
 const [soundSource,setSoundSource]=useState<0|1>(0),soundChoice=useRef<0|1>(0);
 const [nudgeStep,setNudgeStepState]=useState(NUDGE_SECONDS),nudgeStepChoice=useRef(NUDGE_SECONDS);
 useEffect(()=>{try{const saved=restoreNudgeStep(Number(localStorage.getItem(NUDGE_STEP_KEY)));nudgeStepChoice.current=saved;setNudgeStepState(saved);}catch{}},[]);
 function setNudgeStep(value:number){const next=restoreNudgeStep(value);nudgeStepChoice.current=next;setNudgeStepState(next);try{localStorage.setItem(NUDGE_STEP_KEY,String(next));}catch{setNotice('ずらし量を保存できません');}}
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
 const [cameraFormat,setCameraFormatState]=useState<CameraFormat>('landscape');
 const [cameraFacing,setCameraFacing]=useState<CameraFacing>('user');
 function setCameraFormat(value:CameraFormat){if(!recorder.current&&!recordingJob.current&&(value==='landscape'||value==='portrait'))setCameraFormatState(value);}
 const [notice,setNotice]=useState(''), [click,setClick]=useState(false);
 const [alignments,setAlignments]=useState<[Alignment,Alignment]>([{...defaultAlignment},{...defaultAlignment}]);
 const [alignmentMaster,setAlignmentMaster]=useState<0|1>(0),alignmentTarget=1-alignmentMaster,alignment=alignments[alignmentTarget];
 function setAlignment(action:SetStateAction<Alignment>){setAlignments(v=>v.map((a,i)=>i===alignmentTarget?(typeof action==='function'?action(a):action):a) as [Alignment,Alignment]);}
 function resetAlignments(){setAlignments([{...defaultAlignment},{...defaultAlignment}]);}
 const [recordingDownload,setRecordingDownload]=useState<Source|null>(null),recordingUrl=useRef<string|null>(null);
 const stream=useRef<MediaStream|null>(null), cameraRequest=useRef(0), running=useRef(false), playRequest=useRef(0), urls=useRef(new Set<string>());
 const recorder=useRef<MediaRecorder|null>(null),recordingAudio=useRef(new PracticeRecordingAudio()),recordingRelease=useRef<(()=>void)|null>(null);
 const [recordingSound,setRecordingSound]=useState<RecordingSound>('none'),[recordingBusy,setRecordingBusy]=useState(false),[recordingError,setRecordingError]=useState('');
 const recordingJob=useRef<AbortController|null>(null);
 function cancelRecordingStart(){recordingJob.current?.abort();recordingJob.current=null;setRecordingBusy(false);setRecordingError('');}
 const liveRateRequest=useRef(0),liveRatePending=useRef(false);
 const taps=useRef<number[][]>([[],[]]), audio=useRef<AudioContext|null>(null), lastTick=useRef(0), selfPlayPending=useRef(false);
 const lifecycle=useRef(true),stallCheck=useRef<ReturnType<typeof setTimeout>|null>(null);
 function cancelStallCheck(){if(stallCheck.current!==null)clearTimeout(stallCheck.current);stallCheck.current=null;}
 const timingChanged=useRef(true),seekPositions=useRef(new SeekPositions());
 const snapshot=useRef({bpm,bpmKinds,origins,rate,loop,sources,camera,click,durations,soundSource});
 useLayoutEffect(()=>{snapshot.current={bpm,bpmKinds,origins,rate,loop,sources,camera,click,durations,soundSource};});
 // Save, seek and rapid input in the same event must all read the new beat origin.
 function setOrigins(action:SetStateAction<number[]>){const c=snapshot.current,next=typeof action==='function'?action(c.origins):action;if(next.some((v,i)=>v!==c.origins[i]))timingChanged.current=true;snapshot.current={...c,origins:next};setOriginsState(next);}
 function setRate(value:number){
  if(!Number.isFinite(value)||value<MIN_PRACTICE_RATE||value>MAX_PRACTICE_RATE)return;
  if(youtubeActive.current&&stream.current&&youtube.current){
   const media=youtube.current,id=++liveRateRequest.current;liveRatePending.current=true;cancelCues();
   snapshot.current={...snapshot.current,rate:value};setRateState(value);
   // A live camera has no BPM or playback clock to retime. Change only the reference.
   void resolveYouTubeRate(media,snapshot.current.bpm[0],snapshot.current.bpm[0],0,value,()=>id===liveRateRequest.current&&!!stream.current&&youtube.current===media).then(chosen=>{
    if(!chosen||id!==liveRateRequest.current)return;
    snapshot.current={...snapshot.current,rate:chosen.rate};setRateState(chosen.rate);
    if(chosen.fallback)setNotice(`YouTubeの対応速度：×${Number(chosen.rate.toFixed(4))}`);
   }).catch(e=>{if(id!==liveRateRequest.current)return;snapshot.current={...snapshot.current,rate:media.playbackRate};setRateState(media.playbackRate);setNotice(e instanceof Error?e.message:'速度を変更できませんでした。');}).finally(()=>{if(id===liveRateRequest.current)liveRatePending.current=false;});
   return;
  }
  // Native decoders can apply a new speed at different instants. Re-prepare once
  // for an explicit speed change; live camera practice must remain uninterrupted.
  const restart=(running.current||starting.current)&&!stream.current&&!youtubeActive.current&&!!snapshot.current.sources[0];
  if(youtubeActive.current||restart)pause();
  snapshot.current={...snapshot.current,rate:value};setRateState(value);
  if(stream.current&&!youtubeActive.current&&reference.current)reference.current.playbackRate=value;
  if(restart)void play();
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
 function youtubeRate(value:number){if(starting.current||liveRatePending.current||solo.current!==null||previewCue.current!==null)return;if(Number.isFinite(value)&&value>0){const next=value*(soundChoice.current===1?snapshot.current.bpm[0]/snapshot.current.bpm[1]:1);snapshot.current={...snapshot.current,rate:next};setRateState(next);youtubeMetadata();}}
 function youtubeError(message:string){pause();setNotice(message);}
 function loadYoutube(link:YouTubeLink){
  cancelRecordingStart();cancelLinkLoad();
  void rememberLink(link.url,'youtube','YouTube · '+link.id).catch(e=>{if(lifecycle.current)setNotice(historyError(e));});
  pause();const previous=sources[0];if(previous&&!previous.youtube){URL.revokeObjectURL(previous.url);urls.current.delete(previous.url);}youtubeActive.current=true;youtube.current=null;setYoutubeReady(false);setYoutubeRates([1]);files.current[0]=null;
  const key='youtube:'+link.id;if(previous?.key!==key)resetAlignments();let saved:{bpm?:number;kind?:BpmKind;origin?:number}|null=null;
  try{saved=JSON.parse(localStorage.getItem('wotagei:video:'+key)||'null');}catch{}
  const instance=++youtubeLoadSequence.current;
  const restored=restoreTempo(saved);setSources(a=>[{url:link.url,name:'YouTube · '+link.id,key,youtube:link,instance},a[1]]);
  setBpm(a=>[restored.bpm,a[1]]);setBpmKinds(a=>[restored.kind,a[1]]);setOrigins(a=>[Math.max(0,Number(saved?.origin)||0),a[1]]);setMirrors(a=>[false,a[1]]);setTripods(a=>[true,a[1]]);
  setTime(link.start);setRateState(1);setDurations(a=>[0,a[1]]);setLoop({enabled:false,start:0,end:0});resetTaps(0);
  setNotice('');
 }
 function applyBpm(index:number,value:number,kind:BpmKind='manual'){if(!Number.isFinite(value)||value<40||value>300)return false;if(running.current||starting.current||solo.current!==null||tapSession.current!==null)pause();resetTaps(index);const c=snapshot.current,next=c.bpm.map((n,i)=>i===index?value:n),kinds=c.bpmKinds.map((n,i)=>i===index?kind:n);snapshot.current={...c,bpm:next,bpmKinds:kinds};if(next.some((v,i)=>v!==c.bpm[i]))timingChanged.current=true;setBpm(next);setBpmKinds(kinds);return persistSettings(true);}
 function adjustOrigin(index:number,value:number){
  const c=snapshot.current;if(!Number.isFinite(value)||!c.sources[index]||c.durations[index]<=0)return;
  if(starting.current)pause();cancelCues();
  setOrigins(v=>v.map((n,i)=>i===index?clamp(value,0,c.durations[index]):n));persistSettings(true);
 }
 function applyAnalyzedGrid(index:number,value:number,origin:number){
  const c=snapshot.current;
  if((index!==0&&index!==1)||!c.sources[index]||c.durations[index]<=0||!Number.isFinite(value)||value<40||value>300||!Number.isFinite(origin)||origin<0||origin>c.durations[index])return false;
  pause();resetTaps(index);
  const nextBpm=c.bpm.map((n,i)=>i===index?value:n),nextOrigins=c.origins.map((n,i)=>i===index?origin:n),kinds=c.bpmKinds.map((n,i)=>i===index?'analysis' as BpmKind:n);
  // Tempo and phase belong to one analysis. Save them atomically, at full precision.
  if(value!==c.bpm[index]||origin!==c.origins[index])timingChanged.current=true;snapshot.current={...c,bpm:nextBpm,origins:nextOrigins,bpmKinds:kinds};setBpm(nextBpm);setOrigins(nextOrigins);setBpmKinds(kinds);if(!persistSettings(true))return false;
  setNotice('');
  return true;
 }
 function finishTimingEdit(save=false){
  pause();const saved=!save||persistSettings(false);
  const c=snapshot.current,r=referenceMedia(),s=self.current;
  if(!r||!s||c.camera||c.sources.some(v=>!v)||c.bpmKinds.some(v=>v==='unset')||c.durations.some(d=>d<=0))return saved;
  const master=soundChoice.current,media=master===0?s:r;
  const target=master===0?mapSelfTime(seekPositions.current.read(r),c.origins[0],c.origins[1],c.bpm[0],c.bpm[1]):mapSelfTime(seekPositions.current.read(s),c.origins[1],c.origins[0],c.bpm[1],c.bpm[0]);
  const position=clamp(target,0,c.durations[1-master]);seekPositions.current.seek(media,position);
  if(master===0)setSelfTime(position);else setTime(position);return saved;
 }
 function nudgeTiming(direction:-1|1):NudgeResult{
  const c=snapshot.current,index=soundChoice.current===0?1:0;
  if(starting.current||recording||optimizing||c.camera||c.sources.some(v=>!v)||c.bpmKinds.some(v=>v==='unset'))return {index,delta:0,reason:'2本の動画とBPMを設定してください'};
  const result=nudgeBeatOrigin(c.origins,c.durations,soundChoice.current,direction,nudgeStepChoice.current);
  if(result.delta&&result.origin!==undefined){pause();setOrigins(v=>v.map((n,i)=>i===index?result.origin!:n));if(!persistSettings(true))return {...result,reason:'拍は変更しましたが保存できませんでした'};}
  return result;
 }
 async function makeLightVideo(){const file=files.current[1];if(!file||camera||optimizing)return;pause();optimization.current?.abort();const task=new AbortController();optimization.current=task;setOptimizing(true);setOptimizeProgress(0);try{const blob=await optimizeVideo(file,task.signal,n=>{if(lifecycle.current&&!task.signal.aborted)setOptimizeProgress(n);});if(!lifecycle.current||task.signal.aborted||files.current[1]!==file||stream.current)return;const url=URL.createObjectURL(blob);urls.current.add(url);originalSelf.current??=sources[1];restoreTime.current=self.current?.currentTime||0;setSources(v=>[v[0],{...v[1]!,url}]);setOptimized(true);setNotice('');}catch(e){if(lifecycle.current&&!task.signal.aborted)setNotice(e instanceof Error?e.message:'軽量化できませんでした。');}finally{if(lifecycle.current&&optimization.current===task)setOptimizing(false);}}
 function cancelOptimization(){optimization.current?.abort();}
 function useOriginalVideo(){if(!originalSelf.current)return;pause();restoreTime.current=self.current?.currentTime||0;setSources(v=>[v[0],originalSelf.current]);setOptimized(false);}
 // A seek target is not necessarily readable from currentTime until seeked.
 // Paused media still publish timeupdate/pause events after their audio clock
 // settles. Read the real pair together; this observer never seeks or plays.
 function mediaClockChanged(){
  const r=referenceMedia(),s=self.current;
  if(r)seekPositions.current.settled(r);if(s&&!stream.current)seekPositions.current.settled(s);
  if(running.current||starting.current||solo.current!==null)return;
  if(r&&!r.seeking&&r.readyState>=2&&Number.isFinite(r.currentTime))setTime(r.currentTime);
  if(s&&!stream.current&&!s.seeking&&s.readyState>=2&&Number.isFinite(s.currentTime))setSelfTime(s.currentTime);
 }
 function pause(){cancelStallCheck();liveRateRequest.current++;liveRatePending.current=false;setPreparing(false);cancelCues();previewCue.current=null;setBeatPreview(null);followerBeforeStart.current=false;tapSession.current=null;setTapRecording(null);starting.current=false;playRequest.current++;running.current=false;solo.current=null;setSoloPlaying(null);referenceMedia()?.pause();if(!stream.current)self.current?.pause();mediaClockChanged();restoreComparisonAudio(referenceMedia(),self.current,soundChoice.current);setPlaying(false);setBuffering(false);}
 async function playSolo(index:number,withBeats=false){
  if(optimizing){setNotice('軽量化が終わるか中止してから再生してください。');return;}
  pause();const el=index===0?referenceMedia():self.current;
  if(!el||!sources[index]||(!(index===0&&youtubeActive.current)&&durations[index]<=0)||(index===1&&camera))return;
  const id=++playRequest.current;starting.current=true;
  if(withBeats){enableAudio();previewCue.current=index;setBeatPreview(index);seekPositions.current.seek(el,clamp(origins[index]-120/bpm[index],0,durations[index]));}
  try{if(audio.current)void audio.current.resume();if(el.ended)seekPositions.current.seek(el,0);prepareSoloPlayback(el,index===0?(camera?null:self.current):referenceMedia());await el.play();
   if(id!==playRequest.current)return;seekPositions.current.clear(el);starting.current=false;solo.current=index;setSoloPlaying(index);
  }catch{if(id!==playRequest.current)return;pause();setNotice('この動画を再生できません。もう一度再生を押してください。');}
 }
 function seekSolo(index:number,value:number){pause();const el=index===0?referenceMedia():self.current;if(!el||!sources[index]||(!Number.isFinite(el.duration)||el.duration<=0)||(index===1&&camera))return;seekPositions.current.seek(el,clamp(value,0,el.duration));if(index===0)setTime(el.currentTime);else setSelfTime(el.currentTime);}
 function resetTaps(index:number){taps.current[index]=[];setTapGrids(v=>v.map((n,i)=>i===index?null:n));setTapCounts(v=>v.map((n,i)=>i===index?0:n));}
 function stopCamera(){cancelRecordingStart();if(stream.current)pause();cameraRequest.current++;liveRateRequest.current++;liveRatePending.current=false;if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(self.current){self.current.pause();seekPositions.current.clear(self.current);self.current.srcObject=null;}snapshot.current={...snapshot.current,camera:false};setCamera(false);setCameraBusy(false);}
 function seek(value:number,loopJump=false){
  cancelCues();if(!loopJump)pause();
  const r=referenceMedia(),s=self.current,c=snapshot.current;
  if(!r||!c.sources[0]||!Number.isFinite(r.duration)||r.duration<=0)return;
  const t=clamp(value,0,r.duration);seekPositions.current.seek(r,t);setTime(t);
  if(s&&c.sources[1]&&!c.camera&&c.bpmKinds.every(k=>k!=='unset')&&Number.isFinite(s.duration)){const target=mapSelfTime(t,c.origins[0],c.origins[1],c.bpm[0],c.bpm[1]);seekPositions.current.seek(s,clamp(target,0,s.duration));setSelfTime(s.currentTime);if(loopJump){followerBeforeStart.current=target<0||s.paused;if(target<0)s.pause();}}
 }
 async function play(){
  cancelCues();
  tapSession.current=null;setTapRecording(null);
  const r=referenceMedia(),{bpm,bpmKinds,origins,rate,loop,sources,camera,click,durations}=snapshot.current;
  solo.current=null;setSoloPlaying(null);restoreComparisonAudio(r,self.current,soundChoice.current);
  if(optimizing){setNotice('軽量化が終わるか中止してから再生してください。');return;}
  if(!r||!sources[0]||(!youtubeActive.current&&durations[0]<=0)){setNotice('先にお手本の動画を読み込んでください。');return;}
  const rates=comparisonRates(rate,bpm[0],bpm[1],soundChoice.current),sr=rates.self;
  if(sources[1]&&!camera&&durations[1]<=0){setNotice('自分の動画の読み込みが終わってから再生してください。');return;}
  if(!camera&&(bpmKinds[0]==='unset'||(sources[1]&&bpmKinds[1]==='unset'))){setNotice('各動画の「設定 → 拍・BPM」で拍タップ・自動解析のいずれかを行ってください。');return;}
  if(!youtubeActive.current&&(rates.reference<.25||rates.reference>4||(sources[1]&&!camera&&(sr<.25||sr>4)))){setNotice('動画の速度が対応範囲（0.25〜4倍）を超えています。BPMか練習速度を調整してください。');return;}
  if(loop.enabled&&(loop.end-loop.start<.1)){setNotice('ループの終点は始点より後にしてください。');return;}
  const id=++playRequest.current;starting.current=true;running.current=false;setPreparing(true);
  const targetReference=soundChoice.current===1&&!camera?(t:number)=>mapSelfTime(t,origins[1],origins[0],bpm[1],bpm[0]):undefined;
  if(targetReference&&self.current){
   const raw=targetReference(seekPositions.current.read(self.current)),target=clamp(raw,0,durations[0]);if(Math.abs(seekPositions.current.read(r)-target)>(timingChanged.current?1e-7:rates.reference*.075))seekPositions.current.seek(r,target);setTime(r.currentTime);
   // If the reference would precede its file, begin at the first shared frame.
   // In particular, an iframe must not run ahead while its computed time is negative.
   if(raw<0){const own=clamp(mapSelfTime(target,origins[0],origins[1],bpm[0],bpm[1]),0,durations[1]);seekPositions.current.seek(self.current,own);setSelfTime(own);}
  }
  const requested=seekPositions.current.read(r),ownRequested=self.current?seekPositions.current.read(self.current):0;
  if((r.ended&&requested>=durations[0]-.01)||(!camera&&self.current?.ended&&ownRequested>=durations[1]-.01)||(durations[0]>0&&requested>=durations[0]-.01))seek(loop.enabled?loop.start:origins[0],true);
  const position=seekPositions.current.read(r);
  if(loop.enabled&&(position<loop.start||position>=loop.end))seek(loop.start,true);
  try{
   if(click)enableAudio();
   if(audio.current)void audio.current.resume();
   liveRateRequest.current++;liveRatePending.current=false;
   if(!youtubeActive.current&&r.playbackRate!==rates.reference)r.playbackRate=rates.reference;
   if(self.current&&sources[1]&&!camera){
    if(self.current.playbackRate!==clamp(sr,.25,4))self.current.playbackRate=clamp(sr,.25,4);
    const target=mapSelfTime(seekPositions.current.read(r),origins[0],origins[1],bpm[0],bpm[1]);
    followerBeforeStart.current=target<0;
    if(!targetReference){const position=clamp(target,0,durations[1]);if(Math.abs(seekPositions.current.read(self.current)-position)>(timingChanged.current?1e-7:sr*.075))seekPositions.current.seek(self.current,position);}
    else followerBeforeStart.current=false;

   }
   let speedNotice='';
   // Start both players in the original gesture while verifying the YouTube rate in parallel.
   const rateReady=youtubeActive.current&&youtube.current?resolveYouTubeRate(youtube.current,bpm[0],camera?bpm[0]:bpm[1],soundChoice.current,rate,()=>id===playRequest.current).then(chosen=>{
    if(!chosen||id!==playRequest.current)return;
    snapshot.current={...snapshot.current,rate:chosen.rate};setRateState(chosen.rate);
    if(self.current&&sources[1]&&!camera)self.current.playbackRate=chosen.self;
    if(chosen.fallback)speedNotice=`YouTubeの対応速度：×${Number(chosen.rate.toFixed(4))}`;
   }):undefined;
   const started=await startComparison(r,sources[1]&&!camera?self.current:null,t=>mapSelfTime(t,origins[0],origins[1],bpm[0],bpm[1]),sr,()=>id===playRequest.current,rateReady,targetReference,seekPositions.current.read(r));
   if(!started)return;
   seekPositions.current.clear(r);if(self.current)seekPositions.current.clear(self.current);timingChanged.current=false;starting.current=false;running.current=true;setPreparing(false);setPlaying(true);setTime(r.currentTime);if(self.current&&!camera)setSelfTime(self.current.currentTime);setNotice(speedNotice);
  }catch(e){if(id!==playRequest.current)return;pause();setNotice(e instanceof Error?e.message:'動画を再生できません。もう一度再生を押すか、MP4形式の動画でお試しください。');}
 }
 function applyFirstBeats(next:number[],save=false){
  const c=snapshot.current;
  try{firstBeatStart(next,c.bpm,c.durations);}catch(e){setNotice((e as Error).message);return false;}
  pause();if(next.some((v,i)=>v!==c.origins[i]))timingChanged.current=true;const nextLoop={...c.loop,enabled:false};snapshot.current={...c,origins:[...next],loop:nextLoop};setOrigins([...next]);setLoop(nextLoop);seek(next[0]);
  return !save||persistSettings(false);
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
  if(index===0)cancelLinkLoad();
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
  setOrigins(v=>v.map((n,i)=>i===index?0:n));setMirrors(v=>v.map((n,i)=>i===index?false:n));setTripods(v=>v.map((n,i)=>i===index?true:n));
  snapshot.current={...snapshot.current,sources:snapshot.current.sources.map((n,i)=>i===index?null:n)};
  setDrift(0);resetAlignments();resetTaps(index);
  setNotice('');
 }
 function loadFile(index:number,file:File,twitter?:{link:TwitterSource;title:string}){
  cancelRecordingStart();
  if(!file.type.startsWith('video/')&&!/\.(mp4|mov|webm|m4v)$/i.test(file.name)){setNotice('動画ファイル（MP4・MOV・WebM）を選んでください。');return;}
  if(index===0)cancelLinkLoad();
  pause();if(index===0){youtubeActive.current=false;youtube.current=null;setYoutubeReady(false);}files.current[index]=file;if(index===1){resetSound();optimization.current?.abort();originalSelf.current=null;restoreTime.current=null;setOptimized(false);setQuality(null);qualityTick.current={now:0,frames:0};stopCamera();}
  const url=URL.createObjectURL(file);urls.current.add(url);
  const key=twitter?`twitter:${twitter.link.id}:${twitter.link.video}`:`${file.name}|${file.size}|${file.lastModified}`;
  const previous=sources[index];if(previous){URL.revokeObjectURL(previous.url);urls.current.delete(previous.url);}
  if(previous?.key!==key)resetAlignments();
  setSources(s=>s.map((v,i)=>i===index?{url,name:twitter?.title||file.name,key,...(twitter?{twitter:twitter.link}:{})}:v));setDurations(d=>d.map((v,i)=>i===index?0:v));
  let saved:{bpm?:number;kind?:BpmKind;origin?:number;mirror?:boolean;tripod?:boolean}|null=null;
  try{saved=JSON.parse(localStorage.getItem('wotagei:video:'+key)||'null');}catch{}
  const restored=restoreTempo(saved);setBpm(v=>v.map((n,i)=>i===index?restored.bpm:n));setBpmKinds(v=>v.map((n,i)=>i===index?restored.kind:n));
  setOrigins(v=>v.map((n,i)=>i===index?Math.max(0,Number(saved?.origin)||0):n));
  const display=restoreVideoDisplay(saved);setMirrors(v=>v.map((n,i)=>i===index?display.mirror:n));setTripods(v=>v.map((n,i)=>i===index?display.tripod:n));
  if(index===0){setTime(0);setRate(1);setLoop({enabled:false,start:0,end:0});}else{setSelfTime(0);}
  void (twitter?rememberLink(twitter.link.url,'link',twitter.title):rememberFile(file)).catch(e=>{if(lifecycle.current&&files.current[index]===file)setNotice(historyError(e));});
  resetTaps(index);setNotice('');
 }
 function saveSettings(){persistSettings(false);}
 function persistSettings(quiet:boolean){
  const {sources,bpm,bpmKinds,origins}=snapshot.current;
  if(!sources.some(Boolean)){setNotice('動画を読み込んでから保存してください。');return false;}
  try{sources.forEach((source,i)=>{if(source)localStorage.setItem('wotagei:video:'+source.key,JSON.stringify({bpm:bpm[i],kind:bpmKinds[i],origin:origins[i],mirror:mirrors[i],tripod:tripods[i]}));});if(!quiet)setNotice('');return true;}catch{setNotice('設定を保存できません。ストレージを確認してください');return false;}
 }
 async function startCamera(facing:CameraFacing=cameraFacing){
  if(cameraBusy||recorder.current||recordingJob.current)return false;
  const previous=stream.current?cameraFacing:null;
  resetSound();
  optimization.current?.abort();
  if(!navigator.mediaDevices?.getUserMedia){setNotice('カメラはHTTPSで開いたSafariなどの対応ブラウザで利用できます。');return;}
  pause();stopCamera();const id=++cameraRequest.current;setCameraBusy(true);
  try{
   let input:MediaStream,restored=false;
   try{input=await navigator.mediaDevices.getUserMedia(cameraConstraints(cameraFormat,facing,previous!==null));}
   catch(error){
    if(!lifecycle.current||id!==cameraRequest.current)return false;
    if(!previous||previous===facing||(error instanceof DOMException&&error.name==='NotAllowedError'))throw error;
    // iOS needs the old track released first. Recover it if the requested lens is unavailable.
    input=await navigator.mediaDevices.getUserMedia(cameraConstraints(cameraFormat,previous));restored=true;
   }
   if(!lifecycle.current||id!==cameraRequest.current){input.getTracks().forEach(t=>t.stop());return false;}
   const actual=input.getVideoTracks()[0]?.getSettings().facingMode;
   const chosen:CameraFacing=actual==='user'||actual==='environment'?actual:restored?previous!:facing;
   stream.current=input;snapshot.current={...snapshot.current,camera:true};setCamera(true);setCameraFacing(chosen);setMirrors(v=>[v[0],false]);setTripods(v=>[v[0],true]);
   if(!self.current)throw new Error('カメラの表示先がありません。');
   self.current.muted=true;self.current.playbackRate=1;seekPositions.current.clear(self.current);self.current.srcObject=input;await self.current.play();
   if(id!==cameraRequest.current)return false;
   setCameraBusy(false);
   setNotice(restored?`${cameraFacingLabel[facing]}に切替不可・${cameraFacingLabel[chosen]}に戻しました`:'');return true;
  }catch(e){if(id!==cameraRequest.current)return false;stopCamera();setNotice(e instanceof DOMException&&e.name==='NotAllowedError'?'カメラが許可されていません。Safariのカメラ設定から許可してください。':e instanceof DOMException&&['OverconstrainedError','NotFoundError'].includes(e.name)?`${cameraFacingLabel[facing]}が見つかりません。別のカメラを選んでください。`:'カメラを起動できません。ほかのアプリで使用中でないか確認してください。');return false;}
 }
 async function beginTap(index:number){resetTaps(index);await playSolo(index);if(solo.current===index){tapSession.current=index;setTapRecording(index);setNotice('');}}
 function finishTap(){pause();}
 function interruptTap(index:number){if(tapSession.current!==index)return;tapSession.current=null;setTapRecording(null);setNotice('再生が中断したため、ここまでの拍を採用');}
 function tap(index:number){
  const el=index===0?referenceMedia():self.current;
  if(tapSession.current!==index||solo.current!==index||!el||el.paused||el.seeking||el.readyState<3){setNotice('「再生して拍を記録」を押し、動画が再生されてからタップしてください。');return;}
  const t=el.currentTime,list=taps.current[index];
  if(list.length&&t<=list[list.length-1])return;
  if(list.length>=128){finishTap();setNotice('');return;}
  list.push(t);setTapCounts(v=>v.map((n,i)=>i===index?list.length:n));
  const grid=fitBeatGrid(list);
  if(!grid)return;
  setTapGrids(v=>v.map((n,i)=>i===index?grid:n));
  const value=Math.round(grid.bpm*1000)/1000;
  const c=snapshot.current,nextBpm=c.bpm.map((n,i)=>i===index?value:n),nextOrigins=c.origins.map((n,i)=>i===index?grid.origin:n),nextKinds=c.bpmKinds.map((n,i)=>i===index?'tap' as BpmKind:n);
  if(value!==c.bpm[index]||grid.origin!==c.origins[index])timingChanged.current=true;snapshot.current={...c,bpm:nextBpm,origins:nextOrigins,bpmKinds:nextKinds};setBpm(nextBpm);setOrigins(nextOrigins);setBpmKinds(nextKinds);

 }
 function markOrigin(index:number){pause();const el=index===0?referenceMedia():self.current,t=el?seekPositions.current.read(el):undefined;if(t!==undefined){adjustOrigin(index,t);setNotice('');}}
 function setSelfPosition(t:number){pause();if(self.current&&!camera){seekPositions.current.seek(self.current,clamp(t,0,durations[1]));setSelfTime(self.current.currentTime);}}
 function loaded(index:number){const el=index===0?referenceMedia():self.current;if(el&&Number.isFinite(el.duration)){if(index===1&&restoreTime.current!==null){seekPositions.current.seek(el,clamp(restoreTime.current,0,el.duration));setSelfTime(el.currentTime);restoreTime.current=null;} setDurations(d=>d.map((v,i)=>i===index?el.duration:v));setOrigins(v=>v.map((n,i)=>i===index?clamp(n,0,el.duration):n));}}
 async function toggleRecording(requested:RecordingSound='none'):Promise<boolean>{
  if(recorder.current?.state==='recording'){recorder.current.stop();return false;}
  if(recordingJob.current){cancelRecordingStart();return false;}
  if(recorder.current)return false;
  if(!stream.current||typeof MediaRecorder==='undefined'){setNotice('このブラウザはカメラ録画に対応していません。');return false;}
  const cameraStream=stream.current,job=new AbortController();recordingJob.current=job;setRecordingBusy(true);setRecordingError('');
  const kind:RecordingSound=youtubeActive.current?(requested==='music'?'none':requested):sources[0]?'music':'none';
  let external:Awaited<ReturnType<typeof requestRecordingSound>>|undefined,release:()=>void=()=>{};
  try{
   if(kind==='microphone'||kind==='tab')external=await requestRecordingSound(kind,job.signal);
   if(job.signal.aborted||!lifecycle.current||recordingJob.current!==job||stream.current!==cameraStream){external?.release();return false;}
   const music=kind==='music'?reference.current:null;
   if(music)audio.current??=new AudioContext();
   if(!self.current||self.current.srcObject!==cameraStream)throw new Error('カメラを起動してから録画してください。');
   const frame=captureCameraFrame(self.current,cameraFormat);
   release=()=>{frame.release();external?.release();};
   const input=recordingAudio.current.capture(frame.stream,music,audio.current||undefined,external?.stream);
   let released=false;
   release=()=>{if(released)return;released=true;input.release();frame.release();external?.release();};
   const mimeType=recordingMime(mime=>MediaRecorder.isTypeSupported(mime));
   const r=new MediaRecorder(input.stream,mimeType?{mimeType}:undefined),parts:Blob[]=[];
   if(kind==='music')await prepareRecordingClock(audio.current!,job.signal);
   if(job.signal.aborted||!lifecycle.current||recordingJob.current!==job||stream.current!==cameraStream){release();return false;}
   if(!cameraStream.getVideoTracks().some(track=>track.readyState==='live'))throw new Error('カメラが終了しました。起動し直して録画してください。');
   recorder.current=r;recordingRelease.current=release;
   let failed=false,inputEnded=false;
   const endInput=()=>{if(r.state==='recording'){inputEnded=true;r.stop();}};
   const watched=[...cameraStream.getVideoTracks(),...(external?.stream.getTracks()||[])];watched.forEach(track=>track.addEventListener('ended',endInput));
   const cleanup=release;release=()=>{watched.forEach(track=>track.removeEventListener('ended',endInput));cleanup();};recordingRelease.current=release;
   r.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
   r.onstop=()=>{
    release();if(recorder.current===r){recorder.current=null;recordingRelease.current=null;}
    if(!lifecycle.current)return;
    setRecording(false);if(failed)return;
    const blob=new Blob(parts,{type:r.mimeType});if(!blob.size){setNotice('録画を保存できませんでした。');return;}
    const url=URL.createObjectURL(blob);urls.current.add(url);
    const previous=recordingUrl.current;recordingUrl.current=url;if(previous&&urls.current.delete(previous))URL.revokeObjectURL(previous);
    setRecordingDownload({url,name:`wotagei-${new Date().toISOString().replace(/[:.]/g,'-')}.${r.mimeType.includes('mp4')?'mp4':'webm'}`,key:'recording'});
    setNotice(inputEnded?'入力が終了したため録画を停止・録画を保存してください':'録画を保存してください');
   };
   const fail=()=>{if(recorder.current!==r)return;failed=true;if(r.state!=='inactive')r.stop();else{release();recorder.current=null;recordingRelease.current=null;}if(lifecycle.current){setRecording(false);setNotice('録画中にエラーが発生しました。音声・録画に対応したブラウザで再度試してください。');}};
   r.onerror=fail;
   try{r.start(1000);}catch(error){fail();throw error;}
   setRecording(true);setRecordingSound(kind);
   setNotice('');
   return true;
  }catch(error){
   release();external?.release();
   if(job.signal.aborted||recordingJob.current!==job||!lifecycle.current)return false;
   const message=recordingSoundError(error,kind);setRecordingError(message);setNotice(message);return false;
  }finally{if(recordingJob.current===job){recordingJob.current=null;setRecordingBusy(false);}}
 }

 function mediaEnded(index=0){
  if(starting.current||solo.current!==null){pause();return;}
  if(index===1&&!running.current)return;
  const c=snapshot.current;if(c.loop.enabled&&c.loop.end>c.loop.start){seek(c.loop.start);void play();}else pause();
 }
 function mediaPlaying(){setBuffering(false);}
 function mediaWaiting(index=0){
  if(index===(solo.current??soundChoice.current))cancelCues();interruptTap(index);
  if(!running.current)return;
  if(followerBeforeStart.current||selfPlayPending.current)return;
  setBuffering(true);
  const c=snapshot.current;
  if(c.camera||!c.sources.every(Boolean)||followerBeforeStart.current||selfPlayPending.current||stallCheck.current!==null)return;
  // Audit only an actual waiting event, not every frame. A short seek/decoder
  // transition may settle by itself. A stall or lasting phase error stops once
  // and lets the user resume; never seek repeatedly to chase a stalled video.
  const id=playRequest.current;
  stallCheck.current=setTimeout(()=>{
   stallCheck.current=null;if(id!==playRequest.current||!running.current)return;
   const r=referenceMedia(),s=self.current,c=snapshot.current;if(!r||!s)return;
   const target=mapSelfTime(r.currentTime,c.origins[0],c.origins[1],c.bpm[0],c.bpm[1]);
   if(target<0||target>=s.duration){setBuffering(false);return;}
   const gap=Math.abs(target-s.currentTime)/comparisonRates(c.rate,c.bpm[0],c.bpm[1],c.soundSource).self;
   if(r.paused||s.paused||r.readyState<3||s.readyState<3||gap>.075){
    pause();setNotice('読み込み待ちで停止。「同期再生」で再開');
   }else setBuffering(false);
  },180);
 }
 function mediaError(index:number){pause();setNotice(`${index===0?'お手本':'自分'}の動画を開けません。MP4（H.264）でお試しください。`);}
 function resetSound(){soundChoice.current=0;setSoundSource(0);snapshot.current={...snapshot.current,soundSource:0};restoreComparisonAudio(referenceMedia(),self.current);}
 function changeSound(value:0|1){
  if(value===1&&(!sources[1]||camera)){setNotice('自分の音を使うには、音声付きの動画ファイルを選んでください。');return;}
  pause();if(value!==soundChoice.current)timingChanged.current=true;soundChoice.current=value;setSoundSource(value);if(youtubeActive.current)setRateState(1);snapshot.current={...snapshot.current,soundSource:value,...(youtubeActive.current?{rate:1}:{})};restoreComparisonAudio(referenceMedia(),self.current,value);
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
    if(c.loop.enabled&&r.currentTime>=c.loop.end-.012){seek(c.loop.start);void play();frame=requestAnimationFrame(tick);return;}
    const t=r.currentTime;
    if(s&&c.sources[1]&&!c.camera&&c.bpmKinds.every(k=>k!=='unset')&&Number.isFinite(s.duration)){
     const target=mapSelfTime(t,c.origins[0],c.origins[1],c.bpm[0],c.bpm[1]);
     // A clip whose mapped beginning is in the future is started once at its boundary.
     // Otherwise playback is free-running: no drift seeks, rate chasing or restart barriers.
     if(followerBeforeStart.current&&target>=0&&target<s.duration&&!selfPlayPending.current){
      followerBeforeStart.current=false;selfPlayPending.current=true;const id=playRequest.current;
      void startDelayedFollower(r,s,t=>mapSelfTime(t,c.origins[0],c.origins[1],c.bpm[0],c.bpm[1]),s.playbackRate,()=>id===playRequest.current&&running.current).catch(()=>{if(id!==playRequest.current)return;pause();setNotice('自分の動画を再生できません。「1拍目」から開始し直してください。');}).finally(()=>{selfPlayPending.current=false;});
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
  const visibility=()=>{if(document.hidden){cancelRecordingStart();pause();if(recorder.current?.state==='recording')recorder.current.stop();}};
  document.addEventListener('visibilitychange',visibility);
  return()=>{playRequest.current++;running.current=false;starting.current=false;cancelStallCheck();linkRequest.current?.abort();linkRequest.current=null;cancelCues();optimization.current?.abort();lifecycle.current=false;recordingJob.current?.abort();recordingJob.current=null;cameraRequest.current++;liveRateRequest.current++;document.removeEventListener('visibilitychange',visibility);youtube.current?.cancel();if(recorder.current?.state==='recording')recorder.current.stop();recordingRelease.current?.();recordingAudio.current.dispose();stream.current?.getTracks().forEach(t=>t.stop());urls.current.forEach(u=>URL.revokeObjectURL(u));void audio.current?.close();};
 },[]);
 return {mediaClockChanged,cameraFacing,cameraFormat,setCameraFormat,recordingSound,recordingBusy,recordingError,cancelRecordingStart,clearRecordingError:()=>setRecordingError(''),tripods,setTripod,alignments,setAlignments,alignmentMaster,setAlignmentMaster,alignmentTarget,resetAlignments,linkLoading,cancelLinkLoad,loadTwitter,nudgeStep,setNudgeStep,finishTimingEdit,saveTiming:()=>persistSettings(true),nudgeTiming,applyFirstBeats,previewFirstBeats,preparing,soundSource,changeSound,beatPreview,previewBeats:(index:number)=>playSolo(index,true),interruptTap,tapRecording,tapGrids,beginTap,finishTap,youtubeReady,youtubeRates,loadYoutube,attachYoutube,youtubeMetadata,youtubeState,youtubeRate,youtubeError,drift,quality,optimizing,optimizeProgress,optimized,makeLightVideo,cancelOptimization,useOriginalVideo,adjustOrigin,reference,self,sources,files,durations,bpm,bpmKinds,applyBpm,applyAnalyzedGrid,origins,setOrigins,mirrors,setMirrors,rate,setRate,time,selfTime,playing,buffering,setBuffering,loop,setLoop,camera,cameraBusy,recording,notice,setNotice,alignment,setAlignment,click,setClick:changeClick,recordingDownload,pause,seek,play,loadFile,removeVideo,saveSettings,startCamera,stopCamera,tap,markOrigin,setSelfPosition,loaded,toggleRecording,mediaEnded,mediaWaiting,mediaPlaying,mediaError,soloPlaying,playSolo,seekSolo,tapCounts,resetTaps};
}
