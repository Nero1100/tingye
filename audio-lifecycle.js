// Keep one activated media element for normal iPhone track changes.
export function releaseAudio(audio,revoke=URL.revokeObjectURL,url){
 audio.onloadedmetadata=null;
 audio.pause();
 audio.removeAttribute('src');
 for(const source of audio.querySelectorAll?.('source')||[])source.remove();
 audio.load();
 if(url)revoke(url);
}
export function configureAudio(audio,rate,navigatorObject=globalThis.navigator){
 const speed=Number(rate)||1;audio.defaultPlaybackRate=speed;audio.playbackRate=speed;
 audio.muted=false;
 try{if(navigatorObject?.audioSession)navigatorObject.audioSession.type='playback';}catch{}
}
export function bindAudioEvents(audio,isCurrent,handlers){
 const removers=[];
 for(const [event,handler] of Object.entries(handlers)){
  const listener=e=>{if(isCurrent(audio))handler(e);};
  audio.addEventListener(event,listener);removers.push(()=>audio.removeEventListener(event,listener));
 }
 return ()=>removers.forEach(remove=>remove());
}
