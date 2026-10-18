import {podcastArtworkCandidates} from './podcast-artwork.js?v=2026.10.18.1';
// Small, decoded covers live in IndexedDB; audio downloads use their own cache.
const LIMIT=2*1024*1024;
const TYPES=new Set(['image/jpeg','image/png','image/webp','image/gif']);
const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#ddd8cd"/><text x="300" y="350" text-anchor="middle" font-size="160" fill="#8e897e">♫</text></svg>');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function coverBlob(response){
 if(!response.ok||Number(response.headers.get('content-length'))>LIMIT)throw Error('封面下载未完成');
 let blob;
 if(response.body?.getReader){
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT)throw Error('封面图片过大');chunks.push(value);}blob=new Blob(chunks);}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
 }else blob=await response.blob();
 if(!blob.size||blob.size>LIMIT)throw Error('封面图片过大');
 const bytes=new Uint8Array(await blob.slice(0,16).arrayBuffer()),ascii=String.fromCharCode(...bytes);
 const type=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes[0]===137&&ascii.slice(1,4)==='PNG'?'image/png':/^GIF8[79]a/.test(ascii)?'image/gif':ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP'?'image/webp':'';
 if(!TYPES.has(type))throw Error('封面格式不支持');
 return new Blob([blob],{type});
}
export const coverKey=id=>'podcast-cover/'+id;
export class PodcastCovers{
 constructor({shows,read,write,fetcher=(...args)=>fetch(...args),changed=()=>{},decode=async url=>{
  const image=new Image();image.src=url;
  if(image.decode)await image.decode();else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
  if(!image.naturalWidth)throw Error('封面图片无法读取');return image;
 }}){Object.assign(this,{shows,read,write,fetcher,changed,decode});this.saved=new Map();this.ready=new Map();this.inflight=new Map();this.urls=new Set();this.retryAfter=new Map();}
 valid(value){return value?.blob instanceof Blob&&value.blob.size>0&&value.blob.size<=LIMIT&&TYPES.has(value.blob.type)&&typeof value.url==='string';}
 async prepare(value){const url=URL.createObjectURL(value.blob);try{const image=await this.decode(url);this.urls.add(url);return {url,image,type:value.blob.type};}catch(error){URL.revokeObjectURL(url);throw error;}}
 async load(){
  await Promise.all(this.shows.map(async show=>{try{const value=(await this.read('settings',coverKey(show.id)))?.value;if(!this.valid(value))return;const ready=await this.prepare(value);this.saved.set(show.id,value);this.ready.set(show.id,ready);}catch{/* A damaged cover never prevents opening the player. */}}));
 }
 src(id){return this.ready.get(id)?.url||placeholder;}
 artwork(id){const ready=this.ready.get(id);return ready?[{src:ready.url,sizes:'600x600',type:ready.type}]:[];}
 html(id,{className='',alt=''}={}){this.ensure(id).catch(()=>{});return `<img data-podcast-cover="${esc(id)}" src="${esc(this.src(id))}" class="${esc(className)}" alt="${esc(alt)}" decoding="sync">`;}
 paint(root=document){for(const image of root.querySelectorAll('[data-podcast-cover]')){const src=this.src(image.dataset.podcastCover);if(image.getAttribute('src')!==src)image.src=src;}}
 ensure(id){
  const show=this.shows.find(s=>s.id===id);if(!show||!podcastArtworkCandidates(show).length)return Promise.resolve(false);
  if(this.saved.get(id)?.url===(show.cover||'')&&this.ready.has(id))return Promise.resolve(true);
  if(this.inflight.has(id))return this.inflight.get(id);
  if((this.retryAfter.get(id)||0)>Date.now())return Promise.resolve(false);
  const work=this.download(show).finally(()=>this.inflight.delete(id));this.inflight.set(id,work);return work;
 }
 async download(show){
  for(const sourceURL of podcastArtworkCandidates(show)){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try{
   const response=await this.fetcher(sourceURL,{mode:'cors',credentials:'omit',signal:controller.signal});
   const blob=await coverBlob(response),value={url:show.cover||'',sourceURL,blob,updated:Date.now()};if(!this.valid(value))throw Error('封面格式不支持');
   const ready=await this.prepare(value);
   try{await this.write('settings',{id:coverKey(show.id),value});}catch{/* Keep a session cover if device storage is full. */}
   this.saved.set(show.id,value);
   // Keep earlier URLs alive for existing views and lock-screen artwork.
   this.ready.set(show.id,ready);this.retryAfter.delete(show.id);this.changed(show.id);return true;
   }catch{/* Try a verified alternate; retain an older decoded cover on failure. */}finally{clearTimeout(timer);}
  }
  this.retryAfter.set(show.id,Date.now()+30000);return false;
 }
 ensureAll(){this.retryAfter.clear();return Promise.all(this.shows.map(show=>this.ensure(show.id)));}
}
