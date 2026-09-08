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
function standing(points:Point[],stage:Size){
 const ids=[0,23,24,27,28];
 if(ids.some(i=>!points[i]||(points[i].visibility??0)<.7||!Number.isFinite(points[i].x)||!Number.isFinite(points[i].y)))throw new Error('頭・腰・両足を検出できません。頭から足まで映る仁王立ちの場面を選んでください。');
 const head=points[0],hip=midpoint(points[23],points[24]),feet=midpoint(points[27],points[28]);
 const height=feet.y-head.y;
 if(height<Math.max(40,stage.height*.15)||hip.y<=head.y||hip.y>=feet.y)throw new Error('全身の大きさを確認できません。立っている場面を選んでください。');
 const hipRatio=(hip.y-head.y)/height;
 if(Math.abs(head.x-hip.x)>height*.16||Math.abs(hip.x-feet.x)>height*.16||Math.abs(points[27].y-points[28].y)>height*.14||hipRatio<.3||hipRatio>.72)throw new Error('体の曲がりや片足の浮きを検出しました。最初の仁王立ちで実行してください。画面の傾きは「位置・濃さ」で手動調整できます。');
 return {head,hip,feet,height,hipRatio};
}
/** Fit ONLY translation and uniform height scale. Stance/shoulder width never sets camera rotation. */
function alignStandingPoses(reference:Point[],self:Point[],stage:Size,rotation=0):PoseAlignment{
 if(!Number.isFinite(rotation)||Math.abs(rotation)>60)throw new Error('画面の傾きを確認してください。');
 const rotated=transformPose(self,{x:0,y:0,scale:1,rotation},stage);
 const r=standing(reference,stage),s=standing(rotated,stage),scale=r.height/s.height;
 if(Math.abs(r.hipRatio-s.hipRatio)>.14)throw new Error('2人の立ち姿勢が異なります。腰を曲げず、同じ仁王立ちの場面で合わせてください。');
 if(scale<.5||scale>2)throw new Error('全身の大きさが2倍以上違うため、自動補正を見送りました。「位置・濃さ」で手動調整してください。');
 const cx=stage.width/2,cy=stage.height/2;
 return {x:(r.feet.x-cx-scale*(s.feet.x-cx))/stage.width*100,y:(r.feet.y-cy-scale*(s.feet.y-cy))/stage.height*100,scale,rotation};
}
export type PoseFit={alignment:PoseAlignment;approximate:boolean;limited:boolean};
/** Prefer the stable standing fit; otherwise use visible torso/leg lengths and a shared body anchor.
 * Joint bends may change freely. Neither branch estimates camera rotation or perspective from posture.
 */
export function fitPoses(reference:Point[],self:Point[],stage:Size,rotation=0):PoseFit{
 if(!Number.isFinite(stage.width)||!Number.isFinite(stage.height)||stage.width<=0||stage.height<=0)throw new Error('映像の表示が整ってから、もう一度合わせてください。');
 if(!Number.isFinite(rotation)||Math.abs(rotation)>60)throw new Error('画面の傾きを確認してください。');
 try{return {alignment:alignStandingPoses(reference,self,stage,rotation),approximate:false,limited:false};}catch{}
 const rotated=transformPose(self,{x:0,y:0,scale:1,rotation},stage);
 const visible=(points:Point[],i:number)=>!!points[i]&&(points[i].visibility??0)>=.5&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y);
 const common=(ids:number[])=>ids.every(i=>visible(reference,i)&&visible(rotated,i));
 const anchor=common([23,24])?[23,24]:common([11,12])?[11,12]:null;
 if(!anchor)throw new Error('肩か腰が見える場面を選んでください。検出できない場合は「位置・濃さ」で手動調整できます。');
 const minLength=Math.max(6,Math.min(stage.width,stage.height)*.025);
 const ratios:number[]=[];
 for(const [a,b] of [[11,23],[12,24],[23,25],[24,26],[25,27],[26,28]]){
  if(!common([a,b]))continue;
  const r=Math.hypot(reference[a].x-reference[b].x,reference[a].y-reference[b].y),s=Math.hypot(rotated[a].x-rotated[b].x,rotated[a].y-rotated[b].y);
  if(r>=minLength&&s>=minLength)ratios.push(Math.log(r/s));
 }
 const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};
 const center=median(ratios),inliers=ratios.filter(value=>Math.abs(value-center)<=Math.log(1.4));
 if(inliers.length<2)throw new Error('体の大きさを推定できません。肩・腰・脚が見える場面で試すか「位置・濃さ」で調整してください。');
 const rawScale=Math.exp(median(inliers)),scale=Math.max(.5,Math.min(2,rawScale));
 const r=midpoint(reference[anchor[0]],reference[anchor[1]]),s=midpoint(rotated[anchor[0]],rotated[anchor[1]]),cx=stage.width/2,cy=stage.height/2;
 const rawX=(r.x-cx-scale*(s.x-cx))/stage.width*100,rawY=(r.y-cy-scale*(s.y-cy))/stage.height*100;
 const x=Math.max(-100,Math.min(100,rawX)),y=Math.max(-100,Math.min(100,rawY));
 return {alignment:{x,y,scale,rotation},approximate:true,limited:scale!==rawScale||x!==rawX||y!==rawY};
}
export function alignPoses(reference:Point[],self:Point[],stage:Size,rotation=0):PoseAlignment{return fitPoses(reference,self,stage,rotation).alignment;}
export function transformPose(points:Point[],alignment:PoseAlignment,stage:Size):Point[]{const angle=alignment.rotation*Math.PI/180,cx=stage.width/2,cy=stage.height/2;return perspectivePose(points,alignment,stage).map(p=>{const x=p.x-cx,y=p.y-cy;return {...p,x:cx+alignment.x*stage.width/100+alignment.scale*(x*Math.cos(angle)-y*Math.sin(angle)),y:cy+alignment.y*stage.height/100+alignment.scale*(x*Math.sin(angle)+y*Math.cos(angle))};});}
export function jointAngle(points:Point[],a:number,b:number,c:number):number|null{if([a,b,c].some(i=>!points[i]||(points[i].visibility??0)<.65))return null;const p=points[a],q=points[b],r=points[c],u=[p.x-q.x,p.y-q.y],v=[r.x-q.x,r.y-q.y],length=Math.hypot(...u)*Math.hypot(...v);if(length<1)return null;return Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/length)))*180/Math.PI;}
