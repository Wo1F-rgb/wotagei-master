'use client';
import {beatAt} from '@/lib/rhythm';
type Props={time:number;origin:number;bpm:number;playing:boolean;disabled:boolean;toggle:()=>void};
export function BeatPreview({time,origin,bpm,playing,disabled,toggle}:Props){
 const position=(time-origin)*bpm/60,first=Math.floor(position)-3,x=(beat:number)=>120+(beat-position)*30,current=beatAt(time,origin,bpm);
 return <div className="beat-check">
  <svg viewBox="0 0 240 38" role="img" aria-label={`白線が設定した拍、赤線が再生位置。${current.phrase>0?`${current.beat}拍目`:'最初の1の前'}`}>
   <path d="M0 30H240" stroke="#61718b"/>{!disabled&&Array.from({length:9},(_,i)=>first+i).filter(n=>n>=0).map(n=><g key={n}><line x1={x(n)} x2={x(n)} y1="3" y2="32" stroke="white" strokeWidth={n%8===0?2:1} opacity={n%8===0?1:.65}/><text x={x(n)+3} y="15" fill="white" fontSize="11">{n%8+1}</text></g>)}<path d="M120 0V38" stroke="#ff6f87" strokeWidth="2"/>
  </svg>
  <button className="button" disabled={disabled} onClick={toggle}>{playing?'確認を止める':'拍音で確認'}</button>
  <small>白線で拍音・「1」は高い音。確認後「保存して戻る」。</small>
 </div>;
}
