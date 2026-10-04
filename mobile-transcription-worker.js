import {SPEECH_CACHE,JAPANESE_MODELS} from './mobile-transcription.js?v=2026.10.04.04';
import {configureLocalRuntime,preparePublicModels} from './mobile-runtime.js?v=2026.10.04.04';
const progress=data=>self.postMessage({type:'progress',...data});let started=false;
self.onmessage=async({data})=>{
 if(started)return;started=true;
 try{
  const model=JAPANESE_MODELS[data.mode||'balanced'];if(!model)throw Error('请选择轻量或均衡模式。');
  if(data.action==='prepare'){await preparePublicModels(SPEECH_CACHE,model.files,progress);self.postMessage({type:'done'});return;}
  if(data.language!=='ja'||!(data.samples instanceof Float32Array)||!data.samples.length||data.samples.length>16000*91)throw Error('请使用 90 秒以内的日语音频。');
  const pipeline=await configureLocalRuntime(SPEECH_CACHE,progress,model.files);
  const transcriber=await pipeline('automatic-speech-recognition',model.id,{revision:model.revision,local_files_only:true,device:'wasm',dtype:'q8',progress_callback:p=>progress({message:p.status==='progress'?`读取已下载的日语模型 · ${Math.round((p.loaded||0)/1048576)} MB`:'加载日语识别模型…'})});
  progress({message:'正在本机识别日语，请保持听页在前台…'});
  // Use segment timestamps; word positions remain explicitly estimated.
  const result=await transcriber(data.samples,{language:'japanese',task:'transcribe',return_timestamps:true,chunk_length_s:30,stride_length_s:5,do_sample:false,callback_function:()=>progress({message:'已识别一段，继续处理日语音频…'})});
  await transcriber.dispose();self.postMessage({type:'done',result:{...result,model:model.id}});
 }catch(error){console.error('日语本机转写',error);self.postMessage({type:'error',message:'转写未完成，原稿保留。'+(error.message||'请重新打开后继续下载，或换更短的音频。')});}
};
