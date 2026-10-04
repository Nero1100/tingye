// Shared, pinned browser inference runtime. No personal data leaves the device.
export async function configureLocalRuntime(cacheName,progress=()=>{}){
 const {pipeline,env}=await import('./vendor/translation/transformers.min.js');
 env.allowLocalModels=false;env.useBrowserCache=false;env.useFSCache=false;
 env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
 env.backends.onnx.wasm.wasmPaths=new URL('./vendor/translation/',import.meta.url).href;
 const url='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/ort-wasm-simd-threaded.jsep.wasm';
 const runtime=await caches.open('tingye-translation-runtime-v1');let response=await runtime.match(url);
 if(!response){progress({message:'首次下载本机运行文件 · 约 22 MB…'});response=await fetch(url);if(!response.ok)throw Error('运行文件下载未完成。');try{await runtime.put(url,response.clone());}catch{progress({message:'运行文件暂未缓存，之后可能需要重新下载。'});}}
 const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
 if([...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')!=='c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39')throw Error('运行文件校验失败。');
 env.backends.onnx.wasm.wasmBinary=new Uint8Array(bytes);
 const cache=await caches.open(cacheName);env.useCustomCache=true;env.customCache={match:r=>cache.match(r),async put(r,response){try{await cache.put(r,response);}catch{progress({message:'模型未能缓存，之后可能需要重新下载。'});}}};
 return pipeline;
}
