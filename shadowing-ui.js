import {ShadowSession,shadowPreferences,SHADOW_PREFS} from './shadowing.js?v=2026.10.18.1';
import {practiceIcon,practiceAction,setPracticeAction,practiceDisplay,kanaState,bindKanaHint,practiceSave,setPracticeSave,focusPracticeTitle} from './practice-ui.js?v=2026.10.18.1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phases={ready:'准备跟读',preparing:'正在准备麦克风',original:'先听原句',waiting:'轮到你跟读',recording:'正在录下你的跟读',review:'本轮完成','compare-original':'对照 · 原音','compare-voice':'对照 · 我的录音'};
const busyPhases=['preparing','original','waiting','recording','compare-original','compare-voice'];
export function openShadowing(ctx){
 const panel=document.createElement('dialog');panel.className='shadowing-mode unified-practice';panel.setAttribute('aria-label','逐句跟读');
 panel.innerHTML=`<header class="shadow-top"><h2 class="practice-heading" tabindex="-1">逐句跟读</h2><div><button id="shadow-full-reading">全文朗读</button><button id="shadow-options" aria-label="跟读设置" aria-expanded="false">${practiceIcon('settings')}</button><button id="shadow-close" aria-label="退出跟读">${practiceIcon('close')}</button></div></header>
 <div class="practice-modes" role="group" aria-label="练习方式"><button data-shadow-mode="listen">普通跟读</button><button data-shadow-mode="record">录音对照</button></div>
 <div class="shadow-settings" id="shadow-settings" hidden><label>原音倍速<select id="shadow-rate" aria-label="原音倍速">${[.75,.85,1,1.15,1.25].map(n=>`<option value="${n}">${n}×</option>`).join('')}</select></label><label>跟读时间<select id="shadow-factor" aria-label="跟读时间">${[1,1.5,2].map(n=>`<option value="${n}">原句时长 × ${n}</option>`).join('')}</select></label><label>每句重复<select id="shadow-repeats" aria-label="每句重复"><option value="1">1 次</option><option value="2">2 次</option><option value="3">3 次</option><option value="0">无限</option></select></label><label class="checkbox-line"><input type="checkbox" id="shadow-next-auto">完成后自动下一句</label><label class="checkbox-line"><input type="checkbox" id="shadow-mask">跟读时遮盖原文与译文</label><p class="note">设置自动保存。录音需允许麦克风；未保留的录音在换句或退出后清除。同一句只保留最新一遍。</p></div>
 <div class="shadow-status"><div class="practice-status-main"><span id="shadow-phase" role="status" aria-live="polite"></span>${practiceSave('shadow')}</div><div class="practice-position"><span id="shadow-round"></span><span id="shadow-counter"></span></div></div>
 <main class="shadow-body"><div class="practice-sentence-meta"><div><small id="shadow-title"></small><time id="shadow-time"></time></div><button id="shadow-cover-toggle" class="practice-mask" aria-pressed="false">${practiceIcon('cover')}<span>遮盖</span></button></div><div id="shadow-source" class="source"></div><button class="shadow-cover" id="shadow-cover" aria-label="显示跟读原文与译文" hidden><i></i><i></i><i></i></button><p id="shadow-translation" class="translation"></p><p id="shadow-countdown" class="shadow-countdown" aria-hidden="true" hidden></p><p id="shadow-message" class="note" role="status" hidden></p></main>
 <footer class="shadow-bottom">${practiceDisplay('data-shadow-display','shadow-reading-toggle')}<div class="shadow-review practice-review"><button id="shadow-original">${practiceIcon('play')}原音</button><button id="shadow-voice">${practiceIcon('headphones')}我的录音</button><button id="shadow-compare">${practiceIcon('compare')}交替对照</button></div><div class="practice-transport">${practiceAction('shadow-previous','上一句','previous')}${practiceAction('shadow-start','开始跟读','play',true)}${practiceAction('shadow-next','下一句','next')}</div></footer>`;
 const voice=document.createElement('audio');voice.preload='metadata';voice.setAttribute('playsinline','');panel.append(voice);document.body.append(panel);
 const q=selector=>panel.querySelector(selector),events=new AbortController(),on=(selector,name,fn)=>q(selector).addEventListener(name,fn,{signal:events.signal});
 let display,readings=typeof ctx.prefs?.reading==='boolean'?ctx.prefs.reading:ctx.reading!==false,revealed=false,saveBusy=false,disposed=false,lastPhase='',lastIndex=-1,controller,writes=Promise.resolve();
 const persist=()=>{const value={...controller.prefs};writes=writes.then(()=>ctx.write('settings',{id:SHADOW_PREFS,value})).catch(ctx.report);};
 function render(){
  if(disposed||!controller)return;const s=controller.current(),phase=controller.phase,busy=busyPhases.includes(phase),recording=controller.recording;
  if(lastIndex!==controller.index||phase==='original'&&lastPhase!=='original')revealed=false;
  if((phase==='review'||phase.startsWith('compare-'))&&lastPhase!==phase)revealed=true;
  panel.dataset.phase=phase;panel.dataset.display=display;
  q('#shadow-counter').textContent=`${controller.index+1} / ${controller.sentences.length}`;
  q('#shadow-title').textContent=ctx.source.title;q('#shadow-time').textContent=ctx.time(s.start);
  q('#shadow-phase').textContent=phases[phase]||'逐句跟读';q('#shadow-round').textContent=controller.round?`已跟读 ${controller.round} 遍`:'';
  if(q('#shadow-source').dataset.index!==String(controller.index)){q('#shadow-source').innerHTML=ctx.renderSentence(s);q('#shadow-source').dataset.index=String(controller.index);}
  q('#shadow-source').lang=ctx.source.language;q('#shadow-source').classList.toggle('shadow-no-reading',!readings);
  const onlyTranslation=display==='translation',masked=controller.prefs.mask&&!revealed&&!onlyTranslation;
  panel.classList.toggle('shadow-only-translation',onlyTranslation);
  q('#shadow-source').hidden=onlyTranslation||masked;q('#shadow-cover').hidden=!masked;q('#shadow-translation').textContent=s.translation||'';q('#shadow-translation').hidden=display==='source'||masked||!s.translation;
  const counting=['waiting','recording'].includes(phase);q('#shadow-countdown').hidden=!counting;q('#shadow-countdown').textContent=counting?Math.ceil(controller.left)+' 秒':'';
  q('#shadow-message').textContent=controller.message||(onlyTranslation&&!s.translation?'这句还没有译文，可先补充译文。':'');q('#shadow-message').hidden=!q('#shadow-message').textContent;
  for(const button of panel.querySelectorAll('[data-shadow-display]'))button.setAttribute('aria-pressed',String(button.dataset.shadowDisplay===display));
  for(const button of panel.querySelectorAll('[data-shadow-mode]')){button.setAttribute('aria-pressed',String(button.dataset.shadowMode===controller.prefs.mode));button.disabled=busy;}
  kanaState(q('#shadow-reading-toggle'),readings);q('#shadow-reading-toggle').hidden=ctx.source.language!=='ja';
  q('#shadow-cover-toggle').setAttribute('aria-pressed',String(controller.prefs.mask));q('#shadow-cover-toggle').disabled=onlyTranslation;q('#shadow-mask').checked=controller.prefs.mask;
  setPracticeAction(q('#shadow-start'),['waiting','recording'].includes(phase)?'完成跟读':busy?'停止本轮':phase==='review'?'再练一次':'开始跟读',busy?'stop':'play');
  for(const id of ['#shadow-original','#shadow-voice','#shadow-compare'])q(id).disabled=busy;
  q('#shadow-voice').disabled=busy||!recording;q('#shadow-compare').disabled=busy||!recording;
  q('#shadow-previous').disabled=controller.index<=0;q('#shadow-next').disabled=controller.index>=controller.sentences.length-1;
  setPracticeSave(panel,'shadow',recording,busy,saveBusy);
  lastPhase=phase;lastIndex=controller.index;
 }
 const closed=()=>{if(disposed)return;disposed=true;controller.close();events.abort();panel.close();panel.remove();ctx.closed();};
 controller=new ShadowSession({audio:ctx.audio,voice,sentences:ctx.sentences,index:ctx.index,prefs:ctx.prefs,changed:render,...ctx.capture,
  completed:session=>{const key='shadow-progress/'+ctx.source.id,index=session.index,start=session.current().start;ctx.markComplete?.({key,index,start});}});
 display=controller.prefs.display||(controller.prefs.onlyTranslation?'translation':ctx.translation===false?'source':'both');
 for(const [id,key] of [['#shadow-rate','rate'],['#shadow-factor','factor'],['#shadow-repeats','repeats']])q(id).value=String(controller.prefs[key]);
 q('#shadow-next-auto').checked=controller.prefs.autoNext;q('#shadow-mask').checked=controller.prefs.mask;
 function configure(patch={}){revealed=false;controller.configure(shadowPreferences({...controller.prefs,rate:q('#shadow-rate').value,factor:q('#shadow-factor').value,repeats:q('#shadow-repeats').value,autoNext:q('#shadow-next-auto').checked,mask:q('#shadow-mask').checked,...patch}));persist();render();}
 for(const id of ['#shadow-rate','#shadow-factor','#shadow-repeats','#shadow-next-auto','#shadow-mask'])on(id,'change',()=>configure());
 for(const button of panel.querySelectorAll('[data-shadow-mode]'))button.addEventListener('click',()=>configure({mode:button.dataset.shadowMode}),{signal:events.signal});
 for(const button of panel.querySelectorAll('[data-shadow-display]'))button.addEventListener('click',()=>{display=button.dataset.shadowDisplay;controller.prefs.display=display;controller.prefs.onlyTranslation=display==='translation';persist();render();},{signal:events.signal});
 on('#shadow-options','click',()=>{const show=q('#shadow-settings').hidden;q('#shadow-settings').hidden=!show;q('#shadow-options').setAttribute('aria-expanded',String(show));});
 q('#shadow-full-reading').hidden=!ctx.switchMode;on('#shadow-full-reading','click',()=>{closed();ctx.switchMode?.('full');});
 on('#shadow-close','click',closed);panel.addEventListener('cancel',event=>{event.preventDefault();closed();},{signal:events.signal});
 on('#shadow-start','click',()=>{if(controller.finishTurn)controller.finishTurn();else if(busyPhases.includes(controller.phase))controller.cancel();else controller.start();});
 on('#shadow-original','click',()=>controller.preview('original'));on('#shadow-voice','click',()=>controller.preview('voice'));on('#shadow-compare','click',()=>controller.preview('compare'));
 on('#shadow-previous','click',()=>controller.move(controller.index-1));on('#shadow-next','click',()=>controller.move(controller.index+1));
 bindKanaHint(q('#shadow-reading-toggle'),ctx.toast,events.signal);
 on('#shadow-reading-toggle','click',()=>{readings=!readings;controller.prefs.reading=readings;persist();render();});
 on('#shadow-cover','click',()=>{revealed=true;render();});on('#shadow-source','click',()=>{if(controller.prefs.mask){revealed=false;render();}});
 on('#shadow-cover-toggle','click',()=>configure({mask:!controller.prefs.mask}));
 on('#shadow-save','click',async()=>{saveBusy=true;render();const recording=controller.recording;try{await ctx.recordings.save(ctx.source,recording);if(controller.recording===recording)recording.saved=true;ctx.toast('跟读录音已保留在本机');}catch(error){ctx.report(error);}finally{saveBusy=false;render();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&busyPhases.includes(controller.phase)){controller.cancel();controller.message='练习已暂停，返回后可重新开始。';render();}},{signal:events.signal});
 window.addEventListener('pagehide',()=>controller.cancel(),{signal:events.signal});
 panel.showModal();render();focusPracticeTitle(panel);return {controller,close:closed};
}

