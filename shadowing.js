export const SHADOW_PREFS='shadowing-preferences-v1';
export function shadowPreferences(value={}){
 value=value&&typeof value==='object'?value:{};
 return {mode:value.mode==='record'?'record':'listen',factor:[1,1.5,2].includes(Number(value.factor))?Number(value.factor):1.5,
 repeats:[0,1,2,3].includes(Number(value.repeats))?Number(value.repeats):1,autoNext:value.autoNext===true,
 rate:[.75,.85,1,1.15,1.25].includes(Number(value.rate))?Number(value.rate):1,mask:value.mask===true,onlyTranslation:value.onlyTranslation===true};
}
export const followSeconds=(sentence,prefs)=>Math.min(120,Math.max(2,(sentence.end-sentence.start)/prefs.rate*prefs.factor+1));
export const recordingMime=Recorder=>['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(type=>Recorder?.isTypeSupported?.(type))||'';
export class ShadowCancelled extends Error{}
const stopTracks=stream=>{for(const track of stream?.getTracks?.()||[])try{track.stop();}catch{}};
export class ShadowSession{
 constructor({audio,voice,sentences,index=0,prefs,changed=()=>{},completed=()=>{},mediaDevices=globalThis.navigator?.mediaDevices,Recorder=globalThis.MediaRecorder,audioSession=globalThis.navigator?.audioSession,url=URL}){
  Object.assign(this,{audio,voice,sentences,changed,completed,mediaDevices,Recorder,audioSession,url});
  this.prefs=shadowPreferences(prefs);this.index=Math.max(0,Math.min(index,sentences.length-1));this.phase='ready';this.round=0;this.generation=0;this.active=true;this.recording=null;this.left=0;this.savedRate=audio.playbackRate;this.savedDefaultRate=audio.defaultPlaybackRate;this.message='';
 }
 emit(){this.changed(this);}
 current(){return this.sentences[this.index];}
 sessionType(type){try{if(this.audioSession)this.audioSession.type=type;}catch{}}
 discard(){this.voice.pause();this.voice.removeAttribute('src');this.voice.load?.();if(this.voiceURL)this.url.revokeObjectURL(this.voiceURL);this.voiceURL=null;this.recording=null;}
 cancel(){
  this.generation++;this.cancelPending?.();this.cancelPending=null;clearInterval(this.clock);this.clock=null;
  try{if(this.recorder?.state==='recording')this.recorder.stop();}catch{}
  stopTracks(this.stream);this.stream=null;this.recorder=null;this.sessionType('playback');
  this.audio.pause();this.voice.pause();this.phase='ready';this.left=0;this.emit();
 }
 move(index){this.cancel();this.discard();this.index=Math.max(0,Math.min(index,this.sentences.length-1));this.round=0;this.message='';this.emit();}
 configure(value){this.cancel();this.prefs=shadowPreferences(value);this.round=0;this.emit();}
 async obtainMic(token){
  if(!this.mediaDevices?.getUserMedia||!this.Recorder)throw Error('此浏览器暂不能录音，可以切换普通跟读。');
  this.sessionType('play-and-record');
  let stream;
  try{stream=await this.mediaDevices.getUserMedia({audio:true,video:false});}
  catch(error){
   this.sessionType('playback');
   if(['NotAllowedError','PermissionDeniedError'].includes(error?.name))throw Error('麦克风未获授权。可以在浏览器中允许麦克风，或切换普通跟读。');
   if(error?.name==='NotFoundError')throw Error('没有找到可用的麦克风，可以切换普通跟读。');
   if(error?.name==='NotReadableError')throw Error('麦克风暂时无法使用，请结束其他录音后重试。');
   throw error;
  }
  if(token!==this.generation||!this.active){stopTracks(stream);this.sessionType('playback');throw new ShadowCancelled();}
  return stream;
 }
 async clip(token,sentence=this.current()){
  if(!sentence||!Number.isFinite(sentence.start)||!Number.isFinite(sentence.end)||sentence.end<=sentence.start)throw Error('这一句的时间轴不完整，请先校对逐字稿。');
  this.audio.pause();this.audio.playbackRate=this.prefs.rate;
  return new Promise((resolve,reject)=>{
   let timer,done=false;
   const cleanup=()=>{clearInterval(timer);for(const [name,handler] of events)this.audio.removeEventListener(name,handler);if(this.cancelPending===cancel)this.cancelPending=null;};
   const finish=error=>{if(done)return;done=true;cleanup();this.audio.pause();error?reject(error):resolve();};
   const tick=()=>{if(token!==this.generation)return finish(new ShadowCancelled());if(this.audio.currentTime>=sentence.end-.025)finish();};
   const cancel=()=>finish(new ShadowCancelled());
   const events=[['timeupdate',tick],['ended',()=>finish()],['error',()=>finish(Error('原音播放未完成，请检查音频连接。'))],['pause',()=>finish(new ShadowCancelled())]];
   this.cancelPending=cancel;for(const [name,handler] of events)this.audio.addEventListener(name,handler);
   try{this.audio.currentTime=sentence.start+.005;timer=setInterval(tick,35);Promise.resolve(this.audio.play()).catch(error=>finish(error));}catch(error){finish(error);}
  });
 }
 wait(token){
  this.phase='waiting';this.left=followSeconds(this.current(),this.prefs);const until=Date.now()+this.left*1000;this.emit();
  return new Promise((resolve,reject)=>{
   const finish=error=>{clearInterval(this.clock);this.clock=null;this.finishTurn=null;if(this.cancelPending===cancel)this.cancelPending=null;error?reject(error):resolve();};
   const cancel=()=>finish(new ShadowCancelled());this.cancelPending=cancel;this.finishTurn=()=>finish();
   this.clock=setInterval(()=>{if(token!==this.generation)return cancel();this.left=Math.max(0,(until-Date.now())/1000);if(!this.left)finish();else this.emit();},150);
  });
 }
 async record(token,options={}){
  this.phase='preparing';this.emit();const stream=await this.obtainMic(token);this.stream=stream;
  if(token!==this.generation){stopTracks(stream);throw new ShadowCancelled();}
  return new Promise((resolve,reject)=>{
   let recorder,done=false,stopping=false,started=Date.now(),safety=null;const chunks=[];let bytes=0;
   const clean=()=>{clearInterval(this.clock);clearTimeout(safety);this.clock=null;stopTracks(stream);if(this.stream===stream)this.stream=null;if(this.recorder===recorder)this.recorder=null;this.finishTurn=null;this.sessionType('playback');if(this.cancelPending===cancel)this.cancelPending=null;};
   const finish=error=>{
    if(done)return;done=true;clean();
    if(error||token!==this.generation)return reject(error||new ShadowCancelled());
    const blob=new Blob(chunks,{type:recorder.mimeType||chunks[0]?.type||'audio/mp4'});
    if(!blob.size)return reject(Error('没有录到声音，请检查麦克风权限后重试。'));
    this.discard();this.recording={blob,duration:Math.max(.1,(Date.now()-started)/1000),sentence:{...(options.sentence||this.current())},kind:options.kind||'sentence',saved:false};resolve();
   };
   const cancel=()=>{try{if(recorder?.state==='recording')recorder.stop();}catch{}finish(new ShadowCancelled());};
   const stop=()=>{if(done||stopping)return;stopping=true;stopTracks(stream);try{if(recorder.state==='recording')recorder.stop();else finish();}catch(error){finish(error);}safety=setTimeout(()=>finish(Error('录音结束未完成，请重新尝试。')),4000);};
   try{
    const mime=recordingMime(this.Recorder);recorder=new this.Recorder(stream,mime?{mimeType:mime}:undefined);this.recorder=recorder;this.cancelPending=cancel;
    recorder.ondataavailable=event=>{if(event.data?.size){chunks.push(event.data);bytes+=event.data.size;if(bytes>(options.byteLimit||20*1048576))stop();}};
    recorder.onerror=event=>finish(event.error||Error('录音未完成，请重试。'));
    recorder.onstop=()=>finish();recorder.start(1000);started=Date.now();this.phase='recording';this.left=options.seconds||followSeconds(this.current(),this.prefs);this.emit();
    this.finishTurn=stop;const until=Date.now()+this.left*1000;
    this.clock=setInterval(()=>{this.left=Math.max(0,(until-Date.now())/1000);if(!this.left)stop();else this.emit();},150);
   }catch(error){finish(error);}
  });
 }
 error(error){
  if(error instanceof ShadowCancelled)return;
  const denied=['NotAllowedError','PermissionDeniedError'].includes(error?.name);
  this.message=denied?'浏览器暂未允许播放，请再点开始跟读或回听按钮。':error?.message||'本轮未完成，请重试。';
 }
 async start(){
  this.cancel();this.message='';this.round=0;this.discard();const token=this.generation;
  try{
   if(this.prefs.mode==='record'&&!this.permissionChecked){this.phase='preparing';this.emit();const stream=await this.obtainMic(token);stopTracks(stream);this.sessionType('playback');this.permissionChecked=true;}
   while(token===this.generation&&this.active){
    this.phase='original';this.emit();await this.clip(token);if(token!==this.generation)return;
    if(this.prefs.mode==='record')await this.record(token);else await this.wait(token);
    if(token!==this.generation)return;this.round++;this.completed(this);
    if(this.prefs.repeats===0||this.round<this.prefs.repeats)continue;
    if(this.prefs.autoNext&&this.index<this.sentences.length-1){this.index++;this.round=0;this.discard();continue;}
    this.phase='review';this.left=0;this.emit();return;
   }
  }catch(error){if(token!==this.generation)return;this.error(error);this.phase='ready';this.emit();}
 }
 async playVoice(token){
  if(!this.recording?.blob)throw Error('先完成一次录音跟读。');
  if(!this.voiceURL){this.voiceURL=this.url.createObjectURL(this.recording.blob);this.voice.src=this.voiceURL;this.voice.load?.();}
  this.voice.playbackRate=1;
  return new Promise((resolve,reject)=>{
   let done=false;const finish=error=>{if(done)return;done=true;for(const [name,handler] of events)this.voice.removeEventListener(name,handler);if(this.cancelPending===cancel)this.cancelPending=null;this.voice.pause();error?reject(error):resolve();};
   const cancel=()=>finish(new ShadowCancelled()),events=[['ended',()=>finish()],['error',()=>finish(Error('录音暂时无法播放，请重录后再试。'))],['pause',cancel]];
   this.cancelPending=cancel;for(const [name,handler] of events)this.voice.addEventListener(name,handler);
   try{this.voice.currentTime=0;Promise.resolve(this.voice.play()).catch(finish);}catch(error){finish(error);}
  });
 }
 async preview(mode){
  this.cancel();this.message='';const token=this.generation;
  try{
   if(mode!=='voice'){this.phase='compare-original';this.emit();await this.clip(token);}
   if(token!==this.generation)return;
   if(mode!=='original'){this.phase='compare-voice';this.emit();await this.playVoice(token);}
  }catch(error){if(token===this.generation)this.error(error);}
  if(token===this.generation){this.phase=this.recording?'review':'ready';this.emit();}
 }
 close(){this.cancel();this.active=false;this.discard();this.audio.playbackRate=this.savedRate;this.audio.defaultPlaybackRate=this.savedDefaultRate;this.changed=()=>{};}
}
