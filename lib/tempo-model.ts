export type BpmKind='unset'|'manual'|'tap'|'analysis'|'library';
export const bpmLabels:Record<BpmKind,string>={unset:'未設定',manual:'手入力',tap:'TAP',analysis:'解析から採用',library:'曲ライブラリ'};
export function restoreTempo(saved:unknown):{bpm:number;kind:BpmKind}{
 const value=saved as {bpm?:unknown;kind?:unknown}|null;
 const bpm=Number(value?.bpm),kind=value?.kind;
 if(!Number.isFinite(bpm)||bpm<40||bpm>300)return {bpm:120,kind:'unset'};
 // Old versions saved a placeholder 120 without provenance. Require explicit confirmation.
 return {bpm,kind:typeof kind==='string'&&['manual','tap','analysis','library'].includes(kind)?kind as BpmKind:'unset'};
}
