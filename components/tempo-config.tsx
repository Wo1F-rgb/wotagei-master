'use client';
import {useEffect,useRef,useState} from 'react';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty} from '@/components/ui/combobox';
import {analyzeFile} from '@/lib/analyze-file';
import type {BpmAnalysis} from '@/lib/bpm-analysis';
import {bpmLabels,type BpmKind} from '@/lib/tempo-model';
import type {Song} from '@/lib/song-library';
import {BeatTap} from '@/components/beat-tap';
import type {BeatGrid} from '@/lib/beat-grid';
import {OnlineMusic} from '@/components/online-music';

type Props={remote?:boolean;file:File|null;live:boolean;bpm:number;kind:BpmKind;tapRecording:boolean;tapGrid:BeatGrid|null;beginTap:()=>void;finishTap:()=>void;tapCount:number;tap:()=>void;apply:(value:number,kind:BpmKind)=>void;pause:()=>void};
export function TempoConfig({remote=false,file,live,bpm,kind,tapRecording,tapGrid,beginTap,finishTap,tapCount,tap,apply,pause}:Props){
 const [mode,setMode]=useState('tap'),[text,setText]=useState(kind==='unset'?'':String(bpm));
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[result,setResult]=useState<BpmAnalysis|null>(null);
 const [songs,setSongs]=useState<Song[]>([]),[song,setSong]=useState<Song|null>(null);
 const controller=useRef<AbortController|null>(null),active=useRef(true);
 useEffect(()=>{active.current=true;try{const stored=JSON.parse(localStorage.getItem('wotagei:songs')||'[]');if(Array.isArray(stored))setSongs(stored.filter((s:Song)=>typeof s.name==='string'&&typeof s.artist==='string'&&typeof s.id==='string'&&s.bpm>=40&&s.bpm<=300).slice(0,5000));}catch{}return()=>{active.current=false;controller.current?.abort();};},[]);
 useEffect(()=>setText(kind==='unset'?'':String(bpm)),[bpm,kind]);
 useEffect(()=>{controller.current?.abort();setBusy(false);setResult(null);setMessage('');},[file]);
 const valid=Number.isFinite(Number(text))&&Number(text)>=40&&Number(text)<=300;
 function adopt(value:number,from:BpmKind){apply(value,from);setMessage(`${value} BPMを設定しました。「拍の位置」で開始位置も合わせてください。`);}
 async function analyze(input:Blob){
  controller.current?.abort();const task=new AbortController();controller.current=task;pause();setBusy(true);setResult(null);setMessage('音声を準備中…');
  try{const value=await analyzeFile(input,task.signal,m=>{if(active.current&&!task.signal.aborted)setMessage(m);});if(!task.signal.aborted&&active.current){setResult(value);setMessage(value.status==='consistent'?'複数区間で一致。聴いて候補を採用してください。':'候補が分かれています。倍・半分の違いも確認してください。');}}
  catch(error){if(!task.signal.aborted&&active.current)setMessage(error instanceof Error?error.message:'解析できませんでした。');}
  finally{if(active.current&&controller.current===task)setBusy(false);}
 }
 async function importSongs(file:File){try{if(file.size>5*1024*1024)throw new Error('XMLは5MB以内で書き出してください。');const {parseRekordbox}=await import('@/lib/song-library');const items=parseRekordbox(await file.text());if(!active.current)return;setSongs(items);setSong(null);try{localStorage.setItem('wotagei:songs',JSON.stringify(items));setMessage(`${items.length}曲をこの端末に保存しました。曲名で選べます。`);}catch{setMessage(`${items.length}曲を読み込みました。端末への保存はできませんでした。`);}}catch(error){if(active.current)setMessage(error instanceof Error?error.message:'XMLを読み込めませんでした。');}}
 if(live)return <div className="tempo-config"><h2>インカメはお手本に合わせて踊る</h2><p>ライブ映像は倍速にできません。録画した動画ならBPM解析・同期ができます。</p></div>;
 return <div className="tempo-config">
  <div className="tempo-summary"><strong>{kind==='unset'?'BPM 未設定':`${bpm} BPM`}</strong><span>{bpmLabels[kind]}</span>{kind!=='unset'&&<><button className="button mini" disabled={bpm<80} onClick={()=>adopt(bpm/2,'manual')} aria-label="設定BPMを半分にする">½</button><button className="button mini" disabled={bpm>150} onClick={()=>adopt(bpm*2,'manual')} aria-label="設定BPMを2倍にする">×2</button></>}</div>
  <Tabs value={mode} onValueChange={v=>{if(tapRecording)finishTap();setMode(String(v));setMessage('');}} className="tempo-methods">
   <TabsList aria-label="BPMを決める方法"><TabsTrigger value="tap">拍タップ</TabsTrigger><TabsTrigger value="auto">自動解析</TabsTrigger><TabsTrigger value="songs">曲</TabsTrigger><TabsTrigger value="manual">手入力</TabsTrigger></TabsList>
   <TabsContent value="tap" className="tempo-body"><BeatTap recording={tapRecording} count={tapCount} grid={tapGrid} begin={beginTap} finish={finishTap} tap={tap} disabled={!file&&!remote}/></TabsContent>
   <TabsContent value="auto" className="tempo-body">{remote&&<p className="config-hint">YouTubeの音は直接解析できません。曲名で検索するか、同じテンポの音源ファイルを選んでください。</p>}
    <div className="tempo-actions"><button className="button primary" disabled={!file||busy} onClick={()=>file&&void analyze(file)}>{busy?'解析中…':'動画の音を解析'}</button><label className="button file-button">音源を選ぶ<input type="file" accept="audio/*,.mp3,.m4a,.wav" aria-label="BPM解析用の音源を選ぶ" disabled={busy||(!file&&!remote)} onChange={e=>{const f=e.target.files?.[0];if(f)void analyze(f);e.target.value='';}}/></label>{busy&&<button className="button" onClick={()=>{controller.current?.abort();setMessage('解析を中止しました。');setBusy(false);}}>中止</button>}</div>
    {result?<div className="bpm-candidates" aria-label="解析BPMの候補">{result.candidates.map(c=><button className="button" key={c.bpm} onClick={()=>adopt(c.bpm,'analysis')}><strong>{c.bpm}</strong><span>採用 · {c.support}/{c.total}区間</span></button>)}</div>:<p className="config-hint">動画と同じテンポの音を解析します。音を読めない場合は音源を選択。8秒以上・80MB以内。</p>}
   </TabsContent>
   <TabsContent value="manual" className="tempo-body">
    <div className="manual-tempo"><label className="numeric"><span>この動画のBPM</span><input type="number" inputMode="decimal" min={40} max={300} step={.001} placeholder="例：150" value={text} onChange={e=>setText(e.target.value)} aria-label="この動画のBPM"/></label><button className="button" disabled={!valid||(!file&&!remote)} onClick={()=>adopt(Number(text),'manual')}>設定</button></div>
    <p className="config-hint">手入力ではBPMだけを設定します。拍の位置もまとめて合わせる場合は「拍タップ」を使ってください。</p>
   </TabsContent>
   <TabsContent value="songs" className="tempo-body"><OnlineMusic disabled={!file&&!remote} onChoose={song=>{if(song.bpm===null)return;adopt(song.bpm,'library');const item={id:`${song.provider}:${song.id}`,name:song.title,artist:song.artist,bpm:song.bpm,variable:false};setSongs(old=>{const next=[item,...old.filter(s=>s.id!==item.id)].slice(0,5000);try{localStorage.setItem('wotagei:songs',JSON.stringify(next));}catch{}return next;});}}/>
    <Combobox items={songs} value={song} onValueChange={v=>{setSong(v);setMessage('');}} itemToStringLabel={s=>`${s.name} ${s.artist} · ${s.bpm} BPM`} isItemEqualToValue={(a,b)=>a.id===b.id}>
     <ComboboxInput placeholder={songs.length?'曲名・アーティストで検索':'保存した曲・XMLの曲を選ぶ'} aria-label="取り込んだ曲を検索" disabled={!songs.length}/><ComboboxContent><ComboboxEmpty>一致する曲はありません</ComboboxEmpty><ComboboxList>{(s:Song)=><ComboboxItem key={s.id} value={s}>{s.name} · {s.artist} · {s.bpm} BPM{s.variable?'（変動あり）':''}</ComboboxItem>}</ComboboxList></ComboboxContent>
    </Combobox>
    <div className="tempo-actions"><label className="button file-button">rekordbox XML<input type="file" accept=".xml,text/xml,application/xml" aria-label="rekordboxの曲ライブラリを取り込む" onChange={e=>{const f=e.target.files?.[0];if(f)void importSongs(f);e.target.value='';}}/></label><button className="button primary" disabled={!song||song.variable||(!file&&!remote)} onClick={()=>song&&adopt(song.bpm,'library')}>{song?`${song.bpm} BPMを使う`:'曲を選択'}</button></div>
    <p className="config-hint">{song?.variable?'テンポが変わる曲です。練習区間のBPMを手入力してください。':'PCのrekordboxで解析→コレクションをXML形式で書き出す→ここで読込。動画も原曲の速さか確認。'}</p>
   </TabsContent>
  </Tabs>
  {message&&<p className="tempo-message" role="status">{message}</p>}
 </div>;
}
