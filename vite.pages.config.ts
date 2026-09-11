import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const path=(value:string)=>fileURLToPath(new URL(value,import.meta.url));
export default defineConfig({
 root:path('./static/'),base:'./',publicDir:path('./public/'),
 plugins:[react(),{name:'beat-runtime-assets',generateBundle(){
  // The single-thread WASM build also runs without cross-origin isolation on Pages.
  for(const name of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])this.emitFile({type:'asset',fileName:`beat-runtime/1.29.0/${name}`,source:readFileSync(path(`./node_modules/onnxruntime-web/dist/${name}`))});
  this.emitFile({type:'asset',fileName:'beat-runtime/1.29.0/LICENSE',source:readFileSync(path('./public/beat/ONNXRUNTIME-LICENSE'))});
 }}],css:{postcss:{plugins:[tailwindcss()]}},
 resolve:{alias:{'@':path('./')}},
 define:{'import.meta.env.VITE_STATIC_SITE':JSON.stringify('true')},
 build:{outDir:path('./dist-pages/'),emptyOutDir:true},
});
