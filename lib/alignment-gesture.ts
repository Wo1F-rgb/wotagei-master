import type {PoseAlignment,Size} from './pose-geometry';
export type TouchPoint={x:number;y:number};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const midpoint=(p:TouchPoint[])=>p.length>1?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2}:p[0];
/** Apply a screen-space pan/zoom, keeping the point under the fingers stationary. */
export function gestureAlignment<T extends PoseAlignment>(start:T,before:TouchPoint[],after:TouchPoint[],stage:Size):T{
 if(stage.width<=0||stage.height<=0||!before.length||before.length!==after.length||[...before,...after].some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return start;
 const a=midpoint(before),b=midpoint(after),distance=(p:TouchPoint[])=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
 const ratio=before.length>=2&&distance(before)>8?distance(after)/distance(before):1;
 const scale=clamp(start.scale*ratio,.25,4),k=scale/start.scale;
 return {...start,scale,x:clamp((b.x-stage.width/2+k*(start.x*stage.width/100-(a.x-stage.width/2)))/stage.width*100,-100,100),y:clamp((b.y-stage.height/2+k*(start.y*stage.height/100-(a.y-stage.height/2)))/stage.height*100,-100,100)};
}
export function zoomAlignment<T extends PoseAlignment>(start:T,point:TouchPoint,factor:number,stage:Size):T{
 if(!Number.isFinite(factor)||factor<=0)return start;
 return gestureAlignment(start,[{x:point.x-10,y:point.y},{x:point.x+10,y:point.y}],[{x:point.x-10*factor,y:point.y},{x:point.x+10*factor,y:point.y}],stage);
}
