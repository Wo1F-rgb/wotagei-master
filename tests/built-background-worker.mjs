// Exercise the actual emitted classic worker with an in-memory 2D surface.
// This verifies chroma processing/message ownership, not real-model inference or browser support.
import {readdir,readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const folder=new URL('../dist-pages/assets/',import.meta.url),files=(await readdir(folder)).filter(n=>/^background\.worker-.*\.js$/.test(n));assert.equal(files.length,1);
class Surface{
 constructor(width,height){this.width=width;this.height=height;this.pixels=new Uint8ClampedArray(width*height*4);}
 getContext(){const that=this;return {clearRect(){that.pixels.fill(0);},drawImage(frame){if(frame.broken)throw Error('decode');that.pixels=new Uint8ClampedArray(frame.pixels);},getImageData(){return {data:that.pixels};},putImageData(image){that.pixels=image.data;}};}
 transferToImageBitmap(){return {width:this.width,height:this.height,pixels:this.pixels};}
}
const messages=[],context={self:{postMessage(value,options){messages.push({value,options});}},OffscreenCanvas:Surface,console,setTimeout,clearTimeout,TextDecoder,TextEncoder,URL,performance};
vm.runInNewContext(await readFile(new URL(files[0],folder),'utf8'),context,{timeout:10000});
await context.self.onmessage({data:{type:'init',mode:'green'}});assert.equal(messages.at(-1).value.type,'ready');
let closed=0;const frame={width:2,height:1,pixels:[0,255,0,255,190,130,100,255],close(){closed++;}};
await context.self.onmessage({data:{type:'frame',frame,epoch:7,mediaTime:4.2,timestamp:10,threshold:.5}});
const {value,options}=messages.at(-1);assert.equal(value.type,'frame');assert.equal(value.epoch,7);assert.equal(value.mediaTime,4.2);assert.equal(value.bitmap.pixels[3],0);assert.equal(value.bitmap.pixels[7],255);assert.equal(options.transfer[0],value.bitmap);assert.equal(closed,1);
await context.self.onmessage({data:{type:'frame',frame:{...frame,broken:true},epoch:8,threshold:.5}});assert.equal(messages.at(-1).value.type,'error');assert.equal(closed,2);
console.log('Built background worker: chroma alpha, transferred bitmap, frame epoch and error cleanup verified. AI inference requires device verification.');
