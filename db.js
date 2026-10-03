export const db = await new Promise((resolve,reject)=>{
  const request=indexedDB.open('tingye',2);
  request.onupgradeneeded=()=>{for(const name of ['episodes','cards','settings','progress'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
});
function rawRead(store,id){return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function rawAll(store){return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function read(store,id){const value=await rawRead(store,id);if(store==='episodes'&&value){const p=await rawRead('progress',id);if(p)value.progress=p.seconds;}return value;}
export async function all(store){const values=await rawAll(store);if(store==='episodes'){const progress=new Map((await rawAll('progress')).map(p=>[p.id,p.seconds]));for(const e of values)if(progress.has(e.id))e.progress=progress.get(e.id);}return values;}
export function write(store,value){return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(value);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
export function remove(store,id){return new Promise((resolve,reject)=>{const t=db.transaction(store==='episodes'?['episodes','progress']:store,'readwrite');t.objectStore(store).delete(id);if(store==='episodes')t.objectStore('progress').delete(id);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
export function saveBatch(episodes,cards,settings=[]){return new Promise((resolve,reject)=>{const t=db.transaction(['episodes','cards','settings'],'readwrite');for(const e of episodes)t.objectStore('episodes').put(e);for(const c of cards)t.objectStore('cards').put(c);for(const s of settings)t.objectStore('settings').put(s);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
