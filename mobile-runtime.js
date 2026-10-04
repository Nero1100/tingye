// Shared, pinned browser inference runtime. No personal data leaves the device.
import {ModelStore} from './model-download.js?v=2026.10.04.07';
const RUNTIME_URL='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/ort-wasm-simd-threaded.jsep.wasm';
export async function prepareRuntime(progress=()=>{}){
 const cache=await caches.open('tingye-translation-runtime-v1');
 // Prepare the small JS loaders too, without importing or initializing a model.
 // A first inference after downloading must also work without a connection.
 for(const file of ['transformers.min.js','ort.bundle.min.mjs','ort-wasm-simd-threaded.jsep.mjs']){
  const url=new URL('./vendor/translation/'+file,import.meta.url).href;
  if(!await cache.match(url)){const response=await fetch(url);if(!response.ok)throw Error('运行文件下载未完成。');await cache.put(url,response);}
 }
 if(!await cache.match(RUNTIME_URL)){
  progress({message:'下载本机运行文件 · 约 22 MB…'});const response=await fetch(RUNTIME_URL);if(!response.ok)throw Error('运行文件下载未完成。');
  const blob=await response.blob();await cache.put(RUNTIME_URL,new Response(blob,{headers:{'content-length':String(blob.size)}}));
 }
}
export async function preparePublicModels(cacheName,entries,progress=()=>{}){
 await new ModelStore(cacheName,progress).prepare(entries);await prepareRuntime(progress);
}
export async function configureLocalRuntime(cacheName,progress=()=>{},entries=null){
 const {pipeline,env}=await import('./vendor/translation/transformers.min.js');
 env.allowLocalModels=!!entries;env.allowRemoteModels=!entries;env.useBrowserCache=false;env.useFSCache=false;
 env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
 env.backends.onnx.wasm.wasmPaths=new URL('./vendor/translation/',import.meta.url).href;
 const url=RUNTIME_URL;
 const runtime=await caches.open('tingye-translation-runtime-v1');let response=await runtime.match(url);
 if(!response){if(entries)throw Error('运行文件尚未准备好，请先完成下载。');await prepareRuntime(progress);response=await runtime.match(url);}
 const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
 if([...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')!=='c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39')throw Error('运行文件校验失败。');
 env.backends.onnx.wasm.wasmBinary=new Uint8Array(bytes);
 env.useCustomCache=true;
 if(entries){const store=await new ModelStore(cacheName,progress).initialize();env.customCache={match:r=>store.match(r,entries),async put(){throw Error('识别阶段不允许重新下载模型。');}};}
 else{const cache=await caches.open(cacheName);env.customCache={match:r=>cache.match(r),async put(r,response){await cache.put(r,response);}};}
 return pipeline;
}
