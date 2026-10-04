import {MODEL_CACHE,DIRECT_MODEL,TRANSLATION_MODELS,LANGUAGE_CODES} from './mobile-translation.js?v=2026.10.04.06';
import {MODEL_FILES} from './model-manifests.js?v=2026.10.04.06';
import {isIOSDevice} from './model-download.js?v=2026.10.04.06';
const progress=message=>self.postMessage({type:'progress',...message});
let started=false;
self.onmessage=async({data})=>{
 if(started)return;started=true;
 try{
  if(data.engine==='direct'&&isIOSDevice())throw Error('手机请使用轻量翻译，大模型请在电脑上使用。');
  const entries=data.engine==='direct'?null:[...(data.language==='en'?[]:MODEL_FILES[data.language]?.files||[]),...MODEL_FILES.en.files];
  const {configureLocalRuntime,preparePublicModels}=await import('./mobile-runtime.js?v=2026.10.04.06');
  if(data.action==='prepare'){
   if(!LANGUAGE_CODES[data.language])throw Error('不支持这种语言。');
   if(entries)await preparePublicModels(MODEL_CACHE,entries,progress);self.postMessage({type:'done'});return;
  }
  if(!LANGUAGE_CODES[data.language]||!Array.isArray(data.texts)||!data.texts.length||data.texts.length>20000||data.texts.some(t=>typeof t!=='string'||!t.trim()||t.length>(data.language==='ja'?180:500)))throw Error('请先调整断句，再翻译。');
  progress({stage:'load',message:'准备本机翻译模型…'});
  const pipeline=await configureLocalRuntime(MODEL_CACHE,progress,entries);
  const downloads=new Map();
  if(data.engine==='direct'){
   progress({stage:'load',message:'检查本机翻译能力…'});
   const adapter=await self.navigator.gpu?.requestAdapter();
   if(!adapter?.features.has('shader-f16'))throw Error('直接译中文需要这台设备的浏览器支持。目前可选择轻量翻译，或在电脑使用高质量翻译。');
   const translator=await pipeline('text-generation',DIRECT_MODEL.id,{revision:DIRECT_MODEL.revision,device:'webgpu',dtype:'q4f16',progress_callback:p=>{
    if(p.status==='progress')progress({stage:'load',message:`下载或读取直接翻译模型 · ${Math.round((p.loaded||0)/1048576)} MB`});
    else progress({stage:'load',message:'准备直接译中文模型，首次需要下载约 1.4 GB…'});
   }});
   const translations=[];
   for(let i=0;i<data.texts.length;i++){
    progress({stage:'translate',completed:i,total:data.texts.length,message:`正在翻译 ${i+1} / ${data.texts.length} 句…`});
    const messages=[{role:'system',content:'你是专业翻译。把目标句准确翻译成简体中文。上下句只作参考，不要翻译。只输出目标句的中文译文，不解释。保留否定、数量、左右方向和动作发生的位置。不要添加原文没有的人物或事情。人名和店名不能当普通词翻译。'},
     {role:'user',content:JSON.stringify({language:{ja:'日语',fr:'法语',en:'英语'}[data.language],previous:data.context?.[i]?.previous?.slice(0,500)||'',target:data.texts[i],next:data.context?.[i]?.next?.slice(0,500)||''})}];
    const prompt=translator.tokenizer.apply_chat_template(messages,{tokenize:false,add_generation_prompt:true,enable_thinking:false});
    const result=await translator(prompt,{max_new_tokens:256,do_sample:false,return_full_text:false});
    const value=result?.[0]?.generated_text?.replace(/<think>[\s\S]*?<\/think>/g,'').replace(/^\s*(?:译文[：:]\s*)/u,'').trim();
    if(!value||!/[\u3400-\u9fff]/u.test(value)||value.includes('<think>'))throw Error('未生成完整中文译文，请先试译一句。');translations.push(value);
   }
   await translator.dispose();self.postMessage({type:'done',translations});return;
  }
  async function loadModel(language){const model=TRANSLATION_MODELS[language];return pipeline('translation',model.id,{revision:model.revision,local_files_only:true,device:'wasm',dtype:'q8',progress_callback:p=>{
   const file=model.id+':'+p.file;
   if(p.status==='progress')downloads.set(file,{loaded:p.loaded||0,total:p.total||0});
   if(p.status==='done'&&downloads.has(file)){const entry=downloads.get(file);entry.loaded=entry.total;}
   const loaded=[...downloads.values()].reduce((n,v)=>n+v.loaded,0);
   progress({stage:'load',loaded,message:p.status==='ready'?'模型已就绪':loaded?`首次下载或读取模型 · ${Math.round(loaded/1048576)} MB`:'读取已保存的模型，首次使用英语约 120 MB，日语/法语约 230 MB…'});
  }});}
  let texts=data.texts;
  if(data.language!=='en'){
   // Release the source-to-English model before loading English-to-Chinese.
   // This keeps peak memory lower on iPhone; the intermediate text stays local.
   const sourceTranslator=await loadModel(data.language),intermediate=[];
   for(let i=0;i<texts.length;i++){
    progress({stage:'translate',message:`正在理解原文 ${i+1} / ${texts.length} 句…`});
    const result=await sourceTranslator(texts[i],{max_new_tokens:256,num_beams:4});
    const value=result?.[0]?.translation_text;if(!value?.trim())throw Error('未生成完整译文。');intermediate.push(value.trim());
   }
   await sourceTranslator.dispose();texts=intermediate;
  }
  const translator=await loadModel('en');
  const translations=[];
  for(let i=0;i<data.texts.length;i++){
   progress({stage:'translate',completed:i,total:data.texts.length,message:`正在翻译 ${i+1} / ${data.texts.length} 句…`});
   const result=await translator(texts[i],{max_new_tokens:256,num_beams:4});
   const value=result?.[0]?.translation_text;
   if(typeof value!=='string'||!value.trim()||value.length>10000)throw Error(`第 ${i+1} 句未生成完整译文，请重试。`);
   translations.push(value.trim());
  }
  await translator.dispose();self.postMessage({type:'done',translations});
 }catch(error){console.error('本机翻译运行错误',error);const hint=error.message?.includes('直接译中文需要')||error.message?.includes('先调整')?error.message:'请检查模型下载、可用空间，或重新打开后先试译一句。';self.postMessage({type:'error',message:'本机翻译未完成，原稿保留。'+hint});}
};
