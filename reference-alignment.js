import {mountJobMonitor,jobProgress,terminalJob} from './job-monitor.js?v=2026.10.07.6';
import {validateTranscript} from './validate.js?v=2026.10.07.6';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='reference-alignment-job';
const stamp=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;

export async function showReferenceAlignment(ctx,draft={}){
 const {modal,open,on,request,report,toast,read,write,remove,submit,base}=ctx;
 if(ctx.version<12){open('官网原文稿辅助对齐','<p class="note">请打开最新版“听页电脑转写.exe”使用辅助对齐。旧工具的任务可以继续处理。</p>');return;}
 const saved=(await read('settings',KEY))?.value||{},pending=draft.fresh?{}:saved;
 let text=draft.text??pending.text??'',source=draft.source??pending.source??'',glossary=draft.glossary??pending.glossary??'',document=draft.document||pending.document||null,file=draft.file||null,id=draft.fresh?null:pending.id||null;
 open('官网原文稿辅助对齐',`<p class="note">选择日语音频，读取 Noriko 公开官网稿，或粘贴其他节目的原文。先试听、校对时间轴，再生成中文译文。</p><label for="reference-audio">对应音频（文件名用于手机自动匹配）</label><input id="reference-audio" type="file" accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.opus"><p class="note" id="reference-audio-name">${esc(file?.name||'请选择与原稿同一集的音频')}</p><label for="reference-url">Noriko 官网原文稿网址（可选）</label><input id="reference-url" type="url" value="${esc(source)}" placeholder="https://www.japanesewithnoriko.com/…"><button class="secondary full section-title" id="read-official-reference">读取官网原文稿</button><label for="reference-txt">或导入日语 TXT</label><input id="reference-txt" type="file" accept=".txt,text/plain"><label for="reference-text">原稿预览 · 可修改标点，换行也会分句</label><textarea id="reference-text" rows="8" maxlength="24000" lang="ja" spellcheck="false">${esc(text)}</textarea><p class="note" id="reference-count"></p><button class="secondary full" id="preview-reference-sentences">整理并预览断句</button><p class="note" id="reference-model">正在检查本机对齐模型…</p><button class="primary full section-title" id="start-reference-alignment">核对音频并生成时间轴</button><div id="reference-result" role="status"></div><button class="secondary full section-title" id="new-reference-alignment" hidden>处理另一集</button>`);
 const $=s=>modal.querySelector(s),root=$('#reference-result'),alive=()=>modal.open&&modal.querySelector('#reference-result')===root;
 let timer=null,upload=null,cancelled=false,audioUrl=null,clipStop=null,changedSource=false,previewPlayer=null,running=!!pending.running;
 const monitor=mountJobMonitor(modal,'reference-result',true,async()=>{cancelled=true;await request(`api/jobs/${id}/cancel`,{});monitor.cancelling();if(upload)upload.abort();else{clearTimeout(timer);await poll();}});
 const audioURL=()=>{if(!audioUrl&&file)audioUrl=URL.createObjectURL(file);return audioUrl;};
 const release=()=>{previewPlayer?.pause();if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=null;clearTimeout(clipStop);clearTimeout(timer);};
 const observer=new MutationObserver(()=>{if(!alive()){release();observer.disconnect();}});observer.observe(modal,{childList:true,subtree:true});
 const remember=async()=>write('settings',{id:KEY,value:{id,text,source,glossary,document,running}});
 const state=()=>({file,text,source,glossary,document});
 on('#reference-audio','change',()=>{const next=$('#reference-audio').files[0];if(document&&next?.name!==document.audio?.filename){report(Error(`请选回对应音频：${document.audio?.filename||document.title}`));return;}previewPlayer?.pause();file=next;if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=null;$('#reference-audio-name').textContent=file?.name||'请选择音频';if(document)showResult(document).catch(report);});
 on('#reference-text','input',()=>{text=$('#reference-text').value;$('#reference-count').textContent='原稿已修改，开始对齐前会重新分句。';});
 on('#reference-url','input',()=>changedSource=true);
 on('#read-official-reference','click',async()=>{
  const button=$('#read-official-reference');button.disabled=true;
  try{const data=await request('api/reference-alignment/preview',{url:$('#reference-url').value.trim()});if(!alive())return;text=data.text;source=data.source;changedSource=false;$('#reference-text').value=text;$('#reference-url').value=source;$('#reference-count').textContent=`${data.sentences} 句 · ${data.characters} 字，请删除标题或未朗读的部分。`;await remember();}
  catch(error){report(error);}finally{if(alive())button.disabled=false;}
 });
 on('#reference-txt','change',async()=>{try{const txt=$('#reference-txt').files[0];if(!txt)return;if(txt.size>150000)throw Error('TXT 太大，请分集处理。');text=await txt.text();source='';$('#reference-text').value=text;$('#reference-url').value='';changedSource=false;await preview();}catch(error){report(error);}});
 async function preview(){const data=await request('api/reference-alignment/preview',{text:$('#reference-text').value});if(!alive())return;text=data.text;$('#reference-text').value=text;$('#reference-count').textContent=`${data.sentences} 句 · ${data.characters} 字，每行一句。`;await remember();}
 on('#preview-reference-sentences','click',()=>preview().catch(report));
 on('#new-reference-alignment','click',async()=>{release();await remove('settings',KEY);await showReferenceAlignment(ctx,{fresh:true});});

 async function showResult(result){
  if(!alive())return;validateTranscript(result);document=result;running=false;monitor.start();monitor.finish();$('#new-reference-alignment').hidden=false;
  const summary=result.reference_alignment||{},flags=result.segments.filter(s=>s.alignmentReview?.length&&!s.alignmentReviewed);
  root.innerHTML=`<strong>${esc(result.title)} · ${result.segments.length} 句</strong><p class="note">原稿 ${summary.reference_sentences||0} 句 · 原稿与识别稿文字匹配约 ${Math.round((summary.match_ratio||0)*100)}% · ${flags.length} 句待核对${summary.supplement_sentences?` · ${summary.supplement_sentences} 句由 MOSS 补充`:''}。文字匹配率不代表时间轴准确率。</p>${summary.unrepresented_asr_segments?`<p class="note">另有 ${summary.unrepresented_asr_segments} 个识别片段与官网稿存在差异，建议对照整集试听。</p>`:''}${result.translation_warning?`<p class="note">中文翻译未完成：${esc(result.translation_warning)}</p>`:''}<label for="aligned-sentence">逐句试听</label><select id="aligned-sentence">${result.segments.map((s,i)=>`<option value="${i}">${i+1} · ${stamp(s.start)} · ${s.alignmentReview?.length?'待核对 · ':''}${esc(s.text.slice(0,55))}</option>`).join('')}</select><p id="aligned-source" lang="ja" class="source"></p><p id="aligned-translation"></p><p class="note" id="aligned-review"></p><audio id="aligned-preview-audio" controls preload="metadata" class="full"></audio><button class="secondary full section-title" id="play-aligned-sentence">试听选中句子</button><p class="note" id="aligned-audio-note"></p><div class="stack section-title"><button class="secondary full" id="edit-aligned-document">校对原文、断句与假名</button><button class="secondary full" id="translate-aligned-document">根据校对稿生成中文</button><button class="primary full" id="save-aligned-document">导出逐字稿与时间轴</button><button class="secondary full" id="save-aligned-text">导出纯日语文本</button><button class="secondary full" id="aligned-export-location">保存位置</button></div><p class="note">保留对应音频的原文件名。导出后可用共享书库发布到手机；这里不会自动覆盖或发布旧稿。补充识别句与时间异常处请先核对。</p><details class="section-title"><summary>核对标记（${flags.length} 句）</summary><div>${flags.slice(0,100).map(s=>`<p class="note">${stamp(s.start)} · ${esc(s.text.slice(0,70))}<br>${s.alignmentReview.map(esc).join('；')}</p>`).join('')||'<p class="note">未发现规则检查出的异常，仍建议抽查试听。</p>'}</div></details>`;
  const player=$('#aligned-preview-audio');previewPlayer?.pause();previewPlayer=player;if(audioURL())player.src=audioURL();else player.hidden=true;
  player.insertAdjacentHTML('beforebegin',`<label for="aligned-audio-select">${file?'更换试听音频':'选择原音频用于试听'}</label><input id="aligned-audio-select" type="file" accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.opus">`);
  on('#aligned-audio-select','change',()=>{const next=$('#aligned-audio-select').files[0];if(!next)return;if(next.name!==result.audio?.filename){report(Error(`请选回对应音频：${result.audio?.filename||result.title}`));return;}player.pause();file=next;if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=null;player.src=audioURL();player.hidden=false;$('#aligned-audio-note').textContent='原音频已连接，可逐句试听，无需重新对齐。';});
  $('#aligned-review').insertAdjacentHTML('afterend','<label class="checkbox-line"><input id="aligned-reviewed" type="checkbox">这句已试听核对</label><button class="secondary full" id="next-alignment-review">下一句待核对</button>');
  $('#translate-aligned-document').insertAdjacentHTML('beforebegin',`<label for="aligned-glossary">人名与术语（可选）</label><textarea id="aligned-glossary" rows="2" maxlength="5000" placeholder="一行一条：日语 = 中文译法">${esc(glossary)}</textarea>`);
  on('#aligned-glossary','change',async()=>{glossary=$('#aligned-glossary').value;await remember();});
  $('#aligned-audio-note').textContent=file?'原音频仅用于本次试听。':'重新打开后，选择同一个音频即可试听；无需重新对齐。';
  const selected=()=>result.segments[Number($('#aligned-sentence').value)];
  function display(){player.pause();const s=selected();$('#aligned-reviewed').checked=!!s.alignmentReviewed;$('#aligned-source').textContent=s.text;$('#aligned-translation').textContent=s.translation||'';$('#aligned-review').textContent=`${stamp(s.start)}—${stamp(s.end)} · ${s.alignmentReviewed?'已核对':s.alignmentReview?.join('；')||'可试听核对'}`;}
  on('#aligned-sentence','change',display);display();
  on('#aligned-reviewed','change',async()=>{selected().alignmentReviewed=$('#aligned-reviewed').checked;await remember();display();const remaining=result.segments.filter(s=>s.alignmentReview?.length&&!s.alignmentReviewed);root.querySelector('p.note').textContent=root.querySelector('p.note').textContent.replace(/\d+ 句待核对/,`${remaining.length} 句待核对`);const panel=root.querySelector('details');panel.querySelector('summary').textContent=`核对标记（${remaining.length} 句）`;panel.querySelector('div').innerHTML=remaining.slice(0,100).map(s=>`<p class="note">${stamp(s.start)} · ${esc(s.text.slice(0,70))}<br>${s.alignmentReview.map(esc).join('；')}</p>`).join('')||'<p class="note">标记出的句子已核对。</p>';});
  on('#next-alignment-review','click',()=>{const start=Number($('#aligned-sentence').value);const index=result.segments.findIndex((s,i)=>i>start&&s.alignmentReview?.length&&!s.alignmentReviewed);const next=index>=0?index:result.segments.findIndex(s=>s.alignmentReview?.length&&!s.alignmentReviewed);if(next<0){toast('标记出的待核对句子已全部检查');return;}$('#aligned-sentence').value=String(next);display();});
  player.addEventListener('timeupdate',()=>{if(!player.paused&&player.currentTime>=selected().end)player.pause();});
  on('#play-aligned-sentence','click',async()=>{try{if(!file)throw Error('请重新选择对应的音频用于试听。');player.currentTime=selected().start;await player.play();}catch(error){report(error);}});
  on('#edit-aligned-document','click',()=>{player.pause();ctx.edit(result,async revised=>{document=revised;await remember();await showReferenceAlignment(ctx,{...state(),document:revised});},Number($('#aligned-sentence').value));});
  on('#save-aligned-document','click',()=>ctx.saveTranscript(result).catch(report));on('#save-aligned-text','click',()=>ctx.saveText(result));
  on('#aligned-export-location','click',()=>ctx.exportLocation(()=>showReferenceAlignment(ctx,state())));
  on('#translate-aligned-document','click',async()=>{
   const button=$('#translate-aligned-document');button.disabled=true;
   try{player.pause();glossary=$('#aligned-glossary').value;const form=new FormData();form.append('transcript',new File([JSON.stringify(document)],'transcript.json',{type:'application/json'}));form.append('translation_engine','quality');form.append('glossary',glossary);const response=await submit(new URL('api/translate',base),form);id=response.id;running=true;await remember();monitor.start();await poll();}catch(error){report(error);if(alive())button.disabled=false;}
  });await remember();
 }
 async function poll(){
  if(!alive())return;
  try{const job=await request(`api/jobs/${id}`);if(!alive())return;root.innerHTML=jobProgress(job);
   if(terminalJob(job.state)){running=false;await remember();monitor.finish();$('#new-reference-alignment').hidden=false;}
   if(job.state==='done'){await showResult(job.result);return;}
   if(job.state==='error'){root.innerHTML+=`<p class="note">${esc(job.detail||'处理失败。原稿保留，请核对后重试。')}</p>`;monitor.retry();$('#start-reference-alignment').disabled=false;return;}
   if(job.state==='cancelled'){monitor.retry();$('#start-reference-alignment').disabled=false;return;}
   if(job.state==='cancelling')monitor.cancelling();timer=setTimeout(poll,1200);
  }catch(error){if(alive()){monitor.finish();root.textContent=error.message;$('#new-reference-alignment').hidden=false;}}
 }
 on('#start-reference-alignment','click',async()=>{
  const button=$('#start-reference-alignment');button.disabled=true;
  try{
   if(!file||file.size>350*1048576)throw Error(file?'音频不能超过 350 MB。':'请选择对应音频。');await preview();if(changedSource)source='';document=null;
   const form=new FormData();form.append('audio',file);form.append('text',text);form.append('source',source);id=crypto.randomUUID();form.append('request_id',id);cancelled=false;upload=new AbortController();running=true;await remember();monitor.start();monitor.upload(0);ctx.lock(true);
   const response=await submit(new URL('api/reference-alignment',base),form,{signal:upload.signal,onProgress:p=>{if(alive()&&!cancelled)monitor.upload(p);}});upload=null;ctx.lock(false);id=response.id;await remember();await poll();
  }catch(error){upload=null;running=false;id=null;await remember();ctx.lock(false);if(alive()){monitor.retry();button.disabled=false;root.textContent=cancelled?'已取消提交。':error.message;}}
 });
 try{const model=await request('api/reference-alignment/status');if(alive()){$('#reference-model').textContent=model.ready?'本机对齐模型已准备 · CPU 运行，原文与音频留在电脑。':'对齐模型尚未准备，请查看电脑使用说明。';$('#start-reference-alignment').disabled=!model.ready;}}catch(error){if(alive())$('#reference-model').textContent=error.message;}
 if(id&&running){monitor.start();await poll();}else if(document)await showResult(document);else if(id){monitor.start();await poll();}
}