export async function showShadowRecordings(ctx){
 await ctx.recordings.saving;
 let rows=await ctx.recordings.list(),disposed=false,url=null;const voice=document.createElement('audio');voice.controls=true;voice.preload='metadata';voice.hidden=true;
 ctx.open('跟读录音',`<div class="shadow-recordings"><p id="shadow-storage-summary"></p><p class="note">仅包含你点过“保留本遍”的录音，保存在当前设备，不参与共享书库同步。单句与全文录音分别保存，各自保留最新一遍。</p><div id="shadow-recording-player"></div><div id="shadow-recording-list"></div><details id="shadow-clear-panel"><summary>清空已保留录音</summary><p class="note">只清理跟读录音，原音频和学习资料保留。</p><button class="danger full" id="shadow-clear-all">确认清空跟读录音</button></details></div>`);
 const root=ctx.modal.querySelector('.shadow-recordings'),q=selector=>root.querySelector(selector);q('#shadow-recording-player').append(voice);
 const cleanup=()=>{voice.pause();voice.hidden=true;voice.removeAttribute('src');voice.load();if(url)URL.revokeObjectURL(url);url=null;};
 function render(){
  if(disposed||!root.isConnected)return;
  q('#shadow-storage-summary').textContent=`${rows.length} 份录音 · ${ctx.size(rows.reduce((sum,row)=>sum+row.blob.size,0))} / 50 MB`;
  q('#shadow-clear-panel').hidden=!rows.length;
  q('#shadow-recording-list').innerHTML=rows.length?rows.map(row=>`<article class="shadow-recording-row"><strong>${esc(row.text)}</strong><small>${esc(row.title)} · ${ctx.time(row.start)}</small><div class="actions"><button class="secondary" data-recording-play="${esc(row.id)}">▶ 回听</button><button class="secondary" data-recording-export="${esc(row.id)}">导出</button><button class="danger" data-recording-delete="${esc(row.id)}">删除</button></div></article>`).join(''):'<p class="note">还没有保留的跟读录音。</p>';
  root.querySelectorAll('[data-recording-play]').forEach(button=>button.onclick=()=>{const row=rows.find(row=>row.id===button.dataset.recordingPlay);cleanup();url=URL.createObjectURL(row.blob);voice.src=url;voice.hidden=false;voice.play().catch(ctx.report);});
  root.querySelectorAll('[data-recording-export]').forEach(button=>button.onclick=()=>{const row=rows.find(row=>row.id===button.dataset.recordingExport),ext=row.blob.type.includes('mp4')?'m4a':row.blob.type.includes('ogg')?'ogg':row.blob.type.includes('wav')?'wav':'webm';ctx.download(row.blob,`${row.title}-跟读-${Math.round(row.start)}.${ext}`);});
  root.querySelectorAll('[data-recording-delete]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{cleanup();await ctx.recordings.delete(button.dataset.recordingDelete);rows=await ctx.recordings.list();render();}catch(error){ctx.report(error);button.disabled=false;}});
 }
 q('#shadow-clear-all').onclick=async event=>{event.target.disabled=true;try{cleanup();await ctx.recordings.clear();rows=[];render();}catch(error){ctx.report(error);event.target.disabled=false;}};
 render();return ()=>{disposed=true;cleanup();};
}
