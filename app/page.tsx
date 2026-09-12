"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { Activity, ArrowLeft, Camera, Check, ChevronLeft, ChevronRight, Columns2, Download, ExternalLink, FlipHorizontal2, Layers2, Maximize, Minimize, Pause, Play, Repeat2, RotateCcw, Settings2, SkipBack, SkipForward, SlidersHorizontal, Square, SwitchCamera, Upload, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useStudio } from '@/lib/use-studio';
import { useStudioFullscreen } from '@/lib/use-studio-fullscreen';
import {FullscreenPlayerControls} from '@/components/fullscreen-player-controls';
import {packedVideoLayout} from '@/lib/fullscreen-layout';
import {RecordingAudioDialog} from '@/components/recording-audio-dialog';
import {recordingSoundLabel} from '@/lib/recording-sound';
import {cameraFrame,cameraFormatLabel,cameraFacingLabel,type CameraFacing} from '@/lib/camera-recording';
import {RecentMediaPicker} from '@/components/recent-media';
import {isTwitterUrl,parseTwitterLink,type TwitterLink} from '@/lib/twitter';
import {TwitterVideoSwitch} from '@/components/twitter-video-switch';
import {YouTubeReference} from '@/components/youtube-reference';
import {parseYouTubeLink} from '@/lib/youtube';
import {BeatPreview} from '@/components/beat-preview';
import { TempoConfig,type TempoConfigHandle } from '@/components/tempo-config';
import { VideoTracks } from '@/components/video-tracks';
import {MAX_PRACTICE_RATE} from '@/lib/practice-rate';
import {NUDGE_STEPS,nudgeSecondsLabel} from '@/lib/manual-timing';
import {AlignmentEditor} from '@/components/alignment-editor';
import {AlignmentGestures} from '@/components/alignment-gestures';
import {MotionControls} from '@/components/motion-controls';
import {buildMotionCurve,motionTarget,motionWeightAt,type MotionAnalysis} from '@/lib/motion-alignment';
import {useMotionPlayback} from '@/lib/use-motion-playback';
import {FirstBeatEditor} from '@/components/first-beat-editor';
import {AutoAlignment} from '@/components/auto-alignment';
import type {SequenceOptions} from '@/lib/pose-analysis';
import {resizeRegistration} from '@/lib/pose-registration';
import { PoseOverlay } from '@/components/pose-overlay';
import { detectPoses } from '@/lib/pose-detector';
import { alignmentCss, perspectivePose, fitPoses, displayPose, transformPose, jointAngle, type Point, type Size } from '@/lib/pose-geometry';
import { beatAt, clamp, mapSelfTime, measureLoop, comparisonRates, timeLabel } from '@/lib/rhythm';
import { registerStudioTools, type ModelContext } from '@/lib/webmcp';
import {BackgroundVideo} from '@/components/background-video';
import {BackgroundControls} from '@/components/background-controls';
import {AppearanceControls,VideoGrade} from '@/components/appearance-controls';
import {defaultAppearance,restoreAppearance,type VideoAppearance} from '@/lib/video-appearance';
import {useLivePoses} from '@/lib/use-live-poses';
import {useRecordedPoses} from '@/lib/use-recorded-poses';
import {RecordedPoseOverlay} from '@/components/recorded-pose-overlay';
import {RecordedPoseStatus,recordedPoseLabel} from '@/components/recorded-pose-status';
import {containRect,defaultBackground,restoreBackground,type BackgroundSettings} from '@/lib/background';
import {SceneCalibrationEditor} from '@/components/scene-calibration';
import {sceneCss,sceneMatrix,projectPoint,restoreScene,type SceneCalibration} from '@/lib/scene-calibration';

type ConfigStep='origin'|'tempo'|'display'|'source'|'camera';
const unalignedPair=[{x:0,y:0,scale:1,rotation:0},{x:0,y:0,scale:1,rotation:0}];
function Numeric({label,value,onChange,min=0,max=999,step=.1,disabled=false,precision=3}:{label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number;step?:number;disabled?:boolean;precision?:number}){
 const [text,setText]=useState(String(value));useEffect(()=>setText(String(Number(value.toFixed(precision)))),[value,precision]);
 const commit=()=>{if(text===String(Number(value.toFixed(precision))))return;const n=Number(text);if(text.trim()&&Number.isFinite(n)){const v=clamp(n,min,max);onChange(v);setText(String(v));}else setText(String(value));};
 return <label className="numeric"><span>{label}</span><input type="number" inputMode="decimal" min={min} max={max} step={step} value={text} disabled={disabled} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} aria-label={label}/></label>;
}
function Range({label,value,min=0,max,step=.01,onChange,disabled=false}:{label:string;value:number;min?:number;max:number;step?:number;onChange:(n:number)=>void;disabled?:boolean}){return <Slider aria-label={label} value={[value]} min={min} max={Math.max(max,min+.001)} step={step} disabled={disabled} onValueChange={v=>onChange(Array.isArray(v)?v[0]:v)}/>;}

