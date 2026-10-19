import {ShadowSession} from './shadowing.js?v=2026.10.19.1';
import {practiceIcon,practiceAction,setPracticeAction,practiceDisplay,kanaState,bindKanaHint,practiceSave,setPracticeSave,focusPracticeTitle} from './practice-ui.js?v=2026.10.19.1';

export const FULL_READING_PREFS='full-reading-preferences-v1',FULL_RECORD_SECONDS=3600;
export function fullReadingPreferences(value={}){
 value=value&&typeof value==='object'?value:{};
 return {mode:value.mode==='self'?'self':'listen',display:['both','source','translation'].includes(value.display)?value.display:'both',
  reading:value.reading!==false,size:[1,2,3].includes(value.size)?value.size:2,rate:[.75,.85,1,1.15,1.25].includes(Number(value.rate))?Number(value.rate):1};
}
export class FullReadingSession extends ShadowSession{
 constructor(options){
  super(options);this.title=options.title||'';this.resumeAt=null;this.finished=false;
  this.track=()=>{if(!['original','sample','compare-original'].includes(this.phase))return;
   const t=this.audio.currentTime;let next=0;for(let i=0;i<this.sentences.length;i++){if(this.sentences[i].start>t+.025)break;next=i;}
   if(next!==this.index){this.index=next;this.emit();}
  };this.audio.addEventListener('timeupdate',this.track);
 }
 range(){return {start:this.sentences[0].start,end:this.sentences.at(-1).end};}
 clip(token){return super.clip(token,this.range());}
 async listen(index){
  if(['recording','preparing'].includes(this.phase))return;
  let start=Number.isInteger(index)?this.sentences[index]?.start:this.finished?this.range().start:this.resumeAt??this.sentences[this.index].start;
  if(!Number.isFinite(start)||start>=this.range().end-.03)start=this.range().start;
  this.cancel();this.message='';this.finished=false;this.resumeAt=null;const token=this.generation;
  try{this.phase='original';this.emit();await super.clip(token,{start,end:this.range().end});if(token!==this.generation)return;this.finished=true;this.phase='review';this.emit();}
  catch(error){if(token!==this.generation)return;this.error(error);this.phase='ready';this.emit();}
 }
 pause(){if(this.phase==='original')this.resumeAt=this.audio.currentTime;this.cancel();}
 async sample(index){
  if(['recording','preparing'].includes(this.phase))return;
  this.cancel();this.message='';const token=this.generation;this.index=index;this.resumeAt=null;this.finished=false;
  try{this.phase='sample';this.emit();await super.clip(token,this.current());}catch(error){if(token===this.generation)this.error(error);}
  if(token===this.generation){this.phase=this.recording?'review':'ready';this.emit();}
 }
 async startRecording(){
  if(['recording','preparing'].includes(this.phase))return;
  this.cancel();this.discard();this.message='';const token=this.generation;
  try{await this.record(token,{seconds:FULL_RECORD_SECONDS,byteLimit:40*1048576,kind:'full',sentence:{...this.range(),text:'全文朗读 · '+this.title}});
   if(token!==this.generation)return;this.phase='review';this.message='';this.emit();
  }catch(error){if(token!==this.generation)return;this.error(error);this.phase='ready';this.emit();}
 }
 close(){this.audio.removeEventListener('timeupdate',this.track);super.close();}
}

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={ready:'准备朗读',original:'跟着原音读',sample:'原句示范',preparing:'正在准备麦克风',recording:'正在录下你的朗读',review:'本轮完成','compare-original':'回听 · 原音','compare-voice':'回听 · 我的录音'};
export function openFullReading(ctx){
 let prefs=fullReadingPreferences(ctx.fullPrefs),disposed=false,controller,saving=false,follow=true,lastIndex=-1,lastCapture=null,displayDirty=true,scrollTimer,positionWrites=Promise.resolve(),prefWrites=Promise.resolve();
 const revealed=new Set(),positionKey='full-reading-position/'+ctx.source.id,panel=document.createElement('dialog');
 panel.className='shadowing-mode full-reading-mode unified-practice';panel.setAttribute('aria-label','全文朗读');
 panel.innerHTML=`<header class="shadow-top"><h2 class="practice-heading" tabindex="-1">全文朗读</h2><div><button id="full-sentence-mode">逐句跟读</button><button id="full-settings-toggle" aria-label="全文朗读设置" aria-expanded="false">${practiceIcon('settings')}</button><button id="full-close" aria-label="退出全文朗读">${practiceIcon('close')}</button></div></header>
 <div class="full-mode-select practice-modes" role="group" aria-label="全文练习方式"><button data-full-mode="listen">跟着原音读</button><button data-full-mode="self">自己朗读</button></div>
 <div id="full-settings" class="shadow-settings" hidden><label>原音倍速<select id="full-rate" aria-label="全文原音倍速">${[.75,.85,1,1.15,1.25].map(n=>`<option value="${n}">${n}×</option>`).join('')}</select></label><div class="full-size"><span>字号</span><button id="full-smaller" aria-label="减小全文字号">A−</button><button id="full-larger" aria-label="增大全文字号">A＋</button></div><label class="checkbox-line" id="full-reading-label"><input id="full-reading-toggle" type="checkbox">显示假名</label><p class="note">设置与阅读位置自动保留。录音仅在本机处理，切到后台会结束录音；未保留录音退出后清除，同一篇保留最新一遍。单次最多 60 分钟或 40 MB。</p></div>
 <div class="full-title">${escape(ctx.source.title)}</div><div class="shadow-status"><div class="practice-status-main"><span id="full-phase" role="status" aria-live="polite"></span>${practiceSave('full')}</div><span id="full-counter"></span></div>
 <section id="full-text" class="full-reading-text" aria-label="全文逐字稿">${ctx.sentences.map((s,i)=>`<article class="full-sentence" data-full-sentence="${i}"><div class="full-sentence-head"><time>${ctx.time(s.start)}</time><button data-full-sample="${i}" aria-label="听第 ${i+1} 句示范">▶ 示范</button></div><div class="source" lang="${escape(ctx.source.language)}">${ctx.renderSentence(s)}</div><p class="translation ${s.translation?'':'missing-translation'}">${escape(s.translation||'这句还没有译文')}</p><button data-full-reveal="${i}" aria-expanded="false">展开原文</button></article>`).join('')}</section>
 <footer class="full-footer"><button id="full-follow" hidden>回到播放位置 ↓</button>${practiceDisplay('data-full-display','full-reading-button')}<p class="full-message note" id="full-message" role="status"></p><div class="full-main-controls practice-transport">${practiceAction('full-original-play','原音','play')}${practiceAction('full-primary','开始听读','play',true)}${practiceAction('full-recording-play','我的录音','headphones')}</div></footer>`;
 const voice=document.createElement('audio');voice.preload='metadata';voice.setAttribute('playsinline','');panel.append(voice);document.body.append(panel);
 const q=s=>panel.querySelector(s),rows=[...panel.querySelectorAll('.full-sentence')],events=new AbortController(),on=(target,event,fn)=>target.addEventListener(event,fn,{signal:events.signal});
 const text=q('#full-text');
 const report=error=>{if(!disposed)ctx.report(error);};
 const savePrefs=()=>{const value={...prefs};prefWrites=prefWrites.then(()=>ctx.write('settings',{id:FULL_READING_PREFS,value})).catch(report);};
 function remember(){
  const top=text.getBoundingClientRect().top,row=rows.find(row=>row.getBoundingClientRect().bottom>top+8)||rows.at(-1),index=Number(row?.dataset.fullSentence)||0;
  const value={scrollTop:text.scrollTop,index,start:ctx.sentences[index]?.start||0,count:rows.length};
  positionWrites=positionWrites.then(()=>ctx.write('settings',{id:positionKey,value})).catch(error=>console.warn(error.message));
 }
 function scrollCurrent(){const row=rows[controller.index];if(row)text.scrollTo({top:Math.max(0,row.getBoundingClientRect().top-text.getBoundingClientRect().top+text.scrollTop-16),behavior:'auto'});}
 function render(){
  if(disposed||!controller)return;const phase=controller.phase,capture=['preparing','recording'].includes(phase),busy=['original','sample','compare-original','compare-voice'].includes(phase);
  panel.dataset.phase=phase;panel.dataset.display=prefs.display;panel.dataset.size=prefs.size;panel.classList.toggle('full-no-reading',!prefs.reading);
  q('#full-phase').textContent=labels[phase]||'全文朗读';q('#full-counter').textContent=phase==='recording'?ctx.time(FULL_RECORD_SECONDS-controller.left):`${controller.index+1} / ${rows.length}`;
  for(const button of panel.querySelectorAll('[data-full-mode]')){button.setAttribute('aria-pressed',String(button.dataset.fullMode===prefs.mode));button.disabled=capture;}
  for(const button of panel.querySelectorAll('[data-full-display]'))button.setAttribute('aria-pressed',String(button.dataset.fullDisplay===prefs.display));
  if(displayDirty)for(let i=0;i<rows.length;i++){
   const row=rows[i],showSource=prefs.display!=='translation'||revealed.has(i);
   row.querySelector('.source').hidden=!showSource;row.querySelector('.translation').hidden=prefs.display==='source';
   const reveal=row.querySelector('[data-full-reveal]');reveal.hidden=prefs.display!=='translation';reveal.textContent=revealed.has(i)?'收起原文':'展开原文';reveal.setAttribute('aria-expanded',String(revealed.has(i)));
  }
  displayDirty=false;
  panel.classList.toggle('full-capturing',capture);
  if(lastCapture!==capture){for(const button of panel.querySelectorAll('[data-full-sample]'))button.disabled=capture;lastCapture=capture;}
  if(lastIndex!==controller.index){rows[lastIndex]?.classList.remove('is-current');rows[controller.index]?.classList.add('is-current');}
  const primaryLabel=phase==='preparing'?'取消准备':phase==='recording'?'完成录音':busy?'暂停':prefs.mode==='self'?'开始录音':controller.finished?'从头听读':controller.resumeAt!==null?'继续听读':'开始听读';
  setPracticeAction(q('#full-primary'),primaryLabel,phase==='recording'||phase==='preparing'?'stop':busy?'pause':prefs.mode==='self'?'mic':'play');
  kanaState(q('#full-reading-button'),prefs.reading);q('#full-reading-toggle').checked=prefs.reading;
  q('#full-recording-play').disabled=capture||!controller.recording;q('#full-original-play').disabled=capture;
  setPracticeSave(panel,'full',controller.recording,capture||busy,saving);
  q('#full-message').textContent=controller.message;
  q('#full-follow').hidden=follow||!busy;q('#full-smaller').disabled=prefs.size<=1;q('#full-larger').disabled=prefs.size>=3;
  if(lastIndex!==controller.index&&follow&&['original','compare-original'].includes(phase))scrollCurrent();lastIndex=controller.index;
 }
 controller=new FullReadingSession({audio:ctx.audio,voice,sentences:ctx.sentences,index:ctx.index,title:ctx.source.title,prefs:{rate:prefs.rate},changed:render,...ctx.capture});
 function close(){
  if(disposed)return;clearTimeout(scrollTimer);remember();disposed=true;controller.close();events.abort();panel.close();panel.remove();ctx.closed();
 }
 function stopCapture(){if(controller.phase==='recording')controller.finishTurn?.();else if(controller.phase==='preparing')controller.cancel();}
 q('#full-rate').value=String(prefs.rate);q('#full-reading-toggle').checked=prefs.reading;q('#full-reading-label').hidden=ctx.source.language!=='ja';q('#full-reading-button').hidden=ctx.source.language!=='ja';
 on(q('#full-close'),'click',close);on(panel,'cancel',event=>{event.preventDefault();close();});
 on(q('#full-sentence-mode'),'click',()=>{close();ctx.switchMode?.('sentence');});
 on(q('#full-settings-toggle'),'click',()=>{q('#full-settings').hidden=!q('#full-settings').hidden;q('#full-settings-toggle').setAttribute('aria-expanded',String(!q('#full-settings').hidden));});
 for(const button of panel.querySelectorAll('[data-full-mode]'))on(button,'click',()=>{controller.pause();prefs.mode=button.dataset.fullMode;savePrefs();render();});
 for(const button of panel.querySelectorAll('[data-full-display]'))on(button,'click',()=>{prefs.display=button.dataset.fullDisplay;displayDirty=true;savePrefs();render();remember();});
 for(const button of panel.querySelectorAll('[data-full-reveal]'))on(button,'click',()=>{const i=Number(button.dataset.fullReveal);revealed.has(i)?revealed.delete(i):revealed.add(i);displayDirty=true;render();});
 for(const button of panel.querySelectorAll('[data-full-sample]'))on(button,'click',()=>{follow=false;controller.sample(Number(button.dataset.fullSample));});
 for(const [id,delta] of [['#full-smaller',-1],['#full-larger',1]])on(q(id),'click',()=>{prefs.size=Math.min(3,Math.max(1,prefs.size+delta));savePrefs();render();});
 bindKanaHint(q('#full-reading-button'),ctx.toast,events.signal);
 on(q('#full-reading-button'),'click',()=>{prefs.reading=!prefs.reading;savePrefs();render();});
 on(q('#full-reading-toggle'),'change',()=>{prefs.reading=q('#full-reading-toggle').checked;savePrefs();render();});
 on(q('#full-rate'),'change',()=>{prefs.rate=Number(q('#full-rate').value);controller.prefs.rate=prefs.rate;if(!ctx.audio.paused)ctx.audio.playbackRate=prefs.rate;savePrefs();});
 on(q('#full-primary'),'click',()=>{
  if(controller.phase==='recording')controller.finishTurn?.();else if(controller.phase==='preparing')controller.cancel();
  else if(['original','sample','compare-original','compare-voice'].includes(controller.phase))controller.pause();
  else if(prefs.mode==='self')controller.startRecording();else{follow=true;controller.listen();}
 });
 on(q('#full-original-play'),'click',()=>{follow=true;controller.preview('original');});on(q('#full-recording-play'),'click',()=>controller.preview('voice'));
 on(q('#full-follow'),'click',()=>{follow=true;scrollCurrent();render();});
 on(q('#full-save'),'click',async()=>{const recording=controller.recording;saving=true;render();try{await ctx.recordings.save(ctx.source,recording);if(controller.recording===recording)recording.saved=true;ctx.toast('全文朗读录音已保留在本机');}catch(error){report(error);}finally{saving=false;render();}});
 for(const name of ['touchstart','wheel','pointerdown'])on(text,name,()=>{follow=false;render();});
 on(text,'keydown',event=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)){follow=false;render();}});
 on(text,'scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(remember,300);});
 on(document,'visibilitychange',()=>{if(!document.hidden)return;remember();if(controller.phase==='recording'){controller.message='已结束后台前的录音，本遍可回听或保留。';stopCapture();}else if(controller.phase==='preparing')controller.cancel();else controller.pause();});
 on(window,'pagehide',()=>{remember();controller.cancel();});
 // Re-anchor by timestamp if a revised transcript has a different sentence count.
 if(ctx.position&&Number.isFinite(ctx.position.start)){const index=ctx.sentences.findIndex(s=>s.end>ctx.position.start);if(index>=0)controller.index=index;}
 panel.showModal();render();
 if(ctx.position&&Number.isFinite(ctx.position.scrollTop)&&ctx.position.count===rows.length)text.scrollTop=ctx.position.scrollTop;
 else scrollCurrent();
 focusPracticeTitle(panel);return {controller,close};
}
