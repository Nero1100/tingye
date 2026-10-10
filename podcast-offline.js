import './podcast-cache.js?v=2026.10.10.1';
import {streamURL,podcastCacheKey,validPodcastCache,fetchPodcastFeed} from './podcasts.js?v=2026.10.10.1';
export const DOWNLOAD_LIMIT='podcast-download-limit-v1',DOWNLOAD_PREFIX='podcast-download/',MiB=1048576,MAX_AUDIO=350*MiB;
export const downloadLimits=[256,512,1024,2048,4096].map(n=>n*MiB);
export const validatedLimit=value=>downloadLimits.includes(value)?value:1024*MiB;
export const downloadKey=id=>DOWNLOAD_PREFIX+id;
export function validDownload(value){return value&&typeof value.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value.id)&&typeof value.url==='string'&&value.url.startsWith('https://')&&typeof value.title==='string'&&value.title.length<=500&&Number.isFinite(value.bytes)&&value.bytes>0&&value.bytes<=MAX_AUDIO&&['downloading','ready','interrupted'].includes(value.status)&&Number.isFinite(value.downloaded);}
export function checkCapacity(used,requested,limit,estimate={}){
 if(!Number.isFinite(requested)||requested<=0||requested>MAX_AUDIO)throw Error('这集过大或没有提供音频大小，暂时无法离线下载。');
 if(used+requested>limit)throw Error('已达到播客下载容量上限，请清理下载或提高上限。');
 if(Number.isFinite(estimate.quota)&&estimate.quota>0&&estimate.quota-(estimate.usage||0)<requested+32*MiB)throw Error('本机可用空间不足，请先清理下载。');
}
export function cleanupCandidates(downloads,episodes,favorites){const byId=new Map(episodes.map(e=>[e.id,e])),liked=new Set(favorites);return downloads.filter(d=>{const e=byId.get(d.id);return d.status==='ready'&&!liked.has(d.id)&&e?.duration>0&&(e.progress||0)>=Math.max(e.duration*.95,e.duration-10);}).map(d=>d.id);}
async function supported(){
 if(!globalThis.caches||!navigator.serviceWorker||!globalThis.isSecureContext)throw Error('请在 HTTPS 听页中使用离线下载。');
 let readyTimer;try{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(Error('离线功能正在准备，请稍后重试。')),10000);})]);}finally{clearTimeout(readyTimer);}
 if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(Error('请重新打开听页后再下载。'));},5000);function changed(){if(!navigator.serviceWorker.controller)return;clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();}navigator.serviceWorker.addEventListener('controllerchange',changed);changed();});
}
export class PodcastOffline{
 constructor({read,write,remove,all,base=new URL('./',import.meta.url),cacheStorage=globalThis.caches,fetcher=(...args)=>globalThis.fetch(...args),estimate=()=>navigator.storage?.estimate?.()||{},support=supported,controlled=()=>!!navigator.serviceWorker?.controller,notify=()=>{}}){Object.assign(this,{read,write,removeSetting:remove,all,base,cacheStorage,fetcher,estimate,support,controlled,notify});this.records=new Map();this.jobs=new Map();this.pending=Promise.resolve();this.limit=1024*MiB;this.listeners=new Set();}
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 changed(){if(this.notificationTimer)return;this.notificationTimer=setTimeout(()=>{this.notificationTimer=null;for(const fn of this.listeners)fn();},120);}
 async load(){
  this.limit=validatedLimit((await this.read('settings',DOWNLOAD_LIMIT))?.value);this.records.clear();
  const cache=await this.cacheStorage?.open(TingyePodcastCache.NAME);if(!cache)return;
  for(const row of await this.all('settings')){if(!row.id.startsWith(DOWNLOAD_PREFIX)||!validDownload(row.value))continue;const value=row.value,exists=await cache.match(TingyePodcastCache.url(value.id,this.base));
   const status=exists?'ready':value.status==='ready'?'interrupted':value.status;
   const next={...value,status:status==='downloading'&&!this.jobs.has(value.id)?'interrupted':status};this.records.set(value.id,next);if(JSON.stringify(next)!==JSON.stringify(value))await this.write('settings',{id:row.id,value:next});
  }this.changed();
 }
 info(id){return this.jobs.get(id)?.info||this.records.get(id);}
 used(){return [...this.records.values()].filter(d=>d.status==='ready').reduce((n,d)=>n+d.bytes,0);}
 ready(id){return this.records.get(id)?.status==='ready';}
 async source(episode){
  if(this.ready(episode.id)&&this.controlled()){
   const cache=await this.cacheStorage.open(TingyePodcastCache.NAME),url=TingyePodcastCache.url(episode.id,this.base);
   if(await cache.match(url))return url;
   const old=this.records.get(episode.id);this.records.set(episode.id,{...old,status:'interrupted'});await this.write('settings',{id:downloadKey(episode.id),value:this.records.get(episode.id)});this.changed();
  }return streamURL(episode);
 }
 async setLimit(value){this.limit=validatedLimit(value);await this.write('settings',{id:DOWNLOAD_LIMIT,value:this.limit});this.changed();}
 cancel(id){const job=this.jobs.get(id);if(job){job.controller.abort();job.info.status='cancelling';this.changed();}}
 async enclosureBytes(episode,signal){
  if(episode.podcast.bytes)return episode.podcast.bytes;
  const showId=episode.podcast.showId,key=podcastCacheKey(showId);let feed=(await this.read('settings',key))?.value;
  const find=value=>validPodcastCache(value,showId)?value.episodes.find(item=>item.guid===episode.podcast.guid)?.bytes:0;
  let bytes=find(feed);if(!bytes&&showId==='noriko'){feed=await fetchPodcastFeed(showId,{signal});await this.write('settings',{id:key,value:feed});bytes=find(feed);}return bytes||0;
 }
 download(episode){
  if(this.jobs.has(episode.id))return this.jobs.get(episode.id).promise;
  const controller=new AbortController(),job={controller,info:{id:episode.id,status:'queued',title:episode.title,bytes:episode.podcast?.bytes||0,received:0}};
  this.jobs.set(episode.id,job);this.changed();
  const task=()=>this.run(episode,job);job.promise=this.pending.catch(()=>{}).then(task).finally(()=>{this.jobs.delete(episode.id);this.changed();});this.pending=job.promise;return job.promise;
 }
 async run(episode,job){
  const signal=job.controller.signal,url=streamURL(episode),key=TingyePodcastCache.url(episode.id,this.base);let cache,owned=false;
  try{
   if(signal.aborted)throw new DOMException('取消下载','AbortError');if(!url)throw Error('这不是可下载的播客单集。');await this.support();
   cache=await this.cacheStorage.open(TingyePodcastCache.NAME);
   if(this.ready(episode.id)&&await cache.match(key)){this.notify('这一集已经下载，无需重复保存');return this.records.get(episode.id);}
   const opaque=episode.podcast.showId==='noriko',enclosureBytes=await this.enclosureBytes(episode,signal);let size=enclosureBytes||Math.ceil(Math.max(episode.duration,60)*24000);checkCapacity(this.used(),size,this.limit,await this.estimate());
   if(signal.aborted)throw new DOMException('取消下载','AbortError');job.info={...job.info,status:'downloading',bytes:size,opaque};this.changed();
   const result=await this.fetcher(url,{mode:opaque?'no-cors':'cors',credentials:'omit',cache:'no-store',signal});
   const unreadable=result.type==='opaque';if(!unreadable&&(!result.ok||result.status===206))throw Error('音频下载未完成，请稍后重试。');
   if(!unreadable&&result.headers.get('Content-Type')&&!/^(audio\/|video\/|application\/octet-stream)/i.test(result.headers.get('Content-Type')))throw Error('这个链接没有返回音频，请稍后重试。');
   if(unreadable&&!enclosureBytes)throw Error('这个节目没有提供音频大小，暂时无法离线下载。');
   const length=unreadable?size:Number(result.headers.get('Content-Length'))||size;checkCapacity(this.used(),length,this.limit,await this.estimate());
   const metadata={id:episode.id,title:episode.title,url,showId:episode.podcast.showId,bytes:length,estimated:unreadable,status:'downloading',downloaded:Date.now()};
   await this.write('settings',{id:downloadKey(episode.id),value:metadata});owned=true;this.records.set(episode.id,metadata);job.info.bytes=length;job.info.opaque=unreadable;this.changed();
   let response=result,received=0;
   if(!unreadable){
    if(!result.body)throw Error('音频下载没有返回内容。');const reader=result.body.getReader(),owner=this;
    const stream=new ReadableStream({async pull(controller){try{if(signal.aborted)throw new DOMException('取消下载','AbortError');const part=await reader.read();if(part.done){if(!received||Number(result.headers.get('Content-Length'))&&received!==Number(result.headers.get('Content-Length')))throw Error('音频未完整下载，请重试。');controller.close();return;}received+=part.value.byteLength;checkCapacity(owner.used(),received,owner.limit);job.info.received=received;owner.changed();controller.enqueue(part.value);}catch(error){await reader.cancel().catch(()=>{});controller.error(error);}},cancel:()=>reader.cancel()});
    response=new Response(stream,{headers:{'Content-Type':result.headers.get('Content-Type')||episode.mime||'audio/mpeg',...(Number(result.headers.get('Content-Length'))?{'Content-Length':result.headers.get('Content-Length')}:{})}});
   }
   await cache.put(key,response);if(signal.aborted)throw new DOMException('取消下载','AbortError');
   const ready={...metadata,status:'ready',bytes:unreadable?length:received};checkCapacity(this.used(),ready.bytes,this.limit);await this.write('settings',{id:downloadKey(episode.id),value:ready});this.records.set(episode.id,ready);this.changed();this.notify('已下载，可以离线播放');return ready;
  }catch(error){
   if(owned){if(cache)await cache.delete(key).catch(()=>{});this.records.delete(episode.id);await this.removeSetting('settings',downloadKey(episode.id)).catch(()=>{});}
   if(signal.aborted||error.name==='AbortError'){this.notify('下载已取消');return null;}
   if(error.name==='QuotaExceededError')throw Error('本机空间不足，下载未保存，请清理后重试。');throw error;
  }
 }
 async remove(ids){
  const cache=await this.cacheStorage.open(TingyePodcastCache.NAME);let bytes=0;
  for(const id of ids){const job=this.jobs.get(id);if(job){this.cancel(id);await job.promise.catch(()=>{});}const value=this.records.get(id);if(value?.status==='ready')bytes+=value.bytes;await cache.delete(TingyePodcastCache.url(id,this.base));await this.removeSetting('settings',downloadKey(id));this.records.delete(id);}
  this.changed();return {ids,bytes};
 }
}
