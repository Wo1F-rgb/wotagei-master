'use client';
import {useState,type ReactNode} from 'react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Slider} from '@/components/ui/slider';
import type {Alignment} from '@/lib/use-studio';

const cameraFields=[
 {key:'perspectiveY',label:'上下の遠近',minus:'上を小さく',plus:'上を大きく'},
 {key:'perspectiveX',label:'左右の遠近',minus:'左を小さく',plus:'左を大きく'},
] as const;
const positionFields=[
 {key:'opacity',label:'自分の濃さ',min:.1,max:1,step:.05,unit:'%'},
 {key:'scale',label:'倍率',min:.25,max:4,step:.05,unit:'×'},
 {key:'x',label:'左右',min:-100,max:100,step:1,unit:'%'},
 {key:'y',label:'上下',min:-100,max:100,step:1,unit:'%'},
 {key:'rotation',label:'画面内の傾き',min:-60,max:60,step:1,unit:'°'},
] as const;
type Props={background:ReactNode;alignment:Alignment;change:(key:keyof Alignment,value:number)=>void;auto:()=>void;busy:boolean;disabled:boolean;close:()=>void;reset:()=>void;form:ReactNode};
export function AlignmentEditor({background,alignment:a,change,auto,busy,disabled,close,reset,form}:Props){
 const [tab,setTab]=useState('position');
 return <section className="alignment-editor" aria-label="重ね合わせ調整">
  <header><strong>重ね合わせ調整</strong><button className="button mini" onClick={close}>完了</button></header>
  <Tabs value={tab} onValueChange={v=>setTab(String(v))}>
   <TabsList aria-label="位置合わせの項目"><TabsTrigger value="position">位置・濃さ</TabsTrigger><TabsTrigger value="background">背景</TabsTrigger><TabsTrigger value="camera">遠近</TabsTrigger><TabsTrigger value="form">フォーム差</TabsTrigger></TabsList>
   <TabsContent value="background" className="alignment-editor-body">{background}</TabsContent>
   <TabsContent value="camera" className="alignment-editor-body">
    <p>壁・窓を基準にする画角補正は、各動画の「設定 → 画角」で試せます。ここでは残った遠近差を手動で調整します。</p>
    {cameraFields.map(f=><div className="perspective-control" key={f.key}>
     <div><label id={`label-${f.key}`}>{f.label}</label><span>{Math.round(a[f.key]*100)>0?'+':''}{Math.round(a[f.key]*100)}</span><button onClick={()=>change(f.key,0)} aria-label={`${f.label}をゼロに戻す`} disabled={busy}>0に戻す</button></div>
     <Slider aria-labelledby={`label-${f.key}`} value={[a[f.key]]} min={-.3} max={.3} step={.01} disabled={busy} onValueChange={v=>change(f.key,Array.isArray(v)?v[0]:v)}/>
     <small><span>← {f.minus}</span><span>{f.plus} →</span></small>
    </div>)}
   </TabsContent>
   <TabsContent value="position" className="alignment-editor-body alignment-controls"><p>最初の仁王立ちで止めて実行。頭・腰・両足で位置と大きさだけを合わせ、足の開きや体の傾きには合わせ込みません。</p>
    {positionFields.map(f=><div key={f.key}><label>{f.label}<span>{f.key==='opacity'?Math.round(a[f.key]*100):a[f.key]}{f.unit}</span></label><Slider aria-label={f.label} value={[a[f.key]]} min={f.min} max={f.max} step={f.step} disabled={busy} onValueChange={v=>change(f.key,Array.isArray(v)?v[0]:v)}/></div>)}
    <button className="button" onClick={reset} disabled={busy}>遠近・位置をすべてリセット</button>
   </TabsContent>
   <TabsContent value="form" className="alignment-editor-body">{form}<p>遠近の数値は撮影角度ではなく、見た目を近づける強さです。隠れた手足は復元できません。</p><p>表示は画角補正後、重ねる位置・倍率・手動遠近を適用する前の2D角度差です。残る撮影角度の影響も含むため、フォームの正誤の判定には使いません。</p></TabsContent>
  </Tabs>
  <footer><button className="button primary wide" disabled={busy||disabled} onClick={auto}>{busy?'骨格を読み取り中…':'仁王立ちで位置・大きさを合わせる'}</button></footer>
 </section>;
}
