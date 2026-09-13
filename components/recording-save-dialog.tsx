'use client';
import {Download,ImagePlus,Share2} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import type {useRecordingSave} from '@/lib/use-recording-save';

export function RecordingSaveDialog({save}:{save:ReturnType<typeof useRecordingSave>}){
 const video=save.recording;if(!video)return null;
 return <Dialog open={save.open} onOpenChange={value=>{if(!value)save.close();}}><DialogContent className="practice-dialog recording-save-dialog">
  <DialogTitle>録画を保存</DialogTitle>
  <DialogDescription>{save.shareable?(save.photos?'共有メニューの「ビデオを保存」で写真に追加。':'共有メニューで保存先を選択。'):'このブラウザは写真への保存に未対応です。動画ファイルとして保存できます。'}</DialogDescription>
  <video className="recording-save-preview" src={video.url} controls playsInline preload="metadata" aria-label="録画した動画の確認"/>
  {save.shareable?<><button className="button primary wide" disabled={save.busy} onClick={()=>void save.save()}>{save.photos?<ImagePlus size={18}/>:<Share2 size={18}/>} {save.busy?'保存メニューを開いています…':save.photos?'写真に保存':'保存先を選ぶ'}</button><details className="recording-save-fallback"><summary>別の保存方法</summary><a className="button wide" href={video.url} download={video.name}><Download size={17}/>ファイルに保存</a></details></>:<a className="button primary wide" href={video.url} download={video.name}><Download size={17}/>ファイルに保存</a>}
  {save.error&&<p className="warning" role="status">{save.error}</p>}
  <button className="button wide" onClick={save.close}>練習に戻る</button>
 </DialogContent></Dialog>;
}