export default function Home(){
 const s=useStudio();const tempoConfig=useRef<TempoConfigHandle>(null);const [recordingDialog,setRecordingDialog]=useState(false);
 const fullscreen=useStudioFullscreen(s.setNotice);
 useEffect(()=>{setRecordingDialog(false);},[s.sources[0]?.url,s.camera]);
 function recordingAction(){if(s.recording||s.recordingBusy){void s.toggleRecording();return;}if(s.sources[0]?.youtube){s.clearRecordingError();setRecordingDialog(true);}else void s.toggleRecording();}
 const [mode,setMode]=useState('compare'),[config,setConfig]=useState<number|null>(null),[step,setStep]=useState<ConfigStep>('origin');
 const [panel,setPanel]=useState<'speed'|'loop'|'alignment'|'firstBeat'|null>(null),[measures,setMeasures]=useState(2),[drag,setDrag]=useState<number|null>(null);
 useEffect(()=>{setPanel(p=>p==='firstBeat'?null:p);},[s.sources[0]?.url,s.sources[1]?.url]);
 const [link,setLink]=useState(''),[savedLink,setSavedLink]=useState('');
 const [backgrounds,setBackgrounds]=useState<BackgroundSettings[]>([{...defaultBackground},{...defaultBackground}]),[backgroundReady,setBackgroundReady]=useState(['','']);
 const backgroundKeys=[s.sources[0]?.key||'empty',s.camera?'camera':s.sources[1]?.key||'empty'];
 const [appearances,setAppearances]=useState<VideoAppearance[]>([{...defaultAppearance},{...defaultAppearance}]);
 useEffect(()=>{setAppearances(backgroundKeys.map(key=>{try{return restoreAppearance(JSON.parse(localStorage.getItem('wotagei:appearance:'+key)||'null'));}catch{return {...defaultAppearance};}}));},[backgroundKeys[0],backgroundKeys[1]]);
 function changeAppearance(index:number,value:VideoAppearance){setAppearances(v=>v.map((old,i)=>i===index?value:old));try{localStorage.setItem('wotagei:appearance:'+backgroundKeys[index],JSON.stringify(value));}catch{s.setNotice('表示設定を保存できません');}}
 function overlayPreset(kind:'normal'|'person'|'color'|'bones'){
  for(const i of [0,1]){if(i===0&&s.sources[0]?.youtube)continue;changeBackground(i,{...backgrounds[i],mode:kind==='normal'||kind==='bones'?'off':'person',preview:'transparent'});changeAppearance(i,{...appearances[i],gamma:kind==='normal'?1:1.3,contrast:1,tint:kind==='color',skeleton:kind==='bones'||appearances[i].skeleton});}
  s.setAlignment(a=>({...a,opacity:kind==='normal'?.5:kind==='bones'?.22:kind==='color'?.8:.65}));
 }
 const [scenes,setScenes]=useState<(SceneCalibration|null)[]>([null,null]),[scenePreview,setScenePreview]=useState<(SceneCalibration|null)[]>([null,null]);
 const [sceneScope,setSceneScope]=useState(['','']);
 const currentScenes=scenes.map((value,i)=>sceneScope[i]===backgroundKeys[i]?value:null);
 useEffect(()=>{setSceneScope([...backgroundKeys]);setScenePreview([null,null]);setScenes(backgroundKeys.map(key=>{if(key==='camera'||key==='empty')return null;try{return restoreScene(JSON.parse(localStorage.getItem('wotagei:scene:'+key)||'null'));}catch{return null;}}));},[backgroundKeys[0],backgroundKeys[1]]);
 function saveScene(index:number,value:SceneCalibration|null){s.pause();if(JSON.stringify(scenes[index])!==JSON.stringify(value))s.resetAlignments();setScenes(v=>v.map((old,i)=>i===index?value:old));try{if(value)localStorage.setItem('wotagei:scene:'+backgroundKeys[index],JSON.stringify(value));else localStorage.removeItem('wotagei:scene:'+backgroundKeys[index]);s.setNotice('位置・遠近をリセット');}catch{s.setNotice('画角補正を保存できません');}}
 useEffect(()=>{setBackgroundReady(['','']);setBackgrounds(backgroundKeys.map(key=>{try{return restoreBackground(JSON.parse(localStorage.getItem('wotagei:background:'+key)||'null'));}catch{return {...defaultBackground};}}));},[backgroundKeys[0],backgroundKeys[1]]);
 function changeBackground(index:number,value:BackgroundSettings){setBackgrounds(v=>v.map((old,i)=>i===index?value:old));if(value.mode!==backgrounds[index].mode)setBackgroundReady(v=>v.map((old,i)=>i===index?'':old));try{localStorage.setItem('wotagei:background:'+backgroundKeys[index],JSON.stringify(value));}catch{s.setNotice('背景設定を保存できません');}}
 const [poseBusy,setPoseBusy]=useState(false),[poses,setPoses]=useState<{points:Point[][];stage:Size;times:number[];mirrors:boolean[]}|null>(null);
 const [sequence,setSequence]=useState<SequenceOptions|null>(null);
 const lastAlignmentStage=useRef<{stage:Size;key:string;reference:Size;self:Size}|null>(null);
 const poseRequest=useRef(0),selfStage=useRef<HTMLDivElement>(null);
 const decksRef=useRef<HTMLDivElement>(null),[decksSize,setDecksSize]=useState<Size>({width:0,height:0});
 const [videoSizes,setVideoSizes]=useState<Size[]>([{width:16,height:9},{width:16,height:9}]);
 function readVideoSize(index:number,video:HTMLVideoElement){if(video.videoWidth&&video.videoHeight)setVideoSizes(old=>old[index].width===video.videoWidth&&old[index].height===video.videoHeight?old:old.map((size,i)=>i===index?{width:video.videoWidth,height:video.videoHeight}:size));}
 useEffect(()=>{const el=decksRef.current;if(!el)return;const observer=new ResizeObserver(()=>setDecksSize(old=>old.width===el.clientWidth&&old.height===el.clientHeight?old:{width:el.clientWidth,height:el.clientHeight}));observer.observe(el);return()=>observer.disconnect();},[]);
 const referenceStage=useRef<HTMLDivElement>(null),[referenceStageSize,setReferenceStageSize]=useState<Size>({width:0,height:0});
 useEffect(()=>{const el=referenceStage.current;if(!el)return;const observer=new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect)setReferenceStageSize({width:rect.width,height:rect.height});});observer.observe(el);return()=>observer.disconnect();},[]);
 const [stageSize,setStageSize]=useState<Size>({width:0,height:0});
 useEffect(()=>{const el=selfStage.current;if(!el)return;const observer=new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(!rect)return;setStageSize(old=>old.width===rect.width&&old.height===rect.height?old:{width:rect.width,height:rect.height});});observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{poseRequest.current++;setPoseBusy(false);setPoses(null);},[stageSize.width,stageSize.height]);
 useEffect(()=>{poseRequest.current++;setPoseBusy(false);setPoses(null);},[s.sources[0]?.key,s.sources[1]?.key,s.mirrors[0],s.mirrors[1],s.camera,s.alignmentMaster,s.bpm[0],s.bpm[1],s.origins[0],s.origins[1]]);
 useEffect(()=>{poseRequest.current++;setPoseBusy(false);setPoses(null);},[scenes[0],scenes[1]]);
 useEffect(()=>()=>{poseRequest.current++;},[]);
 useEffect(()=>{setSequence(null);},[s.sources[0]?.url,s.sources[1]?.url,s.camera,s.bpm[0],s.bpm[1],s.origins[0],s.origins[1],s.mirrors[0],s.mirrors[1],scenes[0],scenes[1],stageSize.width,stageSize.height,s.alignmentMaster]);
 const studioRef=useRef(s);useEffect(()=>{studioRef.current=s;});
 useEffect(()=>{try{const l=localStorage.getItem('wotagei:reference-link');if(l&&/^https:\/\//.test(l))setSavedLink(l);}catch{}
  const context=(document as Document & {modelContext?:ModelContext}).modelContext;if(!context)return;
  return registerStudioTools(context,()=>{const v=studioRef.current;return{bpm:v.bpm.map((n,i)=>v.bpmKinds[i]==='unset'?null:n),bpmKinds:v.bpmKinds,origins:v.origins,rate:v.rate,time:v.time,playing:v.playing,loaded:v.sources.map(Boolean),loop:v.loop};},input=>flushSync(()=>{const v=studioRef.current;v.pause();if(input.referenceBpm!==undefined)v.applyBpm(0,input.referenceBpm!,'manual');if(input.selfBpm!==undefined)v.applyBpm(1,input.selfBpm!,'manual');if(input.rate!==undefined)v.setRate(input.rate);}));
 },[]);
 useEffect(()=>{if(!s.notice)return;const timer=setTimeout(()=>s.setNotice(''),7000);return()=>clearTimeout(timer);},[s.notice]);
 const isYoutube=!!s.sources[0]?.youtube;
 const [youtubeControls,setYoutubeControls]=useState(false);
 useEffect(()=>setYoutubeControls(false),[mode,config,s.sources[0]?.key,s.sources[1]?.key,s.camera]);
 const hasReference=isYoutube?s.youtubeReady:!!s.sources[0]&&s.durations[0]>0,beat=beatAt(s.soundSource===0?s.time:s.selfTime,s.origins[s.soundSource],s.bpm[s.soundSource]);
 const rates=comparisonRates(s.rate,s.bpm[0],s.bpm[1],s.soundSource),selfRate=rates.self,invalidRate=rates.reference<.25||rates.reference>4||(!!s.sources[1]&&!s.camera&&(selfRate<.25||selfRate>4));
 const targetSelf=mapSelfTime(s.time,s.origins[0],s.origins[1],s.bpm[0],s.bpm[1]);
 const missingBpm=s.camera?null:s.bpmKinds[0]==='unset'?0:s.sources[1]&&!s.camera&&s.bpmKinds[1]==='unset'?1:null;
 const counted=hasReference&&s.bpmKinds[s.soundSource]!=='unset';
 const choosing=!s.sources[0]||(!s.sources[1]&&!s.camera);
 // Keep source pickers in separate decks until both videos (or the camera) are selected.
 const overlay=mode==='overlay'&&config===null&&!choosing;
 const immersive=fullscreen.expanded&&config===null&&!choosing;
 const packed=packedVideoLayout(decksSize,[isYoutube?{width:16,height:9}:videoSizes[0],s.camera?cameraFrame(s.cameraFormat):videoSizes[1]]);
 function toggleFullscreen(){if(!fullscreen.expanded){if(config!==null)closeConfig();setPanel(null);setYoutubeControls(false);}void fullscreen.toggle();}
 const motionReference=useRef<HTMLDivElement>(null),motionSelf=useRef<HTMLDivElement>(null);
 const [motionResult,setMotionResult]=useState<{scope:string;data:MotionAnalysis}|null>(null),[motionStrength,setMotionStrength]=useState(1);
 const [motionPending,setMotionPending]=useState(false),motionPrompted=useRef('');
 const [motionEnabled,setMotionEnabled]=useState(true),motionOn=motionEnabled&&motionStrength>0;
 const motionMediaScope=JSON.stringify([s.sources.map(v=>[v?.url,v?.instance]),s.camera]);
 const motionScope=JSON.stringify([motionMediaScope,s.bpm,s.origins]);
 const trackingTarget=motionTarget(s.tripods,s.alignmentMaster);
 const motionStage=overlay?stageSize:trackingTarget===0?referenceStageSize:stageSize;
 const motionCurve=useMemo(()=>motionResult?.scope===motionScope&&trackingTarget!==null?buildMotionCurve(motionResult.data,{stage:motionStage,alignments:overlay?s.alignments:unalignedPair,mirrors:s.mirrors,scenes:currentScenes,target:trackingTarget}):null,[motionResult,motionScope,trackingTarget,overlay,motionStage.width,motionStage.height,s.alignments,s.mirrors,currentScenes[0],currentScenes[1]]);
 useEffect(()=>{setMotionResult(null);setMotionEnabled(true);motionPrompted.current='';},[motionMediaScope]);
 useEffect(()=>{setMotionPending(s.tripods.some(v=>!v));},[motionMediaScope,s.tripods[0],s.tripods[1]]);
 useMotionPlayback(s.reference,[motionReference,motionSelf],motionCurve,motionOn&&config===null&&!choosing&&!isYoutube&&!s.camera&&!sequence&&!poseBusy,motionStrength);
 const trackingWeight=motionWeightAt(motionCurve,s.time);
 const trackingLabel=!motionEnabled?'位置追従OFF':motionStrength===0?'位置追従 0%':trackingWeight===0?'位置追従：検出できない場面':trackingWeight<.5?'位置追従を弱め中':`位置追従中 ${Math.round(motionStrength*100)}%`;
 const livePoses=useLivePoses([s.reference,s.self],[false,s.camera&&appearances[1].skeleton&&!poseBusy&&!sequence&&(config===null||config===1)],backgroundKeys.join('|')+'|'+s.camera);
 const recordedPoses=useRecordedPoses([isYoutube?null:s.sources[0]?.url||null,s.camera?null:s.sources[1]?.url||null],appearances.map(v=>v.skeleton),poseBusy||sequence!==null||s.optimizing);
 const poseAnalysisStatus=(i:number)=>i===1&&s.camera?undefined:<RecordedPoseStatus state={recordedPoses.states[i]} retry={()=>recordedPoses.retry(i)}/>;
 const motionHint=isYoutube?'追従には動画ファイル・X動画を選択':s.camera?'追従には録画済みの動画2本を選択':choosing||missingBpm!==null?'先に2本のBPM・拍の位置を設定':!hasReference||s.durations.some(d=>d<=0)?'動画を読み込み中':'';
 const motionControls=!s.camera&&trackingTarget!==null?<MotionControls target={trackingTarget} curve={motionCurve} bothMoving={s.tripods.every(v=>!v)} strength={motionStrength} enabled={motionEnabled} toggle={toggleMotion} changeStrength={setMotionStrength} start={()=>startSequence(true)} disabled={s.recording||s.optimizing||poseBusy||sequence!==null} hint={motionHint}/>:undefined;
 const trackingText=motionCurve?.frames.length?trackingLabel:!motionEnabled?'位置追従OFF · 再解析が必要':motionHint?'位置追従の準備':motionResult?'位置追従を再解析':'位置追従を解析';
 function toggleMotion(){setMotionPending(false);setMotionEnabled(value=>!value);}
 function openMotion(){s.pause();setMotionPending(false);if(missingBpm!==null)openConfig(missingBpm,'tempo');else if(!motionCurve?.frames.length&&!motionHint)startSequence(true);else{setMode('overlay');setPanel('alignment');}}
 function changeTripod(index:number){const enabled=!s.tripods[index];if(!enabled)motionPrompted.current='';s.setTripod(index,enabled);s.setNotice(enabled?'':motionHint);}
 function applyMotionResult(data:MotionAnalysis){
  if(trackingTarget===null)throw new Error('手持ちの動画を三脚OFFにしてください。');
  const curve=buildMotionCurve(data,{stage:motionStage,alignments:overlay?s.alignments:unalignedPair,mirrors:s.mirrors,scenes:currentScenes,target:trackingTarget});
  if(!curve.frames.length)throw new Error('同じ姿勢の肩と腰を確認できた場面が不足しています。BPMと拍、反転の向きを確認してください。');
  setMotionResult({scope:motionScope,data});setMotionEnabled(true);setSequence(null);setPoses(null);
  recordedPoses.selectSubjects([0,1].map(i=>data.samples.find(sample=>sample.poses[i])?.poses[i]||null));
  s.setNotice('');
 }
 useLayoutEffect(()=>{
  if(!overlay)return;const r=s.reference.current,v=s.self.current;if(!r?.videoWidth||!v?.videoWidth||stageSize.width<=0||stageSize.height<=0)return;
  const key=(s.sources[0]?.url||'')+'|'+(s.camera?'camera':s.sources[1]?.url||''),previous=lastAlignmentStage.current;
  const reference={width:r.videoWidth,height:r.videoHeight},self={width:v.videoWidth,height:v.videoHeight};
  if(previous&&previous.key===key&&(previous.stage.width!==stageSize.width||previous.stage.height!==stageSize.height))s.setAlignments(a=>a.map((value,i)=>({...value,...resizeRegistration(value,previous.stage,stageSize,s.alignmentMaster===0?previous.reference:previous.self,i===0?previous.reference:previous.self)})) as typeof a);
  lastAlignmentStage.current={stage:stageSize,key,reference,self};
 },[overlay,stageSize.width,stageSize.height,s.sources[0]?.url,s.sources[1]?.url,s.camera,s.alignmentMaster]);
 const sequenceHint=s.camera?'カメラは「今の1コマで合わせる」を選択':missingBpm!==null?'先に2本の「拍・BPM」を設定':'';
 function startSequence(motion=false){
  const r=s.reference.current,v=s.self.current;
  if(isYoutube||s.camera||!s.sources[0]||!s.sources[1]||!r?.videoWidth||!v?.videoWidth||sequenceHint||s.recording||s.optimizing)return;
  s.pause();poseRequest.current++;setPoseBusy(false);setPoses(null);
  if(motion){setMotionPending(false);motionPrompted.current=motionScope+'|'+trackingTarget;}
  setSequence({sources:[{url:s.sources[0].url,time:r.currentTime,mirror:s.mirrors[0],scene:currentScenes[0]},{url:s.sources[1].url,time:v.currentTime,mirror:s.mirrors[1],scene:currentScenes[1]}],origins:[...s.origins],bpm:[...s.bpm],stage:{...stageSize},alignment:{...s.alignment},master:s.alignmentMaster,masterAlignment:{...s.alignments[s.alignmentMaster]},motion});
 }
 useEffect(()=>{
  if(!motionPending||!motionEnabled||config!==null||motionHint||trackingTarget===null||sequence||poseBusy||s.recording||s.optimizing||motionStage.width<=0||motionStage.height<=0)return;
  if(motionCurve?.frames.length||motionPrompted.current===motionScope+'|'+trackingTarget){setMotionPending(false);return;}
  let frame=0;frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>startSequence(true));});
  return()=>cancelAnimationFrame(frame);
 },[motionPending,motionEnabled,config,motionHint,trackingTarget,sequence,poseBusy,s.recording,s.optimizing,motionCurve,motionScope,motionStage.width,motionStage.height]);
 function openFirstBeat(){s.pause();s.setNotice('');s.seekSolo(0,s.origins[0]);s.seekSolo(1,s.origins[1]);setConfig(null);setPanel('firstBeat');}
 function openConfig(index:number,tab?:ConfigStep){poseRequest.current++;setPoseBusy(false);setPoses(null);setPanel(null);s.pause();s.setNotice('');setStep(tab||(s.sources[index]&&!(index===1&&s.camera)?'tempo':'source'));setConfig(index);}
 function removeVideo(index:number){s.removeVideo(index);setConfig(null);setPanel(null);}
 function closeConfig(save=false){if(save&&tempoConfig.current&&!tempoConfig.current.save()){setStep('tempo');s.setNotice('拍の設定を確認してください');return;}const saved=s.finishTimingEdit(save);if(save&&!saved)return;if(save&&motionEnabled&&trackingTarget!==null&&(step==='tempo'||step==='origin'))setMotionPending(true);setConfig(null);}
 function changeStep(value:string){s.pause();s.setNotice('');setStep(value as ConfigStep);}
 function setLoopFromMeasure(count:number){const bounds=measureLoop(s.time,s.origins[0],s.bpm[0],count,s.durations[0]);if(bounds.end-bounds.start<.1){s.setNotice('少し前に戻して、ループする区間を選んでください。');return;}setMeasures(count);s.setLoop({...bounds,enabled:true});s.seek(bounds.start);}
 async function saveLink(value=link){try{
  let saved:string;
  if(isTwitterUrl(value)){const twitter=parseTwitterLink(value);if(!await s.loadTwitter(twitter))return;saved=twitter.url;}
  else{const youtube=parseYouTubeLink(value);s.loadYoutube(youtube);saved=youtube.url;}
  setConfig(null);setPanel(null);setSavedLink(saved);setLink('');
  try{localStorage.setItem('wotagei:reference-link',saved);}catch{}
 }catch(e){s.setNotice(e instanceof TypeError?'YouTube・Xの投稿URLを https:// から貼ってください。':e instanceof Error?e.message:'動画のリンクを確認してください。');}}

 async function changeTwitterVideo(value:TwitterLink){
  s.saveTiming();
  if(!await s.loadTwitter(value))return;
  setSavedLink(value.url);try{localStorage.setItem('wotagei:reference-link',value.url);}catch{}
 }
 async function autoAlign(){if(isYoutube){s.setNotice('骨格合わせにはお手本の動画ファイルを選んでください。');return;}s.pause();const r=s.reference.current,v=s.self.current;if(!r||!v||!s.sources[0]||(!s.sources[1]&&!s.camera)){s.setNotice('2本の動画を読み込み、体が見える場面で止めてください。');return;}const id=++poseRequest.current;setPoseBusy(true);s.setNotice('');const stage={width:r.parentElement!.clientWidth,height:r.parentElement!.clientHeight},times=[r.currentTime,v.currentTime];try{const raw=await detectPoses([r,v]);if(id!==poseRequest.current)return;const points=raw.map((p,i)=>displayPose(p.map(point=>projectPoint(sceneMatrix(i===1&&s.camera?null:currentScenes[i]),point)),{width:i===0?r.videoWidth:v.videoWidth,height:i===0?r.videoHeight:v.videoHeight},stage,s.mirrors[i]));const fitted=fitPoses(transformPose(points[s.alignmentMaster],s.alignments[s.alignmentMaster],stage),perspectivePose(points[s.alignmentTarget],s.alignment,stage),stage,s.alignment.rotation);s.setAlignment(a=>({...a,...fitted.alignment}));setPoses({points,stage,times,mirrors:[...s.mirrors]});s.setNotice('');}catch(e){if(id===poseRequest.current)s.setNotice(e instanceof Error?e.message:'骨格を読み取れませんでした。');}finally{if(id===poseRequest.current)setPoseBusy(false);}}
 const showPose=overlay&&poses&&!s.playing&&!s.camera&&Math.abs(s.time-poses.times[0])<.06&&Math.abs(s.selfTime-poses.times[1])<.06;
 function resetAlignment(){setPoses(null);s.setAlignment({x:0,y:0,scale:1,rotation:0,opacity:.5,perspectiveX:0,perspectiveY:0});}
 async function enterCamera(facing:CameraFacing){if(await s.startCamera(facing)){setConfig(null);setPanel(null);}}
 function togglePractice(){if(s.preparing||s.playing)s.pause();else if(missingBpm!==null)openConfig(missingBpm,'tempo');else void s.play();}
 const fileInput=(i:number,label:string)=><label className="button file-button"><Upload size={17}/>{label}<input type="file" accept="video/*,.mov,.mp4,.webm" disabled={s.recording||s.recordingBusy} aria-label={`${i===0?'お手本':'自分'}の動画を選ぶ`} onChange={e=>{const f=e.target.files?.[0];if(f)s.loadFile(i,f);e.target.value='';}}/></label>;
 const recentPicker=(i:number)=><RecentMediaPicker index={i} loadFile={file=>s.loadFile(i,file)} loadLink={saveLink} disabled={s.recording||s.recordingBusy} pause={s.pause}/>;
 const sourceChoices=(i:number,label='選ぶ')=><div className="source-choices">
  {fileInput(i,label)}
  {i===0?<form className="link-form" onSubmit={e=>{e.preventDefault();void saveLink();}}><input type="url" value={link} onChange={e=>setLink(e.target.value)} placeholder="YouTube / X URLを入力" aria-label="YouTube・Xの動画リンク" disabled={s.linkLoading} required/><button className="button primary" type={s.linkLoading?"button":"submit"} disabled={s.recording||s.recordingBusy} onClick={s.linkLoading?()=>{s.cancelLinkLoad();s.setNotice('');}:undefined}>{s.linkLoading?'中止':'読込'}</button></form>:<div className="camera-choices">{(['user','environment'] as const).map(facing=><button key={facing} className="button" onClick={()=>s.camera&&s.cameraFacing===facing?s.stopCamera():void enterCamera(facing)} disabled={s.cameraBusy||s.recording||s.recordingBusy} aria-pressed={s.camera&&s.cameraFacing===facing}><Camera size={17}/>{cameraFacingLabel[facing]}{s.camera&&s.cameraFacing===facing?'停止':''}</button>)}</div>}
  {recentPicker(i)}
 </div>;
 return <main data-fullscreen={fullscreen.mode} className={'studio '+(immersive?'studio-immersive ':'')+(fullscreen.expanded?'studio-expanded ':'')+(config!==null?'editing ':'')+(choosing?'choosing ':'')+(isYoutube?'has-youtube ':'')+(panel==='alignment'||panel==='firstBeat'?'aligning':'')+(panel==='firstBeat'?' first-beat-timing':'')}>
  <header className="masthead"><div className="brand">{config!==null?<button className="icon-button" aria-label="練習画面に戻る" onClick={()=>closeConfig()}><ArrowLeft/></button>:<Activity className="brandmark"/>}<h1>{config!==null?`${config===0?'お手本':'自分'}の設定`:'ヲタ芸マスター'}</h1></div><div className="masthead-actions">{config===null?<Tabs value={mode} onValueChange={v=>{if(v==='compare')setPanel(null);setMode(String(v));}}><TabsList aria-label="動画の表示"><TabsTrigger value="compare"><Columns2/><span>比較</span></TabsTrigger><TabsTrigger value="overlay"><Layers2/><span>重ねる</span></TabsTrigger></TabsList></Tabs>:<span className="private-label">動画ごとに設定</span>}<button type="button" className="icon-button fullscreen-button" aria-label={fullscreen.expanded?'全画面を終了':'全画面にする'} title={fullscreen.expanded?'全画面を終了':'全画面にする'} aria-pressed={fullscreen.expanded} disabled={fullscreen.pending||choosing} onClick={toggleFullscreen}>{fullscreen.expanded?<Minimize/>:<Maximize/>}</button></div></header>
  <div ref={decksRef} style={{'--packed-columns':packed.columns,'--packed-rows':packed.rows} as CSSProperties} className={'decks '+(overlay?'overlaid '+(s.alignmentMaster===1?'alignment-master-self ':''):'')+(overlay&&isYoutube?'youtube-overlaid ':'')+(youtubeControls?'youtube-controls-visible ':'')+(config!==null?'configuring':'')}>
   {[0,1].map(i=>{
    const source=s.sources[i],yt=i===0&&!!s.sources[0]?.youtube,live=i===1&&s.camera,selected=config===i,empty=!source&&!live,t=i===0?s.time:s.selfTime,available=!!source&&(yt?s.youtubeReady:s.durations[i]>0)&&!live;
    const calibrating=selected&&step==='camera'&&!yt&&!live,cutSource=live?'camera':source?.url||'',cutKey=cutSource+'|'+backgrounds[i].mode;
    const cutActive=panel!=='firstBeat'&&!calibrating&&!yt&&!empty&&backgrounds[i].mode!=='off'&&(config===null||selected),cutReady=cutActive&&backgroundReady[i]===cutKey;
    const viewSize={width:(i===0?referenceStageSize:stageSize).width,height:Math.max(0,(i===0?referenceStageSize:stageSize).height-(selected&&available&&!yt?62:0))};
    const baseTransform=overlay?alignmentCss(s.alignments[i],stageSize,s.mirrors[i]):`scaleX(${!calibrating&&s.mirrors[i]?-1:1})`;
    const outputFrame=cameraFrame(s.cameraFormat),frameRect=containRect(outputFrame.width,outputFrame.height,viewSize.width,viewSize.height);
    const cameraPreviewStyle=live&&!overlay?{inset:'auto',left:frameRect.x,top:frameRect.y,width:frameRect.width,height:frameRect.height}:{};
    const appearance=appearances[i],gradeId='video-grade-'+i,grade=(appearance.gamma!==1||appearance.tint&&cutReady)?'url(#'+gradeId+') ':'';
    const filter=yt?undefined:grade+(appearance.contrast!==1?'contrast('+appearance.contrast+')':'');
    const livePoints=livePoses[i],boneStage=viewSize,boneSize={width:(i===0?s.reference:s.self).current?.videoWidth||1,height:(i===0?s.reference:s.self).current?.videoHeight||1};
    const boneCurrent=livePoints.status==='visible'&&!((i===0?s.reference:s.self).current?.seeking)&&Math.abs(((i===0?s.reference:s.self).current?.currentTime||0)-livePoints.time)<.08+.12*((i===0?s.reference:s.self).current?.playbackRate||1);
    const boneScene=live?null:calibrating?(sceneScope[i]===backgroundKeys[i]?scenePreview[i]:null):currentScenes[i];
    const boneBase=displayPose(livePoints.points.map(p=>projectPoint(sceneMatrix(boneScene),p)),boneSize,live&&!overlay?{width:frameRect.width,height:frameRect.height}:boneStage,!calibrating&&s.mirrors[i]);
    const bonePoints=overlay?transformPose(boneBase,s.alignments[i],boneStage):live?boneBase.map(p=>({...p,x:p.x+frameRect.x,y:p.y+frameRect.y})):boneBase;
    const mediaStyle={...cameraPreviewStyle,filter,transform:baseTransform+(live?'':' '+sceneCss(calibrating?(sceneScope[i]===backgroundKeys[i]?scenePreview[i]:null):currentScenes[i],viewSize)),opacity:overlay&&i===s.alignmentTarget&&!(yt&&youtubeControls)?s.alignment.opacity:1};
    return <section className={`deck deck-${i} ${selected?'selected':''} ${drag===i?'dragging':''}`} key={i} onDragOver={e=>{e.preventDefault();setDrag(i);}} onDragLeave={()=>setDrag(null)} onDrop={e=>{e.preventDefault();setDrag(null);if(s.recording)return;const f=e.dataTransfer.files[0];if(f)s.loadFile(i,f);}}>
     <header className="deck-header"><span className="deck-dot"/><strong>{i===0?'お手本':'自分'}</strong>{yt&&overlay&&<button className="button mini youtube-overlay-toggle" disabled={!s.sources[1]&&!s.camera} aria-pressed={youtubeControls} onClick={()=>setYoutubeControls(v=>!v)}>{youtubeControls?'重ね表示に戻る':'YouTubeを操作'}</button>}{source?.twitter?<a className="filename" href={source.twitter.url} target="_blank" rel="noopener noreferrer" title="Xの元投稿を開く">{source.name} ↗</a>:<span className="filename" title={source?.name}>{live?cameraFacingLabel[s.cameraFacing]:source?.name||'動画未選択'}</span>}{source?.twitter&&<TwitterVideoSwitch source={source.twitter} loading={s.linkLoading} disabled={s.recording||s.optimizing||poseBusy||sequence!==null} select={value=>void changeTwitterVideo(value)} cancel={()=>{s.cancelLinkLoad();s.setNotice('');}}/>}<span className="deck-status">{live?'LIVE · '+cameraFormatLabel[s.cameraFormat]:i===1&&s.optimized?'軽量版':s.bpmKinds[i]==='unset'?'BPM 未設定':`${Number(s.bpm[i].toFixed(3))} BPM`}</span></header>
     <div className="deck-body"><div ref={i===1?selfStage:referenceStage} style={{mixBlendMode:overlay&&appearance.tint&&cutReady?'screen':undefined}} className={'video-stage '+(selected&&available&&!yt?'with-preview ':'')+(yt?'youtube-stage':'')+(cutReady&&!overlay?' cutout-preview '+backgrounds[i].preview:'')}>
      <VideoGrade id={gradeId} value={{...appearance,tint:appearance.tint&&cutReady}} index={i}/><div className="motion-layer" ref={i===0?motionReference:motionSelf}>
      {yt&&source?.youtube?<YouTubeReference key={source.key+":"+source.instance} link={source.youtube} style={overlay&&!youtubeControls?{transform:alignmentCss(s.alignments[0],stageSize),opacity:mediaStyle.opacity}:undefined} ready={s.attachYoutube} state={s.youtubeState} rate={s.youtubeRate} error={s.youtubeError} metadata={s.youtubeMetadata}/>:<video ref={i===0?s.reference:s.self} src={source?.url} playsInline muted={s.preparing||live||i!==(s.soloPlaying??s.soundSource)} preload="auto" style={{...mediaStyle,opacity:cutReady?0:mediaStyle.opacity}} onResize={e=>readVideoSize(i,e.currentTarget)} onLoadedMetadata={e=>{readVideoSize(i,e.currentTarget);if(!live)s.loaded(i);}} onEnded={()=>s.mediaEnded(i)} onWaiting={()=>s.mediaWaiting(i)} onSeeking={()=>s.interruptTap(i)} onPause={e=>{if(e.currentTarget.paused)s.interruptTap(i);}} onPlaying={i===0?s.mediaPlaying:undefined} onError={()=>{if(source&&!live)s.mediaError(i);}} aria-label={i===0?'お手本の映像':'自分の映像'}/>}
      {cutActive&&<BackgroundVideo video={i===0?s.reference:s.self} settings={backgrounds[i]} source={cutSource} active={cutActive} style={mediaStyle} status={(ready,message)=>{setBackgroundReady(v=>{const next=ready?cutKey:'';return v[i]===next?v:v.map((old,j)=>i===j?next:old);});if(message&&!message.startsWith('背景を準備中'))s.setNotice(message);}}/>}
      {appearance.skeleton&&live&&boneCurrent&&<PoseOverlay stage={boneStage} color="#c5afff" points={bonePoints}/>}
      {appearance.skeleton&&!yt&&!live&&!recordedPoses.states[i].timeline&&showPose&&poses&&<PoseOverlay stage={poses.stage} color={i===0?'#cdfa69':'#c5afff'} points={transformPose(poses.points[i],s.alignments[i],poses.stage)}/>}
      {appearance.skeleton&&!yt&&!live&&recordedPoses.states[i].timeline&&<RecordedPoseOverlay video={i===0?s.reference:s.self} timeline={recordedPoses.states[i].timeline!} stage={boneStage} color={i===0?'#cdfa69':'#c5afff'} mirror={!calibrating&&s.mirrors[i]} scene={boneScene} alignment={overlay?s.alignments[i]:null}/>}
      </div>
      {appearance.skeleton&&live&&livePoints.status!=='visible'&&<span className="stage-badge skeleton-status" role="status">{livePoints.status==='loading'?'骨格を準備中':livePoints.status==='error'?'骨格を表示できません':'骨格を検出できない場面'}</span>}
      {appearance.skeleton&&!live&&!yt&&recordedPoses.states[i].status!=='ready'&&<span className="stage-badge skeleton-status" role="status">{recordedPoseLabel(recordedPoses.states[i])}</span>}
      {live&&!overlay&&<div className="camera-recording-frame" style={cameraPreviewStyle} aria-label={`録画範囲 ${cameraFormatLabel[s.cameraFormat]}`}/>}
      {live&&s.recordingBusy&&<span className="stage-badge" role="status">録画を準備中…</span>}
      {config===null&&!choosing&&!s.camera&&trackingTarget===i&&<div className="stage-badge motion-badge"><button disabled={s.recording||s.optimizing||poseBusy||sequence!==null} onClick={openMotion} aria-label={`${i===0?'お手本':'自分'}の追従設定`}>{trackingText}</button>{!!motionCurve?.frames.length&&panel!=='alignment'&&<button onClick={toggleMotion} disabled={s.recording||s.optimizing||poseBusy||sequence!==null}>{motionEnabled?'追従を解除':'追従を再開'}</button>}</div>}
      {empty&&<div className="empty-stage">{selected?<button className="button" onClick={()=>changeStep('source')}>動画タブで選ぶ</button>:sourceChoices(i)}</div>}
      {s.preparing&&!live&&!yt&&<div className="start-sync-cover" role="status"><span>{s.camera?'再生を準備しています…':'開始位置を合わせています…'}</span></div>}{i===0&&!yt&&s.buffering&&<span className="stage-badge">読み込み中</span>}{live&&s.recording&&<span className="stage-badge rec" role="status">● REC · {recordingSoundLabel[s.recordingSound]}</span>}{live&&!s.recording&&s.recordingDownload&&<a className="stage-badge recording-save" href={s.recordingDownload.url} download={s.recordingDownload.name}><Download size={14}/>録画を保存</a>}
      {i===1&&source&&!live&&s.playing&&(targetSelf<0||targetSelf>=s.durations[1])&&<span className="stage-badge">{targetSelf<0?'動画の開始前':'動画の終了後'}</span>}
      {selected&&available&&!yt&&<div className="preview-tools"><Range label={`${i===0?'お手本':'自分'}の位置を調整`} value={t} max={s.durations[i]} onChange={v=>s.seekSolo(i,v)}/><div><button className="preview-nudge" onClick={()=>s.seekSolo(i,t-.1)} aria-label="0.1秒戻す"><ChevronLeft size={16}/><span>0.1秒</span></button><button className="preview-play" onClick={()=>s.soloPlaying===i?s.pause():void s.playSolo(i)} aria-label={s.soloPlaying===i?'この動画を一時停止':'この動画だけ等速で音付き再生'}>{s.soloPlaying===i?<Pause size={18}/>:<Play size={18}/>}<span>{s.soloPlaying===i?'停止':'等速再生'}</span></button><button className="preview-nudge" onClick={()=>s.seekSolo(i,t+.1)} aria-label="0.1秒進める"><span>0.1秒</span><ChevronRight size={16}/></button><span className="mono">{timeLabel(t)}</span></div></div>}
     </div><aside className={`tool-rail${source&&!live?' with-remove with-tripod':live?' with-camera':''}`} aria-label={`${i===0?'お手本':'自分'}の操作`}><span className="tool-rail-label" aria-hidden="true">{i===0?'お手本':'自分'}</span><button className={selected?'active':''} disabled={s.recording||s.recordingBusy} onClick={()=>selected?closeConfig():openConfig(i)} aria-label={`${i===0?'お手本':'自分'}の設定`} aria-pressed={selected}><Settings2/><span>{selected?'戻る':'設定'}</span></button><button disabled={yt} title={yt?'YouTubeの反転はできません':undefined} onClick={()=>s.setMirrors(a=>a.map((v,j)=>i===j?!v:v))} aria-pressed={s.mirrors[i]}><FlipHorizontal2/><span>反転</span></button>{source&&!live&&<button className="tripod-toggle" disabled={yt||s.recording||poseBusy||sequence!==null||s.optimizing} aria-label={`${i===0?'お手本':'自分'}の三脚`} aria-pressed={s.tripods[i]} title={yt?'YouTubeは手持ち追従に対応していません':s.tripods[i]?'三脚ON：固定撮影。押すと手持ち動画に切り替え':'三脚OFF：位置の設定から追従を解析'} onClick={()=>changeTripod(i)}><span className="tripod-symbol"><Camera/><small>{s.tripods[i]?'ON':'OFF'}</small></span><span>三脚</span></button>}{live&&<button className="camera-switch" disabled={s.cameraBusy||s.recording||s.recordingBusy||poseBusy} onClick={()=>void s.startCamera(s.cameraFacing==='user'?'environment':'user')} aria-label={s.cameraFacing==='user'?'外カメに切り替える':'インカメに切り替える'} title={s.cameraFacing==='user'?'外カメに切り替える（録画停止中のみ）':'インカメに切り替える（録画停止中のみ）'}><SwitchCamera/><span>切替</span></button>}{live&&<button className="camera-play" disabled={!hasReference||poseBusy||s.optimizing} onClick={togglePractice} aria-label={s.preparing||s.playing?'お手本を停止':'お手本を再生'} aria-pressed={s.playing}>{s.preparing||s.playing?<Pause/>:<Play/>}<span>{s.preparing||s.playing?'停止':'再生'}</span></button>}{live?<button disabled={s.preparing||s.cameraBusy} className={s.recording?'recording':''} onClick={recordingAction} aria-label={s.recording?'録画停止':s.recordingBusy?'録画準備を中止':'録画開始'}>{s.recording?<Square/>:<span className="rec-dot"/>}<span>{s.recording?'終了':s.recordingBusy?'中止':'録画'}</span></button>:<button disabled={s.recording||s.recordingBusy} onClick={()=>openConfig(i,'source')}><Upload/><span>{source?'変更':'読込'}</span></button>}{source&&!live&&<button disabled={s.recording||s.recordingBusy} onClick={()=>removeVideo(i)} aria-label={`${i===0?'お手本':'自分'}の動画を外す`}><X/><span>外す</span></button>}</aside></div>
     {selected&&<Tabs className="video-config" data-step={step} value={step} onValueChange={v=>changeStep(String(v))}><TabsList aria-label="動画設定の項目"><TabsTrigger value="tempo">拍・BPM</TabsTrigger><TabsTrigger value="origin">拍の位置</TabsTrigger><TabsTrigger value="display">表示</TabsTrigger><TabsTrigger value="camera">画角</TabsTrigger><TabsTrigger value="source">動画</TabsTrigger></TabsList>{step==='origin'&&<BeatPreview time={t} origin={s.origins[i]} bpm={s.bpm[i]} playing={s.beatPreview===i} disabled={!available||s.bpmKinds[i]==='unset'} toggle={()=>s.beatPreview===i?s.pause():void s.previewBeats(i)}/>}
      <TabsContent value="origin" className="config-content">{yt&&<p className="config-hint">再生・停止はYouTube内で操作</p>}<button className="button primary wide" disabled={!available} onClick={()=>s.markOrigin(i)}><Check size={17}/>この位置を1拍目にする</button><div className="origin-value"><Numeric label="1拍目の位置（秒）" value={s.origins[i]} max={s.durations[i]||999} step={s.nudgeStep} precision={6} disabled={!available} onChange={v=>{s.pause();s.adjustOrigin(i,v);}}/><button className="button" disabled={!available} onClick={()=>s.seekSolo(i,s.origins[i])}>1拍目に戻る</button></div>{!available&&<span className="config-hint">{live?'カメラは拍の位置設定なし':'「動画」タブで動画を選択'}</span>}</TabsContent>
      <TabsContent value="tempo" keepMounted className="config-content tempo-content"><TempoConfig ref={tempoConfig} active={step==='tempo'} origin={s.origins[i]} key={source?.key||i} mediaKey={source?.key||''} mainPlaying={s.soloPlaying!==null||s.playing} preview={<BeatPreview time={t} origin={s.origins[i]} bpm={s.bpm[i]} playing={s.beatPreview===i} disabled={!available||s.bpmKinds[i]==='unset'} toggle={()=>s.beatPreview===i?s.pause():void s.previewBeats(i)}/>} remote={yt} file={s.files.current[i]} live={live} bpm={s.bpm[i]} kind={s.bpmKinds[i]} tapRecording={s.tapRecording===i} tapGrid={s.tapGrids[i]} beginTap={()=>void s.beginTap(i)} finishTap={s.finishTap} tapCount={s.tapCounts[i]} tap={()=>s.tap(i)} apply={(v,kind)=>s.applyBpm(i,v,kind)} applyGrid={(bpm,origin)=>s.applyAnalyzedGrid(i,bpm,origin)} pause={s.pause}/></TabsContent>
      <TabsContent value="camera" className="config-content scene-content">{available&&!yt&&sceneScope[i]===backgroundKeys[i]?<SceneCalibrationEditor key={source?.key} video={i===0?s.reference:s.self} saved={currentScenes[i]} preview={value=>setScenePreview(v=>v.map((old,j)=>i===j?value:old))} save={value=>saveScene(i,value)}/>:<p className="config-hint">画角補正は動画ファイル・X動画に対応</p>}</TabsContent><TabsContent value="display" className="config-content"><AppearanceControls value={appearance} change={v=>changeAppearance(i,v)} disabled={yt||empty} live={live} analysis={poseAnalysisStatus(i)}/><BackgroundControls settings={backgrounds[i]} change={v=>changeBackground(i,v)} disabled={yt||empty}/><label className="setting-row"><span>左右反転</span><Switch aria-label="この動画の左右反転" disabled={yt} checked={s.mirrors[i]} onCheckedChange={v=>s.setMirrors(a=>a.map((n,j)=>i===j?v:n))}/></label>{i===1&&<button className="button" onClick={()=>{closeConfig();setMode('overlay');setPanel('alignment');}}><Layers2 size={17}/>重ねる位置・倍率を調整</button>}</TabsContent>
      <TabsContent value="source" className="config-content source-content">{sourceChoices(i,source&&!live?'別の動画を選ぶ':'選ぶ')}
       {i===1&&<div className="camera-format-settings"><label className="numeric"><span>カメラの録画サイズ</span><select aria-label="カメラの録画サイズ" value={s.cameraFormat} disabled={s.recording||s.recordingBusy} onChange={e=>s.setCameraFormat(e.target.value==='portrait'?'portrait':'landscape')}><option value="landscape">横 16:9（標準）</option><option value="portrait">縦 9:16</option></select></label><p className="config-hint">録画は補正前の映像</p></div>}
       {i===0?<>{savedLink&&<a className="saved-link" href={savedLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>前回のリンクを元サイトで開く</a>}</>:<>{s.recordingDownload&&<a className="button" href={s.recordingDownload.url} download={s.recordingDownload.name}><Download size={17}/>録画を保存</a>}{source&&!live&&<><div className="source-actions"><button className="button" disabled={s.optimizing||s.optimized} onClick={()=>void s.makeLightVideo()}>{s.optimizing?`軽量化 ${Math.round(s.optimizeProgress*100)}%`:s.optimized?'軽量版を使用中':'カクつく動画を軽量化'}</button>{s.optimizing&&<button className="button" onClick={s.cancelOptimization}>中止</button>}{s.optimized&&<button className="button" onClick={s.useOriginalVideo}>元の動画に戻す</button>}</div></>}</>}
       {source&&!live&&<button className="button" disabled={s.recording||s.recordingBusy} onClick={()=>removeVideo(i)}><X size={17}/>この動画を外す</button>}
      </TabsContent>
     </Tabs>}
    </section>;
   })}
   <FullscreenPlayerControls tracking={!s.camera&&trackingTarget!==null?{label:trackingText,enabled:motionEnabled,toggle:motionCurve?.frames.length?toggleMotion:undefined,disabled:s.recording||s.optimizing||poseBusy||sequence!==null,open:()=>{if(motionCurve?.frames.length||motionHint)void fullscreen.exit();openMotion();}}:undefined} active={immersive} playing={s.playing} preparing={s.preparing} time={s.time} duration={s.durations[0]} onPlay={()=>{if(missingBpm!==null){void fullscreen.exit();openConfig(missingBpm,'tempo');}else void s.play();}} onPause={s.pause} onSeek={s.seek} onExit={()=>void fullscreen.exit()}/>
   {overlay&&panel==='alignment'&&!youtubeControls&&!poseBusy&&!sequence&&!s.recording&&!s.optimizing&&hasReference&&(!!s.sources[1]||s.camera)&&<AlignmentGestures value={s.alignment} target={s.alignmentTarget} scope={`${s.sources[0]?.url}|${s.sources[1]?.url}|${s.camera}|${s.alignmentMaster}|${stageSize.width}|${stageSize.height}`} change={s.setAlignment} start={s.pause}/>}
  </div>
  {config===null&&panel==='firstBeat'?<FirstBeatEditor origins={s.origins} bpm={s.bpm} durations={s.durations} playing={s.playing} preparing={s.preparing} seek={s.seekSolo} pause={s.pause} preview={(values,lead)=>void s.previewFirstBeats(values,lead)} save={values=>{if(s.applyFirstBeats(values,true))setPanel(null);}} close={()=>setPanel(null)}/>:config===null&&panel==='alignment'?<AlignmentEditor master={s.alignmentMaster} changeMaster={value=>{s.pause();poseRequest.current++;setPoses(null);setSequence(null);s.setAlignmentMaster(value);}} masterDisabled={!hasReference||(!s.sources[1]&&!s.camera)||s.recording||s.optimizing} manualOnly={isYoutube} background={<><div className="overlay-appearance-presets"><strong>重ね表示</strong><div>{(['normal','bones','person','color'] as const).map((kind,i)=><button className="button" key={kind} onClick={()=>overlayPreset(kind)}>{['通常','骨格で比較','人物だけ','色分け'][i]}</button>)}</div><div className="skeleton-choices">{[0,1].map(i=><button className="button" key={i} aria-label={(i===0?'お手本':'自分')+'の骨格表示'} aria-pressed={appearances[i].skeleton} disabled={i===0&&isYoutube} onClick={()=>changeAppearance(i,{...appearances[i],skeleton:!appearances[i].skeleton})}>{i===0?'お手本':'自分'}の骨格 {appearances[i].skeleton?'ON':'OFF'}</button>)}</div></div><AppearanceControls value={appearances[s.alignmentTarget]} change={v=>changeAppearance(s.alignmentTarget,v)} disabled={s.alignmentTarget===0&&isYoutube} live={s.alignmentTarget===1&&s.camera} analysis={poseAnalysisStatus(s.alignmentTarget)}/><BackgroundControls settings={backgrounds[s.alignmentTarget]} change={v=>changeBackground(s.alignmentTarget,v)} disabled={s.alignmentTarget===0?isYoutube||!hasReference:!s.sources[1]&&!s.camera}/></>} alignment={s.alignment} change={(key,value)=>{s.pause();s.setAlignment(a=>({...a,[key]:value}));}} auto={()=>void autoAlign()} autoSequence={()=>startSequence(false)} motion={motionControls} sequenceHint={sequenceHint} busy={poseBusy||sequence!==null} disabled={s.recording||s.optimizing||!s.sources[0]||(!s.sources[1]&&!s.camera)} close={()=>setPanel(null)} reset={resetAlignment} form={poses? <div className="form-differences"><small style={{gridColumn:"1/-1"}}>位置合わせ時の角度差（2D）</small>{[[11,13,15],[12,14,16],[23,25,27],[24,26,28]].map((ids,j)=>{const a=jointAngle(poses.points[0],ids[0],ids[1],ids[2]);const counterpart=poses.mirrors[0]!==poses.mirrors[1]?ids.map(n=>n%2?n+1:n-1):ids;const b=jointAngle(poses.points[1],counterpart[0],counterpart[1],counterpart[2]);return <span key={j}>{['左肘','右肘','左膝','右膝'][j]}の角度差 {a===null||b===null?'未検出':`${Math.round(Math.abs(a-b))}°`}</span>;})}</div>:<p>同じ姿勢で止めて位置合わせ</p>}/>:config===null?<footer className="practice-dock"><div className="count-row"><span className="position-label" aria-label="現在の小節と技" title="1小節＝4拍・1技＝32拍（8小節）。小節は1拍目から通算。"><span>{counted&&beat.index>=0?beat.measure:'—'}小節</span><span>{counted&&beat.index>=0?beat.technique:'—'}技</span></span><div className="beat-cells" aria-label="現在の拍">{[1,2,3,4,5,6,7,8].map(n=><span key={n} className={counted&&beat.index>=0&&beat.beat===n?'active':''}>{n}</span>)}</div><label className="click-toggle"><span>拍音</span><Switch size="sm" disabled={!counted} checked={s.click} onCheckedChange={s.setClick} aria-label="拍のクリック音"/></label></div>
   <VideoTracks master={s.soundSource} rate={s.rate} changeMaster={s.changeSound} changeRate={s.setRate} canSelf={!!s.sources[1]&&!s.camera} controlsDisabled={s.optimizing||s.preparing} nudgeDisabled={!hasReference||!s.sources[1]||s.camera||missingBpm!==null||s.durations.some(d=>d<=0)||s.recording||poseBusy||s.optimizing||s.preparing} nudge={s.nudgeTiming} nudgeStep={s.nudgeStep} scope={s.sources.map(v=>v?.key||'').join('|')} durations={s.durations} origins={s.origins} bpm={s.bpm} known={s.bpmKinds.map(k=>k!=='unset')} time={s.time} selfTime={s.selfTime} playing={s.playing} camera={s.camera} disabled={poseBusy||s.optimizing} seek={s.seek} adjust={s.adjustOrigin} pause={s.pause} save={s.saveTiming}/>
   <div className="transport"><button className="transport-option" onClick={()=>{if(isYoutube&&!s.camera)s.pause();setPanel('speed');}} aria-label="練習速度と鳴らす音を設定"><strong>{Number(s.rate.toFixed(4))}×</strong><span>速度・音</span></button>{!isYoutube&&!s.camera&&<button className="transport-option" disabled={missingBpm!==null||!s.sources[1]||s.durations.some(d=>d<=0)||s.camera||isYoutube||s.recording||s.optimizing} onClick={openFirstBeat} aria-label="1拍目を合わせる"><SkipBack/><span>1拍目</span></button>}<button className="play-button" disabled={!hasReference||(!isYoutube&&missingBpm===null&&invalidRate)||poseBusy||s.optimizing} onClick={togglePractice}>{s.playing?<Pause size={20}/>:<Play size={20}/>}<span>{s.preparing?'開始を中止':s.playing?'停止':missingBpm!==null?'BPMを設定':s.camera?'練習再生':'同期再生'}</span></button><button className={'transport-option '+(s.loop.enabled?'on':'')} disabled={!counted||s.recording} onClick={()=>{if(isYoutube)s.pause();setPanel('loop');}} aria-label="区間ループを設定"><Repeat2 size={20}/><span>ループ</span></button>{overlay&&<button className="transport-option" onClick={()=>{s.pause();setPanel('alignment');}} aria-label="重ね合わせ調整"><SlidersHorizontal size={20}/><span>位置</span></button>}</div>
  </footer>:<footer className="config-dock"><button className="button" onClick={()=>step==='origin'?changeStep('tempo'):changeStep('origin')}>{step==='origin'?'拍・BPMへ':'拍の位置を微調整'}<ChevronRight size={16}/></button><button className="button primary" onClick={()=>closeConfig(true)}><Check size={17}/>保存して戻る</button></footer>}
  {s.notice&&<div className="notice" role="status"><span>{s.notice}</span><button className="icon-button" onClick={()=>s.setNotice('')} aria-label="メッセージを閉じる"><X size={16}/></button></div>}
  <RecordingAudioDialog open={recordingDialog} busy={s.recordingBusy} error={s.recordingError} start={s.toggleRecording} close={()=>{s.cancelRecordingStart();setRecordingDialog(false);}}/>
  {sequence&&<AutoAlignment options={sequence} close={()=>setSequence(null)} applyMotion={applyMotionResult} apply={alignment=>{s.setAlignment(a=>({...a,...alignment}));setSequence(null);setPoses(null);s.setNotice('');}}/>}
  <Dialog open={panel!==null&&panel!=='alignment'&&panel!=='firstBeat'} onOpenChange={open=>{if(!open)setPanel(null);}}><DialogContent className={`practice-dialog${panel==='speed'?' speed-dialog':''}`}><DialogTitle>{panel==='speed'?'練習速度・音':panel==='loop'?'区間ループ':'重ね合わせ調整'}</DialogTitle><DialogDescription className="sr-only">{panel==='speed'?'音源と再生速度の設定':'繰り返す区間の設定'}</DialogDescription>

   {panel==='speed'&&<div className="speed-settings">{!s.camera&&<><label className="numeric nudge-step-setting"><span>矢印1回のずらし量</span><select aria-label="矢印1回のずらし量" value={s.nudgeStep} onChange={e=>s.setNudgeStep(Number(e.target.value))}>{NUDGE_STEPS.map(n=><option key={n} value={n}>{nudgeSecondsLabel(n)}秒</option>)}</select></label><fieldset className="sound-choice"><legend>鳴らす音・テンポの基準</legend><div>{([0,1] as const).map(i=><button key={i} className="button" aria-pressed={s.soundSource===i} disabled={s.recording||s.optimizing||(i===1&&(!s.sources[1]||s.camera))} onClick={()=>s.changeSound(i)}>{i===0?'お手本の音':'自分の音'}</button>)}</div></fieldset><button className="button" disabled={!hasReference||s.optimizing} onClick={()=>s.seek(s.time)}>今の位置で再同期</button></>}<div className="speed-readout"><strong>{Number(s.rate.toFixed(4))}×</strong><span>{counted?`${(s.bpm[s.soundSource]*s.rate).toFixed(1)} BPM`:'BPM 未設定'}</span></div><Numeric label="練習速度（詳細）" precision={9} min={.25} max={MAX_PRACTICE_RATE} step={.001} value={s.rate} onChange={s.setRate} disabled={s.optimizing||s.preparing}/><Range label="練習速度" min={.25} max={MAX_PRACTICE_RATE} step={.01} value={s.rate} onChange={s.setRate}/><div className="speed-presets">{[.5,.75,1,1.25].map(n=><button className={'button '+(s.rate===n?'chosen':'')} key={n} onClick={()=>s.setRate(n)}>{Number(n.toFixed(3))}×</button>)}</div></div>}
   {panel==='loop'&&<><label className="setting-row"><span>ループする</span><Switch aria-label="区間ループ" checked={s.loop.enabled} onCheckedChange={v=>{if(v&&s.loop.end-s.loop.start<.1)setLoopFromMeasure(measures);else s.setLoop(l=>({...l,enabled:v}));}}/></label><div className="speed-presets">{[1,2,4,8].map(n=><button className={'button '+(measures===n&&s.loop.enabled?'chosen':'')} key={n} onClick={()=>setLoopFromMeasure(n)}>{n===8?'1技':`${n}小節`}</button>)}</div><div className="loop-points"><Numeric label="A 始点（秒）" value={s.loop.start} max={Math.max(0,s.loop.end-.1)} step={.01} onChange={n=>s.setLoop(l=>({...l,start:n}))}/><Numeric label="B 終点（秒）" value={s.loop.end} min={s.loop.start+.1} max={Math.max(s.loop.start+.1,s.durations[0])} step={.01} onChange={n=>s.setLoop(l=>({...l,end:n}))}/></div><div className="speed-presets"><button className="button" onClick={()=>{const start=clamp(s.time,0,Math.max(0,s.durations[0]-.1));s.setLoop(l=>({...l,start,end:Math.min(s.durations[0],Math.max(l.end,start+480/s.bpm[0]))}));}}>今をAにする</button><button className="button" disabled={s.time<=s.loop.start+.1} onClick={()=>s.setLoop(l=>({...l,end:s.time}))}>今をBにする</button></div></>}

   <button className="button primary wide" onClick={()=>setPanel(null)}>完了</button>
  </DialogContent></Dialog>
 </main>;
}

