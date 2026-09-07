import type {Point,Size} from './pose-geometry';
export type Matrix3=[number,number,number,number,number,number,number,number,number];
export type SceneCalibration={mode:'level'|'rectangle';points:Point[];aspect:number;videoAspect:number;strength:number};
const identity=():Matrix3=>[1,0,0,0,1,0,0,0,1];
export const initialScenePoints=(mode:SceneCalibration['mode']):Point[]=>mode==='level'?[{x:.2,y:.7},{x:.8,y:.7}]:[{x:.25,y:.2},{x:.75,y:.2},{x:.75,y:.8},{x:.25,y:.8}];
export function projectPoint(h:Matrix3,p:Point):Point{const w=h[6]*p.x+h[7]*p.y+h[8];return {...p,x:(h[0]*p.x+h[1]*p.y+h[2])/w,y:(h[3]*p.x+h[4]*p.y+h[5])/w};}
function multiply(a:Matrix3,b:Matrix3):Matrix3{return Array.from({length:9},(_,i)=>{const r=Math.floor(i/3),c=i%3;return a[r*3]*b[c]+a[r*3+1]*b[c+3]+a[r*3+2]*b[c+6];}) as Matrix3;}
/** Four point, normalized-coordinate homography with pivoted elimination. */
export function homography(source:Point[],target:Point[]):Matrix3{
 const rows:number[][]=[];
 for(let i=0;i<4;i++){const {x,y}=source[i],u=target[i].x,v=target[i].y;rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}
 for(let col=0;col<8;col++){
  let pivot=col;for(let r=col+1;r<8;r++)if(Math.abs(rows[r][col])>Math.abs(rows[pivot][col]))pivot=r;
  if(Math.abs(rows[pivot][col])<1e-9)throw new Error('四隅がほぼ一直線です。大きな四角を選んでください。');
  [rows[col],rows[pivot]]=[rows[pivot],rows[col]];const d=rows[col][col];for(let c=col;c<9;c++)rows[col][c]/=d;
  for(let r=0;r<8;r++)if(r!==col){const f=rows[r][col];for(let c=col;c<9;c++)rows[r][c]-=f*rows[col][c];}
 }
 return [...rows.map(row=>row[8]),1] as Matrix3;
}
function validateMatrix(h:Matrix3){
 if(h.some(v=>!Number.isFinite(v)))throw new Error('補正値を計算できません。基準点を選び直してください。');
 const w=[0,1].flatMap(x=>[0,1].map(y=>h[6]*x+h[7]*y+h[8]));
 if(Math.min(...w)<.2||Math.max(...w)/Math.min(...w)>5)throw new Error('画面内で補正が極端になります。より正面に近い、大きな四角を選んでください。');
 for(const x of [0,.5,1])for(const y of [0,.5,1]){
  const q=projectPoint(h,{x,y});if(Math.abs(q.x-.5)>3||Math.abs(q.y-.5)>3)throw new Error('画面外への引き伸ばしが大きすぎます。基準点を選び直してください。');
  const d=h[6]*x+h[7]*y+h[8],a=(h[0]-q.x*h[6])/d,b=(h[1]-q.x*h[7])/d,c=(h[3]-q.y*h[6])/d,e=(h[4]-q.y*h[7])/d;
  const det=a*e-b*c,f=a*a+b*b+c*c+e*e;
  if(det<=.04||det>16||f/det>18)throw new Error('補正で映像が潰れる可能性があります。四隅と実物の縦横比を確認してください。');
 }
}
export function sceneMatrix(settings:SceneCalibration|null):Matrix3{
 if(!settings)return identity();
 const {points:p,videoAspect:va,aspect,strength,mode}=settings;
 if(!['level','rectangle'].includes(mode)||!Number.isFinite(va)||va<.15||va>7||!Number.isFinite(strength)||strength<0||strength>1||p.length!==(mode==='level'?2:4)||p.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)||q.x<0||q.x>1||q.y<0||q.y>1))throw new Error('基準点を動画の内側に置いてください。');
 let h:Matrix3;
 if(mode==='level'){
  const dx=(p[1].x-p[0].x)*va,dy=p[1].y-p[0].y;
  if(Math.hypot(dx,dy)<.15||dx<=0)throw new Error('水平線の左端、右端の順に、離れた2点を選んでください。');
  const angle=-Math.atan2(dy,dx);if(Math.abs(angle)>Math.PI/6)throw new Error('傾きが30度を超えています。本当に水平な線か確認してください。');
  const c=Math.cos(angle),s=Math.sin(angle);h=[c,-s/va,.5-.5*c+.5*s/va,s*va,c,.5-.5*s*va-.5*c,0,0,1];
 }else{
  if(!Number.isFinite(aspect)||aspect<.2||aspect>5)throw new Error('実物の横÷縦を0.2〜5の範囲で入力してください。');
  let area=0;for(let i=0;i<4;i++){const a=p[i],b=p[(i+1)%4],c=p[(i+2)%4];if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<.005)throw new Error('左上→右上→右下→左下の順に四隅を置いてください。');area+=a.x*b.y-b.x*a.y;}
  area/=2;if(area<.04)throw new Error('四角が小さすぎます。画面内で大きく映る四角を選んでください。');
  const cx=p.reduce((v,q)=>v+q.x,0)/4,cy=p.reduce((v,q)=>v+q.y,0)/4,ratio=aspect/va;
  const width=Math.sqrt(area*ratio),height=Math.sqrt(area/ratio);
  h=homography(p,[{x:cx-width/2,y:cy-height/2},{x:cx+width/2,y:cy-height/2},{x:cx+width/2,y:cy+height/2},{x:cx-width/2,y:cy+height/2}]);
 }
 validateMatrix(h);const unit=identity(),blended=h.map((v,i)=>unit[i]+strength*(v-unit[i])) as Matrix3;validateMatrix(blended);return blended;
}
export function restoreScene(value:unknown):SceneCalibration|null{try{const s=value as SceneCalibration;sceneMatrix(s);return s?.points?{mode:s.mode,points:s.points.map(({x,y})=>({x,y})),aspect:s.aspect,videoAspect:s.videoAspect,strength:s.strength}:null;}catch{return null;}}
/** Convert normalized video coordinates to CSS centered stage coordinates; contain letterboxing is preserved. */
export function sceneCss(settings:SceneCalibration|null,stage:Size){
 if(!settings||stage.width<=0||stage.height<=0)return '';
 const h=sceneMatrix(settings),width=Math.min(stage.width,stage.height*settings.videoAspect),height=width/settings.videoAspect;
 const c:Matrix3=[width,0,-width/2,0,height,-height/2,0,0,1],ci:Matrix3=[1/width,0,.5,0,1/height,.5,0,0,1],m=multiply(multiply(c,h),ci);
 return `matrix3d(${[m[0],m[3],0,m[6],m[1],m[4],0,m[7],0,0,1,0,m[2],m[5],0,m[8]].join(',')})`;
}
