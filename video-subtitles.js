import {mountJobMonitor,jobProgress,terminalJob} from './job-monitor.js?v=2026.10.09.1';
import {validateTranscript} from './validate.js?v=2026.10.09.1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MODES=[['original','日语 / 原文字幕'],['chinese','中文字幕'],['bilingual','原文＋中文双语字幕']];
const OPTIONS=MODES.map(([id,label])=>`<option value="${id}">${label}</option>`).join('');
const KEY='video-subtitle-job';

export async function showVideoSubtitles(ctx,initialDocument=null){
 const {modal,open,on,request,report,toast,download,read,write,remove,submit,base}=ctx;
 if(ctx.version<11){open('视频字幕','<p class="note">请打开最新版“听页电脑转写.exe”，再使用视频字幕功能。原有电脑任务可以继续处理。</p>');return;}
 const pending=(await read('settings',KEY))?.value;
 open('生成视频字幕',`<p class="note">粘贴 Jable 视频页面或视频直链，由电脑生成字幕文件。网站要求登录或验证时，可以选择本地视频。不会保存视频副本到音频库。</p><label for="video-source">视频来源</label><select id="video-source"><option value="url">视频网址</option><option value="file">本地视频</option><option value="transcript">已有 / 修订后的逐字稿</option></select><div id="video-url-group"><label for="video-url">视频页面或直链</label><input id="video-url" type="url" placeholder="https://…" autocomplete="off" spellcheck="false"></div><div id="video-file-group" hidden><label for="video-file">选择视频文件</label><input id="video-file" type="file" accept="video/*,.mp4,.mov,.mkv,.webm,.m4v,.avi,.ts,.flv"></div><div id="video-transcript-group" hidden><label for="video-transcript">选择逐字稿 JSON</label><input id="video-transcript" type="file" accept=".json,application/json"></div><div id="video-asr-options"><label for="video-language">视频语言</label><select id="video-language"><option value="ja">日语 · MOSS</option><option value="en">英语</option><option value="fr">法语</option></select><label for="video-mode">生成内容</label><select id="video-mode">${OPTIONS}</select><div id="video-translation-options" hidden><label for="video-engine">中文翻译方式</label><select id="video-engine"><option value="quality">高质量 · 结合上下文</option><option value="fast">快速 · 逐句翻译</option></select><label for="video-glossary">人名和术语（可选）</label><textarea id="video-glossary" rows="2" maxlength="5000" placeholder="一行一条，例如：Noriko = Noriko"></textarea></div><p class="note">网址处理需要联网；本地视频与已准备好的模型可以离线使用。单个视频最多 2 GB、6 小时。可查看每一步进度并取消。</p></div>${ctx.version>=15?'<p class="note">日语长视频逐段保存识别进度，失败的小段会自动拆短重试。未完成任务可继续，暂存音频仅在本机保留七天。</p>':''}<button class="primary full section-title" id="start-video">开始生成字幕</button><div id="video-result" role="status"></div><button class="secondary full section-title" id="new-video" hidden>处理另一个视频</button>`);
 const root=modal.querySelector('#video-result'),alive=()=>modal.open&&modal.querySelector('#video-result')===root;
 const $=selector=>modal.querySelector(selector);
 let id=pending?.id||null,timer=null,upload=null,cancelled=false,currentDocument=initialDocument||pending?.document||null,pendingMode=pending?.mode||'original';
 const monitor=mountJobMonitor(modal,'video-result',true,async()=>{
  cancelled=true;await request(`api/jobs/${id}/cancel`,{});monitor.cancelling();
  if(upload)upload.abort();else{clearTimeout(timer);await poll();}
 });
 on('#video-source','change',()=>{
  const type=$('#video-source').value;
  $('#video-url-group').hidden=type!=='url';$('#video-file-group').hidden=type!=='file';$('#video-transcript-group').hidden=type!=='transcript';$('#video-asr-options').hidden=type==='transcript';
  $('#start-video').textContent=type==='transcript'?'读取逐字稿并导出字幕':'开始生成字幕';
 });
 on('#video-mode','change',()=>$('#video-translation-options').hidden=$('#video-mode').value==='original');
 on('#new-video','click',async()=>{clearTimeout(timer);await remove('settings',KEY);await showVideoSubtitles(ctx);});
 async function showResult(document,mode='original'){
  if(!alive())return;
  validateTranscript(document);currentDocument=document;monitor.start();monitor.finish();$('#new-video').hidden=false;
  root.innerHTML=`<strong>${esc(document.title||'视频字幕')} · ${document.segments.length} 句</strong>${document.translation_warning?'<p class="note">中文翻译未完成，可以先导出原文字幕。中文与双语字幕需要完整译文。</p>':''}<label for="subtitle-mode">字幕内容</label><select id="subtitle-mode">${OPTIONS}</select><label for="subtitle-format">字幕格式</label><select id="subtitle-format"><option value="srt">SRT · 通用字幕文件</option><option value="vtt">WebVTT · 网页字幕文件</option></select><details class="section-title"><summary>调整时间</summary><label for="subtitle-offset">整体偏移（秒，正数延后，负数提前）</label><input id="subtitle-offset" type="number" min="-600" max="600" step="0.1" value="0"></details><label for="subtitle-preview">字幕预览</label><textarea id="subtitle-preview" rows="7" readonly spellcheck="false"></textarea><p class="note" id="subtitle-export-status"></p><button class="primary full" id="export-video-subtitle">导出字幕文件</button><div class="stack section-title"><button class="secondary full" id="edit-video-transcript">校对原文与译文</button><button class="secondary full" id="save-video-transcript">保存逐字稿 JSON</button><button class="secondary full" id="video-export-location">字幕保存位置</button></div><p class="note">已设置保存文件夹时，字幕会直接保存到那里；否则由浏览器下载。修订后的逐字稿也可以从这个入口重新生成字幕。</p>`;
  $('#subtitle-mode').value=mode;
  let previewSerial=0,selectedMode=mode;
  const payload=()=>({transcript:currentDocument,mode:$('#subtitle-mode').value,format:$('#subtitle-format').value,offset:Number($('#subtitle-offset').value)});
  async function preview(){
   const serial=++previewSerial;
   try{const data=await request('api/subtitle-files',payload());if(alive()&&serial===previewSerial){$('#subtitle-preview').value=data.content.slice(0,8000);$('#subtitle-export-status').textContent='';$('#export-video-subtitle').disabled=false;}}
   catch(error){if(alive()&&serial===previewSerial){$('#subtitle-preview').value='';$('#subtitle-export-status').textContent=error.message;$('#export-video-subtitle').disabled=true;}}
  }
  on('#subtitle-mode','change',async()=>{selectedMode=$('#subtitle-mode').value;await write('settings',{id:KEY,value:{id,document:currentDocument,mode:selectedMode}});await preview();});on('#subtitle-format','change',preview);on('#subtitle-offset','change',preview);
  on('#export-video-subtitle','click',async()=>{
   const button=$('#export-video-subtitle');button.disabled=true;
   try{const settings=await request('api/export-settings'),data=await request('api/subtitle-files',{...payload(),save:settings.enabled});
    if(data.content!==undefined)download(new Blob([data.content],{type:'text/plain;charset=utf-8'}),data.filename);
    if(alive())$('#subtitle-export-status').textContent=data.path?`已保存：${data.path}`:`已下载：${data.filename}`;
    toast('字幕已导出');
   }catch(error){report(error);}finally{if(alive())button.disabled=false;}
  });
  on('#save-video-transcript','click',()=>ctx.saveTranscript(document).catch(report));
  on('#edit-video-transcript','click',()=>ctx.edit(document,async revised=>{
   await write('settings',{id:KEY,value:{id,document:revised,mode:selectedMode}});
   await showVideoSubtitles(ctx,revised);
  }));
  on('#video-export-location','click',()=>ctx.exportLocation(()=>showVideoSubtitles(ctx,document)));
  await write('settings',{id:KEY,value:{id,document,mode}});await preview();
 }
 async function poll(){
  if(!alive())return;
  try{
   const job=await request(`api/jobs/${id}`);if(!alive())return;
   root.innerHTML=jobProgress(job);
   if(terminalJob(job.state)){monitor.finish();$('#new-video').hidden=false;}
   if(job.state==='done'){await showResult(job.result,pendingMode);return;}
   if(job.state==='error'){root.innerHTML+=`<p class="note">${esc(job.detail||'处理失败，请重试。')}</p>`;recoveryControls(job);return;}
   if(job.state==='cancelled'){recoveryControls(job);return;}
   if(job.state==='cancelling')monitor.cancelling();
   timer=setTimeout(poll,1200);
  }catch(error){if(alive()){monitor.finish();$('#new-video').hidden=false;root.textContent=`${error.message} 重新打开此入口可继续查看任务。`;}}
 }
 function recoveryControls(job){
  if(!job.recovery_available||ctx.version<15)return;
  root.insertAdjacentHTML('beforeend','<p class="note">本机已保留音频和识别进度，继续时不会重新下载或转写已完成部分。未完成任务最多保留七天，完成或放弃后清理。</p><div class="stack"><button class="primary full" id="resume-video-job">从上次进度继续</button><button class="secondary full" id="discard-video-job">放弃并清理临时文件</button></div>');
  on('#resume-video-job','click',()=>resume(id,pendingMode).catch(report));
  on('#discard-video-job','click',async()=>{const button=$('#discard-video-job');button.disabled=true;try{await request(`api/jobs/${id}/discard`,{});await remove('settings',KEY);toast('保留的临时音频和进度已清理');await showVideoSubtitles(ctx);}catch(error){button.disabled=false;report(error);}});
 }
 async function resume(key,mode){
  const buttons=[...root.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);
  try{await request(`api/jobs/${key}/resume`,{});id=key;pendingMode=mode;currentDocument=null;cancelled=false;
   await write('settings',{id:KEY,value:{id,mode}});$('#new-video').hidden=true;monitor.start();await poll();
  }catch(error){buttons.forEach(button=>button.disabled=false);throw error;}
 }
 async function unfinished(){
  if(ctx.version<15||id||currentDocument)return;
  try{const data=await request('api/video-subtitles/recovery');if(!alive()||!data.items.length)return;
   $('#new-video').insertAdjacentHTML('afterend',`<details class="section-title" id="unfinished-video"><summary>未完成的字幕任务（${data.items.length}）</summary><p class="note">进度保存在电脑本机，最多保留七天。放弃任务会清理临时音频。</p>${data.items.map(item=>`<article class="sync-catalog-row"><strong>${esc(item.title)}</strong><small>已识别 ${Math.floor(item.audio_completed/60)} 分 ${Math.floor(item.audio_completed%60)} 秒 · ${item.sentences} 句</small><div class="actions"><button class="primary" data-resume-video="${esc(item.id)}" data-mode="${item.translate?'bilingual':'original'}">继续转写</button><button class="secondary" data-discard-video="${esc(item.id)}">放弃</button></div></article>`).join('')}</details>`);
   for(const button of modal.querySelectorAll('[data-resume-video]'))button.onclick=async()=>{button.disabled=true;try{await resume(button.dataset.resumeVideo,button.dataset.mode);$('#unfinished-video')?.remove();}catch(error){button.disabled=false;report(error);}};
   for(const button of modal.querySelectorAll('[data-discard-video]'))button.onclick=async()=>{button.disabled=true;try{await request(`api/jobs/${button.dataset.discardVideo}/discard`,{});button.closest('article').remove();toast('临时文件已清理');}catch(error){button.disabled=false;report(error);}};
  }catch(error){console.warn('未完成任务稍后读取',error.message);}
 }
 on('#start-video','click',async()=>{
  const button=$('#start-video');button.disabled=true;
  try{
   const type=$('#video-source').value;
   if(type==='transcript'){
    const file=$('#video-transcript').files[0];if(!file)throw Error('请选择逐字稿 JSON 文件。');if(file.size>30*1048576)throw Error('逐字稿不能超过 30 MB。');
    const document=JSON.parse(await file.text());validateTranscript(document);await showResult(document);return;
   }
   const language=$('#video-language').value,mode=$('#video-mode').value,engine=$('#video-engine').value,glossary=$('#video-glossary').value;
   const url=$('#video-url').value.trim(),file=$('#video-file').files[0];
   if(type==='url'&&!/^https?:\/\//i.test(url))throw Error('请输入完整视频网址。');
   if(type==='file'&&(!file||file.size>2*1024**3))throw Error(file?'视频不能超过 2 GB。':'请选择视频文件。');
   id=crypto.randomUUID();cancelled=false;monitor.start();
   await write('settings',{id:KEY,value:{id,mode}});
   let response;
   if(type==='file'){
    const data=new FormData();data.append('video',file);data.append('language',language);data.append('translate',String(mode!=='original'));data.append('translation_engine',engine);data.append('glossary',glossary);data.append('request_id',id);
    upload=new AbortController();ctx.lock(true);monitor.upload(0,'视频');
    response=await submit(new URL('api/video-subtitles/upload',base),data,{signal:upload.signal,onProgress:p=>{if(alive()&&!cancelled)monitor.upload(p,'视频');}});
   }else response=await request('api/video-subtitles',{url,language,translate:mode!=='original',translation_engine:engine,glossary,request_id:id});
   upload=null;ctx.lock(false);id=response.id;
   if(alive()){pendingMode=mode;await poll();}
  }catch(error){upload=null;ctx.lock(false);if(alive()){monitor.retry();button.disabled=false;root.textContent=cancelled?'已取消提交。':error.message;}await remove('settings',KEY);}
 });
 if(currentDocument)await showResult(currentDocument,pendingMode);
 else if(id){monitor.start();await poll();}
 else await unfinished();
}
