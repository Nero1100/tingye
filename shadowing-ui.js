import {ShadowSession,shadowPreferences,SHADOW_PREFS} from './shadowing.js?v=2026.10.16.3';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phases={ready:'准备跟读',preparing:'正在准备麦克风',original:'先听原句',waiting:'轮到你跟读',recording:'正在录下你的跟读',review:'本轮完成', 'compare-original':'对照 · 原音','compare-voice':'对照 · 我的录音'};
const busyPhases=['preparing','original','waiting','recording','compare-original','compare-voice'];
export function openShadowing(ctx){
 const panel=document.createElement('dialog');panel.className='shadowing-mode';panel.setAttribute('aria-label','逐句跟读');
 panel.innerHTML=`<header class="shadow-top"><span id="shadow-counter"></span><div><button id="shadow-options" aria-label="跟读设置" aria-expanded="false">设置</button><button id="shadow-close" aria-label="退出跟读">×</button></div></header>
 <div class="shadow-settings" id="shadow-settings" hidden><label>练习方式<select id="shadow-mode" aria-label="练习方式"><option value="listen">普通跟读</option><option value="record">录音对照</option></select></label><label>原音倍速<select id="shadow-rate" aria-label="原音倍速">${[.75,.85,1,1.15,1.25].map(n=>`<option value="${n}">${n}×</option>`).join('')}</select></label><label>跟读时间<select id="shadow-factor" aria-label="跟读时间">${[1,1.5,2].map(n=>`<option value="${n}">原句时长 × ${n}</option>`).join('')}</select></label><label>每句重复<select id="shadow-repeats" aria-label="每句重复"><option value="1">1 次</option><option value="2">2 次</option><option value="3">3 次</option><option value="0">无限</option></select></label><label class="checkbox-line"><input type="checkbox" id="shadow-next-auto">完成后自动下一句</label><label class="checkbox-line"><input type="checkbox" id="shadow-mask">跟读时遮盖原文与译文</label><p class="note">设置自动保存。录音需允许麦克风；未保留的录音在换句或退出后清除。同一句只保留最新一遍。</p></div>
 <div class="shadow-status"><span id="shadow-phase" role="status" aria-live="polite"></span><span id="shadow-round"></span></div>
 <main class="shadow-body"><small id="shadow-title"></small><time id="shadow-time"></time><div id="shadow-source" class="source"></div><button class="shadow-cover" id="shadow-cover" aria-label="显示跟读原文" hidden><i></i><i></i><i></i><span>点一下显示原文</span></button><p id="shadow-translation" class="translation"></p><p id="shadow-countdown" class="shadow-countdown" aria-hidden="true"></p><p id="shadow-message" class="note" role="status"></p></main>
 <footer class="shadow-bottom"><div class="shadow-display"><button id="shadow-translation-toggle" aria-pressed="true">译文</button><button id="shadow-reading-toggle" aria-pressed="true">读音</button><button id="shadow-cover-toggle" aria-pressed="false">遮盖</button><button id="shadow-only-translation" aria-pressed="false">只显示译文</button></div><div class="shadow-review"><button id="shadow-original">▶ 原音</button><button id="shadow-voice">▶ 我的录音</button><button id="shadow-compare">⇄ 交替对照</button></div><div class="shadow-transport"><button id="shadow-previous" aria-label="上一句跟读">上一句</button><button class="primary" id="shadow-start">开始跟读</button><button id="shadow-next" aria-label="下一句跟读">下一句</button></div><button id="shadow-save" class="secondary" hidden>保留本遍录音</button><p class="shadow-local-note" id="shadow-local-note">听原句，然后留出时间复述。</p></footer>`;
 const voice=document.createElement('audio');voice.preload='metadata';voice.setAttribute('playsinline','');panel.append(voice);document.body.append(panel);
 const q=selector=>panel.querySelector(selector),events=new AbortController(),on=(selector,name,fn)=>q(selector).addEventListener(name,fn,{signal:events.signal});
 let translations=ctx.translation!==false,readings=ctx.reading!==false,revealed=false,saveBusy=false,disposed=false,lastPhase='',lastIndex=-1,controller;
 const persist=()=>ctx.write('settings',{id:SHADOW_PREFS,value:controller.prefs}).catch(ctx.report);
 function render(){
  if(disposed||!controller)return;const s=controller.current(),phase=controller.phase,busy=busyPhases.includes(phase),recording=controller.recording;
  if(lastIndex!==controller.index||phase==='original'&&lastPhase!=='original')revealed=false;
  if((phase==='review'||phase.startsWith('compare-'))&&lastPhase!==phase)revealed=true;
  panel.dataset.phase=phase;
  q('#shadow-counter').textContent=`${controller.index+1} / ${controller.sentences.length}`;
  q('#shadow-title').textContent=ctx.source.title;q('#shadow-time').textContent=ctx.time(s.start);
  q('#shadow-phase').textContent=phases[phase]||'逐句跟读';q('#shadow-round').textContent=controller.round?`已跟读 ${controller.round} 遍`:'';
  if(q('#shadow-source').dataset.index!==String(controller.index)){q('#shadow-source').innerHTML=ctx.renderSentence(s);q('#shadow-source').dataset.index=String(controller.index);}
  q('#shadow-source').lang=ctx.source.language;q('#shadow-source').classList.toggle('shadow-no-reading',!readings);
  const onlyTranslation=controller.prefs.onlyTranslation,masked=controller.prefs.mask&&!revealed;
  panel.classList.toggle('shadow-only-translation',onlyTranslation);
  q('#shadow-source').hidden=onlyTranslation||masked;q('#shadow-cover').hidden=onlyTranslation||!masked;q('#shadow-translation').textContent=s.translation||'';q('#shadow-translation').hidden=(!onlyTranslation&&(!translations||masked))||!s.translation;
  q('#shadow-countdown').textContent=['waiting','recording'].includes(phase)?Math.ceil(controller.left)+' 秒':'';
  q('#shadow-message').textContent=controller.message||(onlyTranslation&&!s.translation?'这句还没有译文，可先补充译文。':'');
  q('#shadow-translation-toggle').setAttribute('aria-pressed',String(translations));q('#shadow-reading-toggle').setAttribute('aria-pressed',String(readings));q('#shadow-cover-toggle').setAttribute('aria-pressed',String(controller.prefs.mask));
  q('#shadow-reading-toggle').hidden=ctx.source.language!=='ja';
  q('#shadow-only-translation').setAttribute('aria-pressed',String(onlyTranslation));
  for(const id of ['#shadow-translation-toggle','#shadow-reading-toggle','#shadow-cover-toggle'])q(id).disabled=onlyTranslation;
  q('#shadow-start').textContent=['waiting','recording'].includes(phase)?'完成跟读':busy?'停止本轮':phase==='review'?'再练一次':'开始跟读';
  for(const id of ['#shadow-original','#shadow-voice','#shadow-compare'])q(id).disabled=busy;
  q('#shadow-voice').disabled=busy||!recording;q('#shadow-compare').disabled=busy||!recording;
  q('#shadow-previous').disabled=controller.index<=0;q('#shadow-next').disabled=controller.index>=controller.sentences.length-1;
  q('#shadow-save').hidden=!recording;q('#shadow-save').disabled=saveBusy||busy||recording?.saved;q('#shadow-save').textContent=recording?.saved?'本遍已保留':saveBusy?'正在保存…':'保留本遍录音';
  q('#shadow-local-note').textContent=controller.prefs.mode==='record'?'录音只在本机处理；换句或退出会清除未保留录音。':'听原句，然后留出时间复述。';
  lastPhase=phase;lastIndex=controller.index;
 }
 const closed=()=>{
  if(disposed)return;disposed=true;controller.close();events.abort();panel.close();panel.remove();ctx.closed();
 };
 controller=new ShadowSession({audio:ctx.audio,voice,sentences:ctx.sentences,index:ctx.index,prefs:ctx.prefs,changed:render,...ctx.capture,
  completed:session=>{const key='shadow-progress/'+ctx.source.id,index=session.index,start=session.current().start;ctx.markComplete?.({key,index,start});}});
 for(const [id,key] of [['#shadow-mode','mode'],['#shadow-rate','rate'],['#shadow-factor','factor'],['#shadow-repeats','repeats']])q(id).value=String(controller.prefs[key]);
 q('#shadow-next-auto').checked=controller.prefs.autoNext;q('#shadow-mask').checked=controller.prefs.mask;
 function configure(){revealed=false;controller.configure(shadowPreferences({...controller.prefs,mode:q('#shadow-mode').value,rate:q('#shadow-rate').value,factor:q('#shadow-factor').value,repeats:q('#shadow-repeats').value,autoNext:q('#shadow-next-auto').checked,mask:q('#shadow-mask').checked}));persist();render();}
 for(const id of ['#shadow-mode','#shadow-rate','#shadow-factor','#shadow-repeats','#shadow-next-auto','#shadow-mask'])on(id,'change',configure);
 on('#shadow-options','click',()=>{const show=q('#shadow-settings').hidden;q('#shadow-settings').hidden=!show;q('#shadow-options').setAttribute('aria-expanded',String(show));});
 on('#shadow-close','click',closed);panel.addEventListener('cancel',event=>{event.preventDefault();closed();},{signal:events.signal});
 on('#shadow-start','click',()=>{if(controller.finishTurn)controller.finishTurn();else if(busyPhases.includes(controller.phase))controller.cancel();else controller.start();});
 on('#shadow-original','click',()=>controller.preview('original'));on('#shadow-voice','click',()=>controller.preview('voice'));on('#shadow-compare','click',()=>controller.preview('compare'));
 on('#shadow-previous','click',()=>controller.move(controller.index-1));on('#shadow-next','click',()=>controller.move(controller.index+1));
 on('#shadow-translation-toggle','click',()=>{translations=!translations;render();});on('#shadow-reading-toggle','click',()=>{readings=!readings;render();});
 on('#shadow-cover','click',()=>{revealed=true;render();});on('#shadow-source','click',()=>{if(controller.prefs.mask){revealed=false;render();}});
 on('#shadow-only-translation','click',()=>{controller.prefs.onlyTranslation=!controller.prefs.onlyTranslation;persist();render();});
 on('#shadow-cover-toggle','click',()=>{q('#shadow-mask').checked=!controller.prefs.mask;configure();});
 on('#shadow-save','click',async()=>{saveBusy=true;render();const recording=controller.recording;try{await ctx.recordings.save(ctx.source,recording);if(controller.recording===recording)recording.saved=true;ctx.toast('跟读录音已保留在本机');}catch(error){ctx.report(error);}finally{saveBusy=false;render();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&busyPhases.includes(controller.phase)){controller.cancel();controller.message='练习已暂停，返回后可重新开始。';render();}},{signal:events.signal});
 window.addEventListener('pagehide',()=>controller.cancel(),{signal:events.signal});
 panel.showModal();render();q('#shadow-start').focus();
 return {controller,close:closed};
}

export async function showShadowRecordings(ctx){
 await ctx.recordings.saving;
 let rows=await ctx.recordings.list(),disposed=false,url=null;const voice=document.createElement('audio');voice.controls=true;voice.preload='metadata';voice.hidden=true;
 ctx.open('跟读录音',`<div class="shadow-recordings"><p id="shadow-storage-summary"></p><p class="note">仅包含你点过“保留本遍”的录音，保存在当前设备，不参与共享书库同步。同一句保留最新一遍。</p><div id="shadow-recording-player"></div><div id="shadow-recording-list"></div><details id="shadow-clear-panel"><summary>清空已保留录音</summary><p class="note">只清理跟读录音，原音频和学习资料保留。</p><button class="danger full" id="shadow-clear-all">确认清空跟读录音</button></details></div>`);
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
