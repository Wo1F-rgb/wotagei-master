export type Point={x:number;y:number;visibility?:number};
export type Size={width:number;height:number};
export type Perspective={perspectiveX?:number;perspectiveY?:number};
export type PoseAlignment=Perspective&{x:number;y:number;scale:number;rotation:number};
/** Dimensionless projective coefficients, bounded away from a vanishing horizon. */
function perspectiveValues(a:Perspective){const safe=(n:number|undefined)=>Number.isFinite(n)?Math.max(-.3,Math.min(.3,n!)):0;return {px:safe(a.perspectiveX),py:safe(a.perspectiveY)};}
export function perspectivePose(points:Point[],alignment:Perspective,stage:Size):Point[]{
 const {px,py}=perspectiveValues(alignment),cx=stage.width/2,cy=stage.height/2;
 if(cx<=0||cy<=0)return points.map(p=>({...p}));
 return points.map(p=>{const x=p.x-cx,y=p.y-cy,w=1+px*x/cx+py*y/cy;return {...p,x:cx+x/w,y:cy+y/w};});
}
/** CSS column-major homogeneous matrix; mirror is applied first, then perspective. */
export function perspectiveMatrix(alignment:Perspective,stage:Size,mirror=false):number[]{
 const {px,py}=perspectiveValues(alignment),sign=mirror?-1:1;
 return [sign,0,0,stage.width>0?sign*2*px/stage.width:0, 0,1,0,stage.height>0?2*py/stage.height:0, 0,0,1,0, 0,0,0,1];
}
export function alignmentCss(alignment:PoseAlignment,stage:Size,mirror=false):string{
 return `translate(${alignment.x}%,${alignment.y}%) rotate(${alignment.rotation}deg) scale(${alignment.scale}) matrix3d(${perspectiveMatrix(alignment,stage,mirror).join(',')})`;
}
export const poseEdges=[[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
export function displayPose(points:Point[],video:Size,stage:Size,mirror:boolean):Point[]{
 const scale=Math.min(stage.width/video.width,stage.height/video.height),width=video.width*scale,height=video.height*scale;
 return points.map(p=>({x:(stage.width-width)/2+(mirror?1-p.x:p.x)*width,y:(stage.height-height)/2+p.y*height,visibility:p.visibility}));
}
const midpoint=(a:Point,b:Point)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
function torso(points:Point[]){
 if([11,12,23,24].some(i=>!points[i]||(points[i].visibility??0)<.65))throw new Error('肩と腰を検出できません。2人とも正面向きで、上半身が隠れない場面を選んでください。');
 const top=midpoint(points[11],points[12]),hip=midpoint(points[23],points[24]);
 const height=Math.hypot(top.x-hip.x,top.y-hip.y),width=Math.hypot(points[11].x-points[12].x,points[11].y-points[12].y);
 if(height<8||width<8)throw new Error('人物が小さすぎます。全身が大きく映った場面を選んでください。');
 return {hip,angle:Math.atan2(top.y-hip.y,top.x-hip.x),size:Math.hypot(height,width*.5)};
}
/** Similarity transform only: never bend limbs to hide differences in form. */
export function alignPoses(reference:Point[],self:Point[],stage:Size):PoseAlignment{
 const r=torso(reference),s=torso(self),scale=r.size/s.size;
 const angle=Math.atan2(Math.sin(r.angle-s.angle),Math.cos(r.angle-s.angle));
 if(scale<.25||scale>4||Math.abs(angle)>Math.PI/3)throw new Error('位置の差が大きすぎます。似た向きの場面を選んでから合わせてください。');
 const cx=stage.width/2,cy=stage.height/2,dx=s.hip.x-cx,dy=s.hip.y-cy;
 const x=r.hip.x-cx-scale*(dx*Math.cos(angle)-dy*Math.sin(angle));
 const y=r.hip.y-cy-scale*(dx*Math.sin(angle)+dy*Math.cos(angle));
 return {x:x/stage.width*100,y:y/stage.height*100,scale,rotation:angle*180/Math.PI};
}
export function transformPose(points:Point[],alignment:PoseAlignment,stage:Size):Point[]{const angle=alignment.rotation*Math.PI/180,cx=stage.width/2,cy=stage.height/2;return perspectivePose(points,alignment,stage).map(p=>{const x=p.x-cx,y=p.y-cy;return {...p,x:cx+alignment.x*stage.width/100+alignment.scale*(x*Math.cos(angle)-y*Math.sin(angle)),y:cy+alignment.y*stage.height/100+alignment.scale*(x*Math.sin(angle)+y*Math.cos(angle))};});}
export function jointAngle(points:Point[],a:number,b:number,c:number):number|null{if([a,b,c].some(i=>!points[i]||(points[i].visibility??0)<.65))return null;const p=points[a],q=points[b],r=points[c],u=[p.x-q.x,p.y-q.y],v=[r.x-q.x,r.y-q.y],length=Math.hypot(...u)*Math.hypot(...v);if(length<1)return null;return Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/length)))*180/Math.PI;}
