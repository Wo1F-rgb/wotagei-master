import {readFile,readdir,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../dist-pages/',import.meta.url),html=await readFile(new URL('index.html',root),'utf8');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
 const path=match[1];assert.ok(!path.startsWith('/'),`Root-absolute asset fails at a GitHub project path: ${path}`);assert.ok((await stat(new URL(path,root))).isFile());
}
const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root),'utf8'));assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
assert.ok((await stat(new URL('pose/pose_landmarker_lite.task',root))).size>1000000);
assert.ok((await stat(new URL('pose/selfie_segmenter.tflite',root))).size>200000);
assert.ok((await stat(new URL('pose/wasm/vision_wasm_internal.wasm',root))).size>1000000);
const poseWorkers=(await readdir(new URL('assets/',root))).filter(n=>/^pose\.worker-.*\.js$/.test(n));assert.equal(poseWorkers.length,1,'Sequence pose worker must be included in the static build');
for(const file of await readdir(new URL('assets/',root))){if(!file.endsWith('.js'))continue;const text=await readFile(new URL('assets/'+file,root),'utf8');assert.ok(!text.includes('/api/music?'),'Static app must not call an app server');assert.ok(!text.includes('appgprj_'),'Private hosting metadata must not ship');}
console.log('Static entry, project-relative assets, pose model, and no app server dependency verified.');
