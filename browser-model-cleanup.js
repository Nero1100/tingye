// One-time retirement of browser AI weights. Learning data uses other stores.
export async function clearModelDownloads(namespace){
 if(!['tingye-local-japanese-speech-v1','tingye-local-translation-v1'].includes(namespace))throw Error('未知模型缓存。');
 try{
  const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('tingye-model-files-v2');
  await root.removeEntry(namespace,{recursive:true});
 }catch(error){if(!['NotFoundError','TypeError'].includes(error.name))throw error;}
 if(!globalThis.caches)return;
 const cache=await caches.open('tingye-model-blocks-v2');
 for(const key of await cache.keys())if(new URL(key.url).searchParams.get('tingye-model-group')===namespace)await cache.delete(key);
 await caches.delete(namespace);
}
export async function clearBrowserTranslation(){
 await clearModelDownloads('tingye-local-translation-v1');
 if(globalThis.caches)await caches.delete('tingye-translation-runtime-v1');
}
