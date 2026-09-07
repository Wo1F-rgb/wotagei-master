// Reproducible pinhole-camera experiment. These are synthetic landmarks, not real-video accuracy claims.
import {mkdir,writeFile} from 'node:fs/promises';
import {sceneMatrix,projectPoint} from '../lib/scene-calibration.ts';
import {body,wall,edges,photograph,positionAndScale,errorPixels} from './calibration-fixtures.mjs';
const cases=[{name:'上から20°',pitch:20},{name:'横から25°',yaw:25},{name:'上下18°・左右22°・回転9°',pitch:18,yaw:22,roll:9}];
const results=cases.map(c=>{const ref=photograph(body),input=photograph(body,c),settings={mode:'rectangle',points:photograph(wall,c),aspect:.65,videoAspect:4/3,strength:1},h=sceneMatrix(settings);return {case:c.name,before:errorPixels(positionAndScale(input,ref),ref),after:errorPixels(positionAndScale(input.map(p=>projectPoint(h,p)),ref),ref)};});
const camera=cases[2],ref=photograph(body),raw=photograph(body,camera),s={mode:'rectangle',points:photograph(wall,camera),aspect:.65,videoAspect:4/3,strength:1};
const jitter={...s,points:s.points.map((p,i)=>({x:p.x+(i%2?1:-1)/640,y:p.y+(i<2?1:-1)/480}))};
const jitterError=errorPixels(positionAndScale(raw.map(p=>projectPoint(sceneMatrix(jitter),p)),ref),ref);
const nonplanar=body.map((p,i)=>[p[0],p[1],i>=7?-.45:0]),nonplanarRef=photograph(nonplanar),nonplanarInput=photograph(nonplanar,camera);
const depthError=errorPixels(positionAndScale(nonplanarInput.map(p=>projectPoint(sceneMatrix(s),p)),nonplanarRef),nonplanarRef);
console.log(JSON.stringify({unit:'RMS pixels at 640x480, after position and uniform height scale',cases:results,onePixelCornerError:jitterError,arms45cmOutOfPlaneError:depthError},null,2));
const panels=[ref.map(p=>({x:p.x*640,y:p.y*480})),positionAndScale(raw,ref),positionAndScale(raw.map(p=>projectPoint(sceneMatrix(s),p)),ref)];
const skeleton=(points,color,opacity=1)=>`<g stroke="${color}" opacity="${opacity}" stroke-width="4" fill="${color}">${edges.map(([a,b])=>`<line x1="${points[a].x}" y1="${points[a].y}" x2="${points[b].x}" y2="${points[b].y}"/>`).join('')}${points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5"/>`).join('')}</g>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="380" viewBox="0 0 1080 380"><rect width="1080" height="380" fill="#0e1521"/><g font-family="Arial,sans-serif" fill="#e9f1ff"><text x="24" y="30" font-size="19">画角補正の合成実験 — 上下18°・左右22°・回転9°</text><text x="24" y="54" font-size="13">平面上の骨格。緑＝正面の基準、紫＝補正対象。実動画の測定ではありません。</text>${panels.map((points,i)=>`<g transform="translate(${i*360+20},75)"><text x="0" y="16" font-size="16">${['正面の基準','従来：位置・共通倍率のみ','壁の四隅＋位置・共通倍率'][i]}</text><g transform="translate(-15,0) scale(.56)">${skeleton(panels[0],'#cdfa69',i===0?1:.4)}${i>0?skeleton(points,'#bc9cff'):''}</g><text x="0" y="285" font-size="14">${i===0?'640×480の座標で計算':i===1?`ずれ ${results[2].before.toFixed(2)} px`:'ずれ 0.00 px（理想条件）'}</text></g>`).join('')}</g></svg>`;
await mkdir(new URL('../docs/',import.meta.url),{recursive:true});
await writeFile(new URL('../docs/calibration-experiment.svg',import.meta.url),svg);
await writeFile(new URL('../docs/calibration-results.json',import.meta.url),JSON.stringify({cases:results,onePixelCornerError:jitterError,arms45cmOutOfPlaneError:depthError},null,2)+'\n');
