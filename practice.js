// A single cancelable timer owns sentence repetition; clip playback takes priority.
export class Practice {
  constructor(audio, changed=()=>{}) { this.audio=audio; this.changed=()=>{}; this.cancel(); this.changed=changed; }
  cancel() { clearTimeout(this.timer); this.timer=null; this.index=-1; this.completed=0; this.waiting=false; this.enabled=false; this.generation=(this.generation||0)+1; this.changed?.(this); }
  start(index) { this.cancel(); this.index=index; this.enabled=true; this.changed(this); }
  tick(segments, prefs, force=false) {
    if (!this.enabled || this.waiting || this.audio.paused&&!force) return;
    const s=segments[this.index];
    if (!s || !force && this.audio.currentTime<s.end-.025) return;
    this.completed++; this.waiting=true; this.audio.pause();
    const more=prefs.repeats===0 || this.completed<prefs.repeats;
    const next=more?this.index:this.index+1;
    if (!segments[next] || (!more&&prefs.pause)) { this.enabled=false; this.waiting=false; this.changed(this); return; }
    const generation=this.generation;
    this.changed(this);
    this.timer=setTimeout(()=>{
      if (generation!==this.generation) return;
      this.waiting=false;
      if (next!==this.index) { this.index=next; this.completed=0; }
      this.audio.currentTime=segments[next].start+.005; this.changed(this);
      this.audio.play().catch(()=>this.cancel());
    },prefs.gap*1000);
  }
}

export function practiceOptions(prefs){return prefs.sentenceLoop?{...prefs,repeats:0,gap:0,pause:false}:prefs;}
