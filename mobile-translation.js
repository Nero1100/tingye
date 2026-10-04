// Inference runs in a worker. Only public model downloads use the network.
export const MODEL_CACHE='tingye-local-translation-v1';
export const DIRECT_MODEL={id:'onnx-community/Qwen3-1.7B-ONNX',revision:'cc6a06a21d614e9b8e92a6adfab1074d4e7d2438'};
export const TRANSLATION_MODELS={
 ja:{id:'Xenova/opus-mt-ja-en',revision:'1a906cfaaf7c8f4193f67f5885c082aa6dbd9d16'},
 fr:{id:'Xenova/opus-mt-fr-en',revision:'6b166a182780e118c997879d0ad5be4b53671644'},
 en:{id:'Xenova/opus-mt-en-zh',revision:'046f55aec303cdee3e0318604406d4df20f1e8ea'}
};
export const LANGUAGE_CODES={en:'eng_Latn',fr:'fra_Latn',ja:'jpn_Jpan'};
export function translationTargets(document,{scope='pending',index=0,overwrite=false}={}){
 if(!LANGUAGE_CODES[document.language])throw Error('目前支持英语、法语和日语译成中文。');
 return document.segments.flatMap((s,i)=>{
  const selected=scope==='current'?i===index:scope==='all'||s.translationPending===true||!s.translation?.trim();
  if(!selected||s.translationEdited&&!overwrite)return [];
  if(!s.text?.trim())throw Error(`第 ${i+1} 句原文为空，请先校对。`);
  if(s.text.length>(document.language==='ja'?180:500))throw Error(`第 ${i+1} 句太长，请先拆句，再生成对应译文。`);
  return [i];
 });
}
export function applyLocalTranslations(current,before,indices,translations,engine='direct'){
 // Include readings and translations: concurrent manual edits must never be lost.
 if(current.language!==before.language||JSON.stringify(current.segments)!==JSON.stringify(before.segments))throw Error('逐字稿已在其他窗口修改，本次译文未覆盖。请重新打开翻译。');
 if(indices.length!==translations.length||new Set(indices).size!==indices.length)throw Error('译文条数不完整，原稿已保留。');
 const next=structuredClone(current.segments);
 indices.forEach((index,i)=>{
  if(!Number.isInteger(index)||!next[index]||typeof translations[i]!=='string'||!translations[i].trim()||translations[i].length>10000)throw Error('生成的译文不完整，原稿已保留。');
  if(translations[i].trim()===next[index].text.trim()&&/[A-Za-z\u3040-\u30ff]/u.test(next[index].text))throw Error(`第 ${index+1} 句未成功翻译，原稿已保留。`);
  next[index]={...next[index],translation:translations[i].trim(),translationEdited:false,translationPending:false,translationEngine:engine==='light'?'local-opus':'local-qwen',translatedAt:Date.now()};
 });
 return next;
}
export function runLocalTranslation(document,indices,onProgress=()=>{},engine='direct'){
 let worker,timer,finished=false,rejectTask;
 const stop=()=>{clearTimeout(timer);worker?.terminate();};
 const promise=new Promise((resolve,reject)=>{
  rejectTask=reject;
  const fail=message=>{if(finished)return;finished=true;stop();reject(Error(message));};
  const watchdog=()=>{clearTimeout(timer);timer=setTimeout(()=>fail('翻译长时间没有响应，原稿已保留。请保持听页在前台，先试译一句。'),15*60*1000);};
  try{
   worker=new Worker(new URL('./mobile-translation-worker.js?v=2026.10.04.01',import.meta.url),{type:'module'});
   worker.onmessage=({data})=>{
    if(finished)return;watchdog();
    if(data.type==='progress')onProgress(data);
    else if(data.type==='done'){finished=true;stop();resolve(data.translations);}
    else if(data.type==='error')fail(data.message||'本机翻译失败，原稿已保留。');
   };
   worker.onerror=()=>fail('本机翻译未能运行，原稿已保留。请检查网络或重新打开听页，先试译一句。');
   watchdog();worker.postMessage({language:document.language,engine,texts:indices.map(i=>document.segments[i].text),context:indices.map(i=>({previous:document.segments[i-1]?.text||'',next:document.segments[i+1]?.text||''}))});
  }catch(error){fail(error.message);}
 });
 return {promise,cancel(){if(finished)return;finished=true;stop();const error=Error('已停止翻译，原稿保留。');error.name='AbortError';rejectTask(error);}};
}
export async function translationCacheStatus(){
 if(!globalThis.caches)return {bytes:0,files:0};
 const cache=await caches.open(MODEL_CACHE),keys=await cache.keys();let bytes=0;
 for(const key of keys){const response=await cache.match(key);bytes+=Number(response.headers.get('content-length')||0);}
 return {bytes,files:keys.length};
}
export async function clearTranslationCache(){if(globalThis.caches)await caches.delete(MODEL_CACHE);}
