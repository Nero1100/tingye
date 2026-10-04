import {speechTimeline} from './asr-timeline.js?v=2026.10.04.06';
import {editedSentence} from './transcript-edit.js?v=2026.10.04.06';
import {suggestSentences} from './sentence-boundaries.js?v=2026.10.04.06';
export const SPEECH_CACHE='tingye-local-japanese-speech-v1';
import {MODEL_FILES} from './model-manifests.js?v=2026.10.04.06';
import {prepareInWorker,clearDownloads} from './model-download.js?v=2026.10.04.06';
export const JAPANESE_MODEL=MODEL_FILES.speechBalanced;
export const JAPANESE_MODELS={light:MODEL_FILES.speech,balanced:MODEL_FILES.speechBalanced};
export function prepareJapaneseModel(onProgress=()=>{},mode='balanced'){return prepareInWorker(new URL('./mobile-transcription-worker.js?v=2026.10.04.06',import.meta.url),{mode},onProgress);}
export async function clearSpeechModels(){await clearDownloads(SPEECH_CACHE);await caches.delete(SPEECH_CACHE);}
export function japaneseTrialAllowed(episode){
 if(episode.language!=='ja')throw Error('手机转写试用目前只支持日语。');
 if(!Number.isFinite(episode.duration)||episode.duration<=0||episode.duration>90)throw Error('请先选一段 90 秒以内的日语音频测试。长音频仍可使用原来的电脑工具。');
}
export function audioActivityEnd(samples){
 let loudest=0;const bins=[];
 for(let a=0;a<samples.length;a+=4000){let sum=0;const n=Math.min(4000,samples.length-a);for(let i=a;i<a+n;i++)sum+=samples[i]*samples[i];const rms=Math.sqrt(sum/n);loudest=Math.max(loudest,rms);bins.push({end:(a+n)/16000,rms});}
 return bins.filter(b=>b.rms>Math.max(.008,loudest*.08)).at(-1)?.end||0;
}
export function japaneseResultSegments(result,duration,activityEnd=0){
 const timeline=speechTimeline(result,duration);
 const segments=timeline.map((chunk,id)=>editedSentence({...chunk,id,translation:'',words:[],translationPending:true},chunk.text,'','ja'));
 if(activityEnd-segments.at(-1).end>Math.max(2,duration*.15)){
  for(const s of segments)s.transcriptionWarning='后半段声音可能未完整识别。已保留识别文字，请试听核对；原稿尚未替换。';
 }
 // Segment timestamps come from ASR; word positions and additional punctuation
 // boundaries are estimated and remain explicitly editable in the phone editor.
 return suggestSentences(segments,'ja').map((s,id)=>({...s,id,translation:'',translationEdited:false,translationPending:true,transcriptionEngine:result.model===MODEL_FILES.speechBalanced.id?'local-whisper-small':'local-whisper-base',wordTimingEstimated:true}));
}
export async function decodeJapaneseTrial(file){
 if(!file||file.size>80*1048576)throw Error('请使用 80 MB 以内的短音频测试。');
 const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)throw Error('当前浏览器无法读取这段音频。');
 const context=new Context();
 try{
  const decoded=await context.decodeAudioData(await file.arrayBuffer());
  if(decoded.duration>90.2||decoded.duration<=0)throw Error('手机试用请使用 90 秒以内的音频。');
  const mono=new Float32Array(decoded.length);
  for(let ch=0;ch<decoded.numberOfChannels;ch++){const input=decoded.getChannelData(ch);for(let i=0;i<mono.length;i++)mono[i]+=input[i]/decoded.numberOfChannels;}
  const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000),buffer=offline.createBuffer(1,mono.length,decoded.sampleRate);
  buffer.copyToChannel(mono,0);const source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();
  return (await offline.startRendering()).getChannelData(0).slice();
 }finally{await context.close().catch(()=>{});}
}
export function runJapaneseTranscription(samples,onProgress=()=>{},mode='balanced'){
 let worker,timer,finished=false,rejectTask;
 const stop=()=>{clearTimeout(timer);worker?.terminate();};
 const promise=new Promise((resolve,reject)=>{
  rejectTask=reject;const fail=message=>{if(finished)return;finished=true;stop();reject(Error(message));};
  const watchdog=()=>{clearTimeout(timer);timer=setTimeout(()=>fail('转写长时间没有响应，原稿保留。请保持听页在前台，使用更短的音频测试。'),15*60*1000);};
  try{
   worker=new Worker(new URL('./mobile-transcription-worker.js?v=2026.10.04.06',import.meta.url),{type:'module'});
   worker.onmessage=({data})=>{if(finished)return;watchdog();if(data.type==='progress')onProgress(data);else if(data.type==='done'){finished=true;stop();resolve(data.result);}else if(data.type==='error')fail(data.message);};
   worker.onerror=()=>fail('本机转写未能运行，原稿保留。请检查下载或换更短的音频。');watchdog();worker.postMessage({language:'ja',samples,mode},[samples.buffer]);
  }catch(error){fail(error.message);}
 });
 return {promise,cancel(){if(finished)return;finished=true;stop();const error=Error('已停止转写，原稿保留。');error.name='AbortError';rejectTask(error);}};
}
