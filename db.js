export const db = await new Promise((resolve,reject)=>{
  const request=indexedDB.open('tingye',2);
  request.onupgradeneeded=()=>{for(const name of ['episodes','cards','settings','progress'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
});
function rawRead(store,id){return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function rawAll(store){return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
const durationKey=id=>'track-duration/'+id;
export async function read(store,id){const value=await rawRead(store,id);if(store==='episodes'&&value){const [p,d]=await Promise.all([rawRead('progress',id),rawRead('settings',durationKey(id))]);if(p)value.progress=p.seconds;if(Number.isFinite(d?.value)&&d.value>0)value.duration=d.value;}return value;}
export async function all(store){const values=await rawAll(store);if(store==='episodes'){const [positions,settings]=await Promise.all([rawAll('progress'),rawAll('settings')]);const progress=new Map(positions.map(p=>[p.id,p.seconds])),durations=new Map(settings.filter(s=>s.id.startsWith('track-duration/')).map(s=>[s.id,s.value]));for(const e of values){if(progress.has(e.id))e.progress=progress.get(e.id);const duration=durations.get(durationKey(e.id));if(Number.isFinite(duration)&&duration>0)e.duration=duration;}}return values;}
// First playback learns duration without replacing the Blob the media decoder is reading.
export function saveDuration(id,duration){if(!id||!Number.isFinite(duration)||duration<=0)return Promise.resolve();return write('settings',{id:durationKey(id),value:duration});}
export function write(store,value){return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(value);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
export function remove(store,id){return new Promise((resolve,reject)=>{const t=db.transaction(store==='episodes'?['episodes','progress','settings']:store,'readwrite');t.objectStore(store).delete(id);if(store==='episodes'){t.objectStore('progress').delete(id);t.objectStore('settings').delete(durationKey(id));}t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
export function saveBatch(episodes,cards,settings=[]){return new Promise((resolve,reject)=>{const t=db.transaction(['episodes','cards','settings'],'readwrite');for(const e of episodes)t.objectStore('episodes').put(e);for(const c of cards)t.objectStore('cards').put(c);for(const s of settings)t.objectStore('settings').put(s);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
export function setEpisodeOrder(ids){return new Promise((resolve,reject)=>{
 const t=db.transaction('episodes','readwrite'),store=t.objectStore('episodes');
 ids.forEach((id,order)=>{const request=store.get(id);request.onsuccess=()=>{if(request.result)store.put({...request.result,order});};});
 t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);
});}
