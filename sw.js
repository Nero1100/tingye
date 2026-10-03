const CACHE='tingye-shell-2026.10.03.13';
const ASSETS=['./','./index.html','./styles.css','./app.js','./client.js','./db.js','./validate.js','./lexicon.js','./practice.js','./theme.js','./furigana.js','./transcript-edit.js','./playlist.js','./segment-edit.js','./reader-gestures.js','./folders.js','./drag-order.js','./cards.js','./audio-storage.js','./manifest.webmanifest','./icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tingye-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url); if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/'))return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));}return response;}).catch(()=>caches.match('./index.html')));return;}
 if(ASSETS.some(asset=>new URL(asset,self.registration.scope).href===url.href)){event.respondWith(fetch(event.request,{cache:'no-cache'}).then(async response=>{if(response.ok)await (await caches.open(CACHE)).put(event.request,response.clone());return response;}).catch(()=>caches.match(event.request)));}
});
