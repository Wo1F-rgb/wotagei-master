import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
const path=(value:string)=>fileURLToPath(new URL(value,import.meta.url));
export default defineConfig({
 root:path('./static/'),base:'./',publicDir:path('./public/'),
 plugins:[react()],css:{postcss:{plugins:[tailwindcss()]}},
 resolve:{alias:{'@':path('./')}},
 define:{'import.meta.env.VITE_STATIC_SITE':JSON.stringify('true')},
 build:{outDir:path('./dist-pages/'),emptyOutDir:true},
});
