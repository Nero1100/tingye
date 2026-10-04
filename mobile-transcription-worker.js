import {SPEECH_CACHE,JAPANESE_MODEL} from './mobile-transcription.js?v=2026.10.04.01';
import {configureLocalRuntime} from './mobile-runtime.js?v=2026.10.04.01';
const progress=data=>self.postMessage({type:'progress',...data});let started=false;
self.onmessage=async({data})=>{
 if(started)return;started=true;
 try{
  if(data.language!=='ja'||!(data.samples instanceof Float32Array)||!data.samples.length||data.samples.length>16000*91)throw Error('请使用 90 秒以内的日语音频。');
  const accelerated=data.mode==='fast';
  if(accelerated){const adapter=await self.navigator.gpu?.requestAdapter();if(!adapter?.features.has('shader-f16'))throw Error('这台设备暂不支持加速模式，请改选兼容模式。');}
  const pipeline=await configureLocalRuntime(SPEECH_CACHE,progress);
  const transcriber=await pipeline('automatic-speech-recognition',JAPANESE_MODEL.id,{revision:JAPANESE_MODEL.revision,device:accelerated?'webgpu':'wasm',dtype:accelerated?'q4f16':'q8',progress_callback:p=>progress({message:p.status==='progress'?`下载或读取日语模型 · ${Math.round((p.loaded||0)/1048576)} MB`:`准备日语模型，首次下载约 ${accelerated?'550':'1100'} MB…`})});
  progress({message:'正在本机识别日语，请保持听页在前台…'});
  // The exported teacher alignment heads do not match the two-layer decoder.
  // Use segment timestamps, never misrepresent them as measured word alignment.
  const result=await transcriber(data.samples,{language:'japanese',task:'transcribe',return_timestamps:true,chunk_length_s:30,stride_length_s:5,do_sample:false,callback_function:()=>progress({message:'已识别一段，继续处理日语音频…'})});
  await transcriber.dispose();self.postMessage({type:'done',result});
 }catch(error){console.error('日语本机转写',error);self.postMessage({type:'error',message:'转写未完成，原稿保留。'+(error.message?.includes('加速模式')?error.message:'请检查模型下载、可用空间，或重新打开后选择更短的音频。')});}
};
