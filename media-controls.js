// Platform controls support track navigation, but no custom Like action.
export class MediaControls{
 constructor({session,getAudio,play,pause,seek,switchTrack,report=()=>{},now=()=>Date.now()}){
  Object.assign(this,{session,getAudio,play,pause,seek,switchTrack,report,now});this.pending=Promise.resolve();this.lastPosition=-Infinity;this.state='';
  this.handlers={play:()=>{if(this.getAudio()?.paused)this.play();},pause:this.pause,seekto:details=>{if(Number.isFinite(details.seekTime))this.seek(details.seekTime);},previoustrack:()=>this.track(-1),nexttrack:()=>this.track(1)};
  this.install();
 }
 install(){
  if(!this.session)return;
  // Explicitly disable default short skips so platforms can prefer track buttons.
  for(const name of ['seekbackward','seekforward','stop'])try{this.session.setActionHandler(name,null);}catch{}
  for(const [name,handler] of Object.entries(this.handlers))try{this.session.setActionHandler(name,handler);}catch{}
 }
 track(direction){this.pending=this.pending.catch(()=>{}).then(()=>this.switchTrack(direction)).catch(this.report);return this.pending;}
 sync(force=false){
  if(!this.session)return;const audio=this.getAudio();if(!audio)return;
  const state=audio.paused?'paused':'playing';
  if(state!==this.state){this.state=state;try{this.session.playbackState=state;}catch{}this.install();force=true;}
  const now=this.now();if(!force&&now-this.lastPosition<1000)return;this.lastPosition=now;
  const duration=audio.duration,rate=audio.playbackRate,position=audio.currentTime;
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(position)||!Number.isFinite(rate)||rate<=0){try{this.session.setPositionState?.();}catch{}return;}
  try{this.session.setPositionState?.({duration,playbackRate:rate,position:Math.max(0,Math.min(duration,position))});}catch{}
 }
 setMetadata(value,Metadata=globalThis.MediaMetadata){
  if(!this.session||!Metadata)return;
  try{this.session.metadata=new Metadata(value);}catch{}
  this.install();this.lastPosition=-Infinity;this.sync(true);
 }
}
