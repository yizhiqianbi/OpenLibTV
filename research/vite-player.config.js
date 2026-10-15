import {defineConfig} from 'vite';
export default defineConfig({server:{host:'127.0.0.1',port:5182,strictPort:true,hmr:false,watch:{ignored:['**/public/**','**/research/**']}},optimizeDeps:{entries:['research/player-preview.html']}});
