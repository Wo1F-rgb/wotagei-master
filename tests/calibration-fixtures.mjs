export const frame={width:640,height:480};
export const wall=[[-.65,-1,0],[.65,-1,0],[.65,1,0],[-.65,1,0]];
export const body=[[0,-.84,0],[-.26,-.54,0],[.26,-.54,0],[-.2,.05,0],[.2,.05,0],[-.5,.9,0],[.5,.9,0],[-.44,-.22,0],[.44,-.22,0],[-.58,.06,0],[.58,.06,0]];
export const edges=[[0,1],[0,2],[1,2],[1,3],[2,4],[3,4],[3,5],[4,6],[1,7],[7,9],[2,8],[8,10]];
export function photograph(points,{pitch=0,yaw=0,roll=0}={}){
 const [p,y,r]=[pitch,yaw,roll].map(n=>n*Math.PI/180);
 return points.map(([x0,y0,z0])=>{
  const y1=Math.cos(p)*y0-Math.sin(p)*z0,z1=Math.sin(p)*y0+Math.cos(p)*z0;
  const x2=Math.cos(y)*x0+Math.sin(y)*z1,z2=-Math.sin(y)*x0+Math.cos(y)*z1;
  const x3=Math.cos(r)*x2-Math.sin(r)*y1,y3=Math.sin(r)*x2+Math.cos(r)*y1;
  return {x:(320+650*x3/(4+z2))/640,y:(240+650*y3/(4+z2))/480};
 });
}
// Match only position and one common scale, independently of the projective implementation.
export function positionAndScale(points,reference){
 const px=points.map(p=>({x:p.x*640,y:p.y*480})),ref=reference.map(p=>({x:p.x*640,y:p.y*480}));
 const feet=ps=>({x:(ps[5].x+ps[6].x)/2,y:(ps[5].y+ps[6].y)/2});
 const a=feet(px),b=feet(ref),scale=(b.y-ref[0].y)/(a.y-px[0].y);
 return px.map(p=>({x:b.x+scale*(p.x-a.x),y:b.y+scale*(p.y-a.y)}));
}
export function errorPixels(points,reference){return Math.sqrt(points.reduce((n,p,i)=>n+(p.x-reference[i].x*640)**2+(p.y-reference[i].y*480)**2,0)/points.length);}
