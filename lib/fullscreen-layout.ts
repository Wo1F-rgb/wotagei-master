import type {Size} from './pose-geometry';
/** Fit the pair as one unit, so contain letterboxing cannot open a gap between them. */
export function packedVideoLayout(view:Size,videos:readonly Size[]){
 const aspects=[0,1].map(i=>{const v=videos[i];return v&&v.width>0&&v.height>0&&Number.isFinite(v.width/v.height)?v.width/v.height:16/9;});
 const width=Math.max(0,view.width),height=Math.max(0,view.height),landscape=width>height;
 if(landscape){const h=Math.min(height,width/(aspects[0]+aspects[1]));return {columns:`${h*aspects[0]}px ${h*aspects[1]}px`,rows:`${h}px`,sizes:aspects.map(a=>({width:a*h,height:h}))};}
 const w=Math.min(width,height/(1/aspects[0]+1/aspects[1]));return {columns:`${w}px`,rows:`${w/aspects[0]}px ${w/aspects[1]}px`,sizes:aspects.map(a=>({width:w,height:w/a}))};
}
