export type BeatFrameGrid = Readonly<{duration:number;bpm:number;origin:number;step:number;count:number}>;

/** Source seconds only: practice playback speed never changes this grid. */
export function createBeatFrameGrid({duration,bpm,origin}:{duration:number;bpm:number;origin:number}):BeatFrameGrid {
 if(!Number.isFinite(duration)||duration<=0)throw new Error('動画の長さを確認できません。');
 if(!Number.isFinite(bpm)||bpm<=0)throw new Error('BPMは0より大きい数を指定してください。');
 if(!Number.isFinite(origin)||origin<0||origin>=duration)throw new Error('最初の拍を動画の範囲内に設定してください。');
 const step=60/bpm;
 let count=Math.ceil((duration-origin)/step);
 if(!Number.isFinite(step)||step<=0||!Number.isSafeInteger(count)||count<1)throw new Error('拍数が大きすぎます。BPMと動画の長さを確認してください。');
 // Correct division rounding using exactly the same expression as frameTime.
 if(origin+(count-1)*step>=duration)count--;
 else if(origin+count*step<duration)count++;
 if(!Number.isSafeInteger(count)||count<1||origin+(count-1)*step>=duration)throw new Error('拍の位置を計算できません。');
 return Object.freeze({duration,bpm,origin,step,count});
}

export function beatFrameTime(grid:BeatFrameGrid,index:number):number {
 if(!Number.isInteger(index)||index<0||index>=grid.count)throw new RangeError('拍番号が動画の範囲外です。');
 return grid.origin+index*grid.step;
}

/** Nearest beat, clamped to the available images (zero-based). */
export function beatFrameIndexAtTime(grid:BeatFrameGrid,time:number):number {
 if(!Number.isFinite(time))throw new RangeError('動画の時刻が正しくありません。');
 return Math.max(0,Math.min(grid.count-1,Math.round((time-grid.origin)/grid.step)));
}

export function beatFrameFilename(index:number,time:number,prefix='beat'):string {
 if(!Number.isSafeInteger(index)||index<0||!Number.isFinite(time)||time<0)throw new RangeError('画像の番号または時刻が正しくありません。');
 const safe=prefix.normalize('NFKC').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60)||'beat';
 return `${safe}-${String(index+1).padStart(6,'0')}-${String(Math.round(time*1000)).padStart(9,'0')}ms.jpg`;
}
