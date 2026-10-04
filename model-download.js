// Download before inference. Each committed 2 MB block survives worker termination.
export const DOWNLOAD_CACHE='tingye-model-blocks-v2';
export const BLOCK_BYTES=2*1024*1024;
const ROOT='tingye-model-files-v2';
const keyFor=async url=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url)))].map(n=>n.toString(16).padStart(2,'0')).join('');
export function isIOSDevice(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;}
export class ModelStore{
 constructor(namespace,progress=()=>{}){this.namespace=namespace;this.progress=progress;this.queue=Promise.resolve();}
 async initialize(){
  this.cache=await caches.open(DOWNLOAD_CACHE);
  try{this.directory=await (await navigator.storage.getDirectory()).getDirectoryHandle(ROOT,{create:true});this.directory=await this.directory.getDirectoryHandle(this.namespace,{create:true});}catch{this.directory=null;}
  return this;
 }
 partURL(url,index){const u=new URL(url);u.searchParams.set('tingye-model-block',String(index));u.searchParams.set('tingye-model-group',this.namespace);return u.href;}
 async stored(entry){
  const key=await keyFor(entry.url);
  if(this.directory){try{const handle=await this.directory.getFileHandle(key),file=await handle.getFile();return {bytes:file.size,handle};}catch{return {bytes:0,key};}}
  let bytes=0,index=0;
  while(bytes<entry.size){const r=await this.cache.match(this.partURL(entry.url,index++));if(!r)break;const count=Number(r.headers.get('content-length'));if(count!==Math.min(BLOCK_BYTES,entry.size-bytes))break;bytes+=count;}
  return {bytes,key};
 }
 async save(entry,start,bytes,state){
  if(this.directory){
   const handle=state.handle||await this.directory.getFileHandle(state.key,{create:true});state.handle=handle;
   if(handle.createSyncAccessHandle){const writer=await handle.createSyncAccessHandle();try{writer.truncate(start);const count=writer.write(bytes,{at:start});if(count!==bytes.length)throw Error('模型保存不完整。');writer.flush();}finally{writer.close();}}
   else{const writer=await handle.createWritable({keepExistingData:true});try{await writer.truncate(start);await writer.write({type:'write',position:start,data:bytes});await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}}
  }else await this.cache.put(this.partURL(entry.url,start/BLOCK_BYTES),new Response(bytes,{headers:{'content-length':String(bytes.length)}}));
 }
 async fetchBlock(entry,start){
  const end=Math.min(entry.size,start+BLOCK_BYTES)-1;
  for(let attempt=0;attempt<3;attempt++){
   try{
    const response=await fetch(entry.url,{headers:{Range:`bytes=${start}-${end}`},cache:'no-store'});
   if(response.status===200&&entry.size<=8*1024*1024){
    // Some small JSON endpoints ignore Range. Discard earlier bytes as a stream,
    // retaining only the requested block rather than buffering the full file.
    const reader=response.body.getReader(),bytes=new Uint8Array(end-start+1);let cursor=0,written=0;
    try{while(written<bytes.length){const {done,value}=await reader.read();if(done)break;const from=Math.max(0,start-cursor),to=Math.min(value.length,end+1-cursor);if(to>from){bytes.set(value.subarray(from,to),written);written+=to-from;}cursor+=value.length;}}finally{await reader.cancel().catch(()=>{});}
    if(written!==bytes.length)throw Error('下载中断。');return bytes;
   }
    const expected=`bytes ${start}-${end}/${entry.size}`;
    if(response.status!==206||response.headers.get('content-range')!==expected){await response.body?.cancel();throw Error('下载服务器暂不支持分块读取，请稍后重试。');}
    const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==end-start+1)throw Error('下载中断。');return bytes;
   }catch(error){if(attempt===2)throw error;this.progress({message:'连接中断，已下载部分保留，正在重试…'});await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}
  }
 }
 async prepare(entries){
  await this.initialize();const total=entries.reduce((n,e)=>n+e.size,0);let completed=0;
  const estimate=await navigator.storage?.estimate?.()||{};
  for(const entry of entries){
   if(!Number.isSafeInteger(entry.size)||entry.size<=0)throw Error('模型清单不完整。');
   const state=await this.stored(entry);
   let start=state.bytes===entry.size?state.bytes:state.bytes>entry.size?0:Math.floor(state.bytes/BLOCK_BYTES)*BLOCK_BYTES;
   if(entry.size>start&&estimate.quota&&estimate.quota-(estimate.usage||0)<entry.size-start+16*1024*1024)throw Error('可用网页存储空间不足。已下载部分保留，请腾出空间后重试。');
   this.progress({stage:'download',loaded:completed+start,total,message:`下载模型 ${Math.floor((completed+start)/total*100)}% · 已保存 ${Math.round((completed+start)/1048576)} / ${Math.round(total/1048576)} MB`});
   while(start<entry.size){const bytes=await this.fetchBlock(entry,start);await this.save(entry,start,bytes,state);start+=bytes.length;this.progress({stage:'download',loaded:completed+start,total,message:`下载模型 ${Math.floor((completed+start)/total*100)}% · 已保存 ${Math.round((completed+start)/1048576)} / ${Math.round(total/1048576)} MB`});}
   completed+=entry.size;
  }
 }
 async match(request,entries){
  const url=typeof request==='string'?request:request.url,entry=entries.find(e=>e.url===url);if(!entry)return undefined;
  const state=await this.stored(entry);if(state.bytes!==entry.size)throw Error('模型尚未下载完整，请先完成下载。');
  if(this.directory)return new Response(await state.handle.getFile(),{headers:{'content-length':String(entry.size),'content-type':'application/octet-stream'}});
  let index=0;const store=this;
  return new Response(new ReadableStream({async pull(controller){if(index*BLOCK_BYTES>=entry.size){controller.close();return;}const part=await store.cache.match(store.partURL(entry.url,index++));if(!part){controller.error(Error('模型文件被系统清理，请重新下载。'));return;}controller.enqueue(new Uint8Array(await part.arrayBuffer()));}}),{headers:{'content-length':String(entry.size)}});
 }
}
export async function downloadStatus(namespace){
 let bytes=0,files=0;try{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle(ROOT),group=await dir.getDirectoryHandle(namespace);for await(const [,handle]of group.entries())if(handle.kind==='file'){bytes+=(await handle.getFile()).size;files++;}}catch{}
 const cache=await caches.open(DOWNLOAD_CACHE);for(const key of await cache.keys()){if(new URL(key.url).searchParams.get('tingye-model-group')===namespace){bytes+=Number((await cache.match(key)).headers.get('content-length')||0);files++;}}
 return {bytes,files};
}
export async function clearDownloads(namespace){
 try{const root=await (await navigator.storage.getDirectory()).getDirectoryHandle(ROOT);await root.removeEntry(namespace,{recursive:true});}catch(error){if(error.name!=='NotFoundError'&&error.name!=='TypeError')throw error;}
 const cache=await caches.open(DOWNLOAD_CACHE);for(const key of await cache.keys())if(new URL(key.url).searchParams.get('tingye-model-group')===namespace)await cache.delete(key);
}
export function prepareInWorker(workerURL,data,onProgress=()=>{}){
 let worker,rejectTask,finished=false,timer;
 const stop=()=>{clearTimeout(timer);worker?.terminate();};
 const promise=new Promise((resolve,reject)=>{rejectTask=reject;const fail=message=>{if(finished)return;finished=true;stop();reject(Error(message));};const watchdog=()=>{clearTimeout(timer);timer=setTimeout(()=>fail('下载暂时没有响应，已下载部分保留。请重新打开后继续下载。'),120000);};
  try{worker=new Worker(workerURL,{type:'module'});worker.onmessage=({data})=>{if(finished)return;watchdog();if(data.type==='progress')onProgress(data);else if(data.type==='done'){finished=true;stop();resolve();}else if(data.type==='error')fail(data.message);};worker.onerror=()=>fail('下载未完成，已保存部分可继续下载。');watchdog();worker.postMessage({...data,action:'prepare'});}catch(error){fail(error.message);}
 });
 return {promise,cancel(){if(finished)return;finished=true;stop();const error=Error('已停止，已下载部分保留。');error.name='AbortError';rejectTask(error);}};
}
