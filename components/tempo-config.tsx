'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty} from '@/components/ui/combobox';
import {RhythmAnalysis} from '@/components/rhythm-analysis';
import {bpmLabels,type BpmKind} from '@/lib/tempo-model';
import type {Song} from '@/lib/song-library';
import {BeatTap} from '@/components/beat-tap';
import type {BeatGrid} from '@/lib/beat-grid';
import {OnlineMusic} from '@/components/online-music';

type Props={preview?:ReactNode;mainPlaying:boolean;remote?:boolean;file:File|null;live:boolean;bpm:number;kind:BpmKind;tapRecording:boolean;tapGrid:BeatGrid|null;beginTap:()=>void;finishTap:()=>void;tapCount:number;tap:()=>void;apply:(value:number,kind:BpmKind)=>void;applyGrid:(bpm:number,origin:number)=>boolean;pause:()=>void};
export function TempoConfig({preview,mainPlaying,remote=false,file,live,bpm,kind,tapRecording,tapGrid,beginTap,finishTap,tapCount,tap,apply,applyGrid,pause}:Props){
 const [mode,setMode]=useState('tap'),[text,setText]=useState(kind==='unset'?'':String(bpm));
 const [message,setMessage]=useState('');
 const [songs,setSongs]=useState<Song[]>([]),[song,setSong]=useState<Song|null>(null);
 const active=useRef(true);
 useEffect(()=>{active.current=true;try{const stored=JSON.parse(localStorage.getItem('wotagei:songs')||'[]');if(Array.isArray(stored))setSongs(stored.filter((s:Song)=>typeof s.name==='string'&&typeof s.artist==='string'&&typeof s.id==='string'&&s.bpm>=40&&s.bpm<=300).slice(0,5000));}catch{}return()=>{active.current=false;};},[]);
 useEffect(()=>setText(kind==='unset'?'':String(bpm)),[bpm,kind]);
 useEffect(()=>setMessage(''),[file]);
 const valid=Number.isFinite(Number(text))&&Number(text)>=40&&Number(text)<=300;
 function adopt(value:number,from:BpmKind){apply(value,from);setMessage(`${value} BPMを設定しました。「拍の位置」で開始位置も合わせてください。`);}
 async function importSongs(file:File){try{if(file.size>5*1024*1024)throw new Error('XMLは5MB以内で書き出してください。');const {parseRekordbox}=await import('@/lib/song-library');const items=parseRekordbox(await file.text());if(!active.current)return;setSongs(items);setSong(null);try{localStorage.setItem('wotagei:songs',JSON.stringify(items));setMessage(`${items.length}曲をこの端末に保存しました。曲名で選べます。`);}catch{setMessage(`${items.length}曲を読み込みました。端末への保存はできませんでした。`);}}catch(error){if(active.current)setMessage(error instanceof Error?error.message:'XMLを読み込めませんでした。');}}
 if(live)return <div className="tempo-config"><h2>インカメはお手本に合わせて踊る</h2><p>ライブ映像は倍速にできません。録画した動画ならBPM解析・同期ができます。</p></div>;
 return <div className="tempo-config">
  <div className="tempo-summary"><strong>{kind==='unset'?'BPM 未設定':`${Number(bpm.toFixed(3))} BPM`}</strong><span>{bpmLabels[kind]}</span>{kind!=='unset'&&<><button className="button mini" disabled={bpm<80} onClick={()=>adopt(bpm/2,'manual')} aria-label="設定BPMを半分にする">½</button><button className="button mini" disabled={bpm>150} onClick={()=>adopt(bpm*2,'manual')} aria-label="設定BPMを2倍にする">×2</button></>}</div>
  <Tabs value={mode} onValueChange={v=>{if(tapRecording)finishTap();setMode(String(v));setMessage('');}} className="tempo-methods">
   {mode!=='auto'&&preview}<TabsList aria-label="BPMを決める方法"><TabsTrigger value="tap">拍タップ</TabsTrigger><TabsTrigger value="auto">自動解析</TabsTrigger><TabsTrigger value="songs">曲</TabsTrigger><TabsTrigger value="manual">手入力</TabsTrigger></TabsList>
   <TabsContent value="tap" className="tempo-body"><BeatTap recording={tapRecording} count={tapCount} grid={tapGrid} begin={beginTap} finish={finishTap} tap={tap} disabled={!file&&!remote}/></TabsContent>
   <TabsContent value="auto" className="tempo-body"><RhythmAnalysis mainPlaying={mainPlaying} file={file} remote={remote} pause={pause} apply={applyGrid} applyBpmOnly={v=>adopt(v,'analysis')}/></TabsContent>
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
