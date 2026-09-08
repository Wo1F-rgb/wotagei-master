'use client';
import type {BeatGrid} from '@/lib/beat-grid';
type Props={recording:boolean;count:number;grid:BeatGrid|null;begin:()=>void;finish:()=>void;tap:()=>void;disabled:boolean};
export function BeatTap({recording,count,grid,begin,finish,tap,disabled}:Props){
 const next=grid?(Math.max(0,grid.points[grid.points.length-1].beat+1)%8)+1:(count%8)+1;
 const min=grid?Math.min(grid.origin,grid.points[0].time)-grid.period*.3:0,max=grid?Math.max(...grid.points.map(p=>Math.max(p.time,p.snapped)))+grid.period*.3:1;
 const x=(t:number)=>12+(t-min)/(max-min)*276;
 const last=grid?Math.max(...grid.points.map(p=>p.beat)):0;
 return <div className="beat-tap">
  
  <div className="beat-tap-actions"><button className="button" disabled={disabled} onClick={recording?finish:begin}>{recording?'ここまでで終わる':count?'再生してやり直す':'再生して拍を記録'}</button><button className="beat-tap-target" disabled={!recording} onPointerDown={e=>{if(e.button===0){e.preventDefault();tap();}}} onClick={e=>{if(e.detail===0)tap();}} aria-label={`次の${next}拍目をタップ`}><strong>{next}</strong><span>動画の拍でタップ · {count}回</span></button></div>
  {grid?<><svg className="beat-grid-preview" viewBox="0 0 300 48" role="img" aria-label="上の点はタップ時刻、白線と下の点は等間隔に補正した拍です"><path d="M12 13H288M12 37H288" stroke="#53647c"/>{Array.from({length:Math.min(129,last+1)},(_,i)=><line key={i} x1={x(grid.origin+i*grid.period)} x2={x(grid.origin+i*grid.period)} y1="4" y2="44" stroke="white" opacity={i%8===0?.85:.3}/>)}{grid.points.map((p,i)=><g key={i}><line x1={x(p.time)} y1="13" x2={x(p.snapped)} y2="37" stroke={p.used?'#cdfa69':'#ff9c84'} opacity=".4"/><circle cx={x(p.time)} cy="13" r="2.4" fill={p.used?'#cdfa69':'#ff9c84'}/>{p.used&&<circle cx={x(p.snapped)} cy="37" r="2" fill="#fff"/>}</g>)}</svg><p className="tap-result" role="status">白線の「1」{grid.origin.toFixed(3)}秒<br/>{grid.provisional?'暫定':'平滑化済み'} · {grid.used}/{grid.count}回を使用{grid.missed>0?` · ${grid.missed}拍の抜けを推定`:''}</p></>:<p className="config-hint" role="status">{count<2?`${count}回記録。2回から暫定結果が出ます。`:'間隔をまだ安定して推定できません。毎拍のタップを続けるか、やり直してください。'}</p>}
  {grid&&grid.count<count&&<p className="config-hint" role="status">最新のタップでは推定が安定しなかったため、{grid.count}回目までの有効な結果を保持しています。</p>}<details className="beat-tap-help"><summary>使い方・補正の内訳</summary><p className="config-hint">動画を再生し、1、2、3…の毎拍でタップ。最初のタップを「1」として、すべての拍の位置とBPMを一緒に平滑化します。</p>{grid&&<p className="config-hint">タップのばらつき：{Math.round(grid.errorMs)}ms。上の点は実際のタップ、白線と下の点は等間隔に補正した拍。オレンジは計算から除外したタップです。</p>}<p className="config-hint">64回は不要です。2回以上の有効な結果はこの画面に保持します。「拍音で確認」で聴いてから「保存して戻る」を押してください。4〜16回ほどあると安定しやすくなります。全タップが一律に遅れた場合は「拍の位置」やトラックで調整してください。</p></details>
 </div>;
}
