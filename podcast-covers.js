// Small, decoded covers live in IndexedDB; audio downloads use their own cache.
const LIMIT=2*1024*1024;
const TYPES=new Set(['image/jpeg','image/png','image/webp','image/gif']);
const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#ddd8cd"/><text x="300" y="350" text-anchor="middle" font-size="160" fill="#8e897e">♫</text></svg>');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const coverKey=id=>'podcast-cover/'+id;
export class PodcastCovers{
 constructor({shows,read,write,fetcher=(...args)=>fetch(...args),changed=()=>{},decode=async url=>{
  const image=new Image();image.src=url;
  if(image.decode)await image.decode();else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
  if(!image.naturalWidth)throw Error('封面图片无法读取');return image;
 }}){Object.assign(this,{shows,read,write,fetcher,changed,decode});this.saved=new Map();this.ready=new Map();this.inflight=new Map();this.urls=new Set();}
 valid(value){return value?.blob instanceof Blob&&value.blob.size>0&&value.blob.size<=LIMIT&&TYPES.has(value.blob.type)&&typeof value.url==='string';}
 async prepare(value){const url=URL.createObjectURL(value.blob);try{const image=await this.decode(url);this.urls.add(url);return {url,image,type:value.blob.type};}catch(error){URL.revokeObjectURL(url);throw error;}}
 async load(){
  await Promise.all(this.shows.map(async show=>{try{const value=(await this.read('settings',coverKey(show.id)))?.value;if(!this.valid(value))return;const ready=await this.prepare(value);this.saved.set(show.id,value);this.ready.set(show.id,ready);}catch{/* A damaged cover never prevents opening the player. */}}));
 }
 src(id){return this.ready.get(id)?.url||placeholder;}
 artwork(id){const ready=this.ready.get(id);return ready?[{src:ready.url,sizes:'600x600',type:ready.type}]:[];}
 html(id,{className='',alt=''}={}){return `<img data-podcast-cover="${esc(id)}" src="${esc(this.src(id))}" class="${esc(className)}" alt="${esc(alt)}" decoding="sync">`;}
 paint(root=document){for(const image of root.querySelectorAll('[data-podcast-cover]')){const src=this.src(image.dataset.podcastCover);if(image.getAttribute('src')!==src)image.src=src;}}
 ensure(id){
  const show=this.shows.find(s=>s.id===id);if(!show)return Promise.resolve(false);
  if(this.saved.get(id)?.url===show.cover&&this.ready.has(id))return Promise.resolve(true);
  if(this.inflight.has(id))return this.inflight.get(id);
  const work=this.download(show).finally(()=>this.inflight.delete(id));this.inflight.set(id,work);return work;
 }
 async download(show){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await this.fetcher(show.cover,{mode:'cors',credentials:'omit',signal:controller.signal});
   if(!response.ok||Number(response.headers.get('content-length'))>LIMIT)throw Error('封面下载未完成');
   const blob=await response.blob(),value={url:show.cover,blob,updated:Date.now()};if(!this.valid(value))throw Error('封面格式不支持');
   const ready=await this.prepare(value);
   try{await this.write('settings',{id:coverKey(show.id),value});this.saved.set(show.id,value);}catch{/* Keep a session cover if device storage is full. */}
   // Keep earlier URLs alive for existing views and lock-screen artwork.
   this.ready.set(show.id,ready);this.changed(show.id);return true;
  }catch{return false;}finally{clearTimeout(timer);}
 }
 ensureAll(){return Promise.all(this.shows.map(show=>this.ensure(show.id)));}
}
