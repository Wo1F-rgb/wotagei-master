import test from 'node:test';import assert from 'node:assert/strict';
import {packedVideoLayout} from '../lib/fullscreen-layout.ts';
test('the complete pair fits tightly with no letterboxing between portrait or landscape frames',()=>{
 for(const view of [{width:390,height:644},{width:390,height:844},{width:844,height:390},{width:320,height:568}])for(const videos of [[{width:16,height:9},{width:16,height:9}],[{width:16,height:9},{width:9,height:16}],[{width:4,height:3},{width:16,height:9}]]){
  const {sizes}=packedVideoLayout(view,videos),wide=view.width>view.height;
  sizes.forEach((size,i)=>assert.ok(Math.abs(size.width/size.height-videos[i].width/videos[i].height)<1e-8));
  const w=wide?sizes[0].width+sizes[1].width:Math.max(...sizes.map(s=>s.width)),h=wide?Math.max(...sizes.map(s=>s.height)):sizes[0].height+sizes[1].height;
  assert.ok(w<=view.width+1e-8&&h<=view.height+1e-8);assert.ok(Math.abs(w-view.width)<1e-8||Math.abs(h-view.height)<1e-8);
 }
});
