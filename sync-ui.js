import {matchingEpisode,planSharedImports} from './cloud-transcript.js';
import {transcriptName} from './transcript-batch.js';
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function syncPanel(sync){
 const message=sync.error||(!sync.config?'尚未连接共享书库':!sync.user?'登录后自动接收电脑修订':!sync.role?'正在检查账号权限':sync.running?'正在同步…':sync.pending.length?`本机已保存 · ${sync.pending.length} 份等待同步`:'已连接 · 同名逐字稿自动更新');
 return `<section class="panel"><h2>逐字稿同步</h2><p class="note" id="sync-summary">${escapeHTML(message)}</p><div class="stack"><button class="secondary full" id="open-transcript-sync">${sync.user?'管理逐字稿同步':'连接共享书库'}</button>${sync.canWrite()?'<button class="secondary full" id="open-sync-batch">批量导入并同步逐字稿</button>':''}</div></section>`;
}
export async function showSyncBatchUI(context){
 const {sync,open,modal,on,toast,report}=context;
 if(!sync.ready||sync.role!=='editor'){await showSyncUI(context);toast('请先登录发布账号，再选择批量导入');return;}
 if(!sync.canWrite())throw Error('请在电脑工具中批量同步逐字稿。');
 const key=sync.key;let rows=[],loading=0,busy=false;
 open('批量导入并同步逐字稿',`<p class="note">无需在电脑导入音频。选择逐字稿文件夹或多份 JSON，手机会按相同文件名自动关联并替换旧稿，例如 15-2.json 对应 15-2.wav 或 15-2.m4a。</p><label for="sync-batch-folder">逐字稿文件夹</label><input id="sync-batch-folder" type="file" webkitdirectory multiple><label for="sync-batch-files">或多选逐字稿文件</label><input id="sync-batch-files" type="file" accept=".json,application/json" multiple><p class="note" id="sync-batch-status" role="status">重名、无效文件会跳过；未找到音频的稿件保留在书库，导入对应音频后再自动匹配。</p><div class="batch-script-preview" id="sync-batch-preview"></div><button class="primary full" id="sync-batch-publish" disabled>读取文件后同步</button><button class="secondary full section-title" id="sync-batch-back">返回共享书库</button>`);
 const status=modal.querySelector('#sync-batch-status'),publish=modal.querySelector('#sync-batch-publish');
 const current=()=>status.isConnected&&modal.open;
 async function load(files){
  const generation=++loading;rows=[];publish.disabled=true;modal.querySelector('#sync-batch-preview').innerHTML='';
  try{const next=await planSharedImports(files,sync.items,(done,total)=>{if(current()&&generation===loading)status.textContent=`正在读取 ${done} / ${total} 份…`;});
   if(!current()||generation!==loading)return;rows=next;const ready=rows.filter(row=>row.status==='ready');
   status.textContent=`待同步 ${ready.length} 份 · 未改变 ${rows.filter(row=>row.status==='unchanged').length} 份 · 跳过 ${rows.filter(row=>row.status==='skipped').length} 份`;
   modal.querySelector('#sync-batch-preview').innerHTML=rows.map(row=>`<article class="batch-script-row"><strong>${escapeHTML(row.name)}</strong><small>${row.status==='ready'?'可同步 · '+row.document.segments.length+' 句':row.status==='unchanged'?'与云端相同，无需重复上传':escapeHTML(row.reason)}</small></article>`).join('');publish.disabled=!ready.length;publish.textContent=`同步 ${ready.length} 份逐字稿`;
  }catch(error){if(current()&&generation===loading)status.textContent=error.message;}
 }
 on('#sync-batch-folder','change',event=>load(event.target.files));on('#sync-batch-files','change',event=>load(event.target.files));
 on('#sync-batch-back','click',()=>{if(!busy)showSyncUI(context).catch(report);});
 on('#sync-batch-publish','click',async()=>{
  if(busy)return;busy=true;context.lock?.(true);const controls=[...modal.querySelectorAll('button,input')];controls.forEach(el=>el.disabled=true);
  const prevent=event=>event.preventDefault();modal.addEventListener('cancel',prevent);
  try{if(sync.key!==key)throw Error('账号已切换，请重新选择文件。');const ready=rows.filter(row=>row.status==='ready');
   const count=await sync.enqueueBatch(ready,(done,total)=>{if(current())status.textContent=`正在保存同步队列 ${done} / ${total}…`;});
   toast(`已加入 ${count} 份逐字稿，联网后自动同步`);await showSyncUI(context);
  }catch(error){if(current()){status.textContent=error.message;controls.forEach(el=>el.disabled=false);}report(error);}
  finally{busy=false;context.lock?.(false);modal.removeEventListener('cancel',prevent);}
 });
}
export async function showSyncUI(context){
 const {sync,open,modal,all,read,on,close,report,toast}=context;
 sync.uiRefresh=null;
 if(!sync.config){
  open('连接共享书库',`<p class="note">首次设置好免费项目后，把同一份连接信息填到需要同步的设备。连接信息不含密码；逐字稿只有获准的账号可以读取。</p><label for="sync-connection">同步连接信息</label><textarea id="sync-connection" rows="5" spellcheck="false" placeholder="粘贴项目配置的 JSON"></textarea><button class="primary full" id="save-sync-connection">连接</button>`);
  on('#save-sync-connection','click',async()=>{try{await sync.configure(JSON.parse(modal.querySelector('#sync-connection').value));toast('连接信息已保存，正在重新打开');location.reload();}catch(error){report(error);}});return;
 }
 if(!sync.user){
  open('登录共享书库',`<p class="note">使用项目中为你们创建的账号。任意手机、平板或电脑登录后，都可以接收逐字稿；音频仍需在各设备导入。</p><form id="sync-login-form"><label for="sync-email">邮箱</label><input id="sync-email" type="email" autocomplete="username" required><label for="sync-password">密码</label><input id="sync-password" type="password" autocomplete="current-password" required><p class="note" id="sync-login-status" role="status"></p><button class="primary full" type="submit">登录</button></form>`);
  on('#sync-login-form','submit',async event=>{event.preventDefault();const button=modal.querySelector('button[type=submit]');button.disabled=true;try{const password=modal.querySelector('#sync-password').value;await sync.login(modal.querySelector('#sync-email').value,password);modal.querySelector('#sync-password').value='';toast('已登录，正在读取共享书库');close();}catch(error){report(error);}finally{button.disabled=false;}});return;
 }
 open('逐字稿同步',`<p class="note">${escapeHTML(sync.user.email||'已登录')} · ${sync.role==='editor'?'可在电脑发布修订':sync.role==='reader'?'自动接收修订':'等待授权'}</p><p id="sync-dialog-status" class="note" role="status"></p><div class="actions"><button class="secondary" id="sync-refresh">立即同步</button><button class="secondary" id="sync-logout">退出登录</button></div>${sync.role==='editor'&&sync.canWrite()?'<button class="primary full section-title" id="sync-batch-open">批量导入并同步逐字稿</button>':''}<p class="note">同名、同语言且时长相符时自动关联并替换旧稿；音频、词卡和进度保留。</p><p class="note" id="sync-catalog-count"></p><label for="sync-search">查找逐字稿</label><input id="sync-search" type="search" placeholder="文件名或标题"><div class="filters"><button class="chip active" id="sync-filter-attention">待处理</button><button class="chip" id="sync-filter-all">全部</button></div><div class="sync-catalog" id="sync-catalog-list"></div><button class="secondary full" id="sync-more" hidden>显示更多</button><p class="note">播放中的音频暂停后更新。找不到对应音频的稿件会保留，之后导入音频即可自动匹配。</p>`);
 let attention=true,limit=40,renderSerial=0;const list=modal.querySelector('#sync-catalog-list');
 async function render(){
  const serial=++renderSerial,episodes=await all('episodes');if(!list.isConnected||!modal.open||serial!==renderSerial)return;
  const rows=sync.items.map(item=>{const match=matchingEpisode(item,episodes,sync.scope),latest=match.episode?.cloudTranscript?.hash===item.hash;return {item,match,latest};});
  const waiting=rows.filter(row=>!row.latest);modal.querySelector('#sync-catalog-count').textContent=`书库 ${rows.length} 份 · 已匹配更新 ${rows.length-waiting.length} 份 · 待处理 ${waiting.length} 份`;
  const failed=sync.pending.find(row=>row.error);
  modal.querySelector('#sync-dialog-status').textContent=sync.error||(failed?`${failed.document.audio.filename}：${failed.error}`:sync.pending.length?`正在同步 ${sync.pending.length} 份逐字稿，已排队的文件会保留。`:'共享书库已连接');
  const query=modal.querySelector('#sync-search').value.trim().toLocaleLowerCase();
  const filtered=rows.filter(row=>(!attention||!row.latest)&&(!query||(row.item.title+' '+row.item.filename).toLocaleLowerCase().includes(query)));
  list.innerHTML=filtered.slice(0,limit).map(({item,match,latest})=>`<article class="sync-catalog-row"><strong>${escapeHTML(item.title||item.filename)}</strong><small>${escapeHTML(item.filename)}</small><p class="note">${latest?'已自动关联 · 最新稿':escapeHTML(match.reason||(match.episode?'已匹配，暂停播放后自动更新':'等待导入同名音频'))}</p>${!match.episode||latest?`<button class="secondary" data-sync-id="${item.id}">${latest?'更换对应音频':'查找对应音频'}</button>`:''}</article>`).join('')||`<p class="note">${query?'没有找到匹配的逐字稿':sync.items.length?'暂时没有待处理的逐字稿':'电脑首次保存或批量同步后，会显示在这里。'}</p>`;
  modal.querySelector('#sync-more').hidden=filtered.length<=limit;
  for(const button of list.querySelectorAll('[data-sync-id]'))button.onclick=()=>{const item=sync.items.find(row=>row.id===button.dataset.syncId);if(item)associateUI(item).catch(report);};
 }
 async function associateUI(item){
  sync.uiRefresh=null;const episodes=(await all('episodes')).filter(e=>e.language===item.language),folders=(await read('settings','audio-folders'))?.value||[];
  open('查找对应音频',`<p class="note">${escapeHTML(item.filename)} · ${Math.round(item.duration)} 秒</p><label for="sync-audio-search">音频名称</label><input id="sync-audio-search" type="search" placeholder="输入文件名或标题"><label for="sync-audio-folder">文件夹</label><select id="sync-audio-folder"><option value="">所有文件夹</option>${folders.map(f=>`<option value="${escapeHTML(f.id)}">${escapeHTML(f.name)}</option>`).join('')}</select><div class="sync-audio-results" id="sync-audio-results"></div><button class="secondary full" id="sync-audio-more" hidden>显示更多音频</button><p class="note">选择后会用共享新稿替换旧稿，音频、词卡和进度保留。</p><div class="actions"><button class="secondary" id="sync-associate-back">返回</button><button class="primary" id="confirm-sync-associate" disabled>关联并更新</button></div>`);
  let selected='',count=40;
  function choices(){const query=modal.querySelector('#sync-audio-search').value.trim().toLocaleLowerCase(),folder=modal.querySelector('#sync-audio-folder').value;const eligible=episodes.filter(e=>(!folder||e.collectionId===folder)&&(!query||(e.filename+' '+e.title).toLocaleLowerCase().includes(query))).sort((a,b)=>Number(transcriptName(b.filename)===item.matchKey)-Number(transcriptName(a.filename)===item.matchKey));
   modal.querySelector('#sync-audio-results').innerHTML=eligible.slice(0,count).map(e=>`<label class="sync-audio-choice"><input type="radio" name="sync-audio-choice" value="${escapeHTML(e.id)}" ${selected===e.id?'checked':''}><span>${escapeHTML(e.title)}<small>${escapeHTML(e.filename)} · ${escapeHTML(folders.find(f=>f.id===e.collectionId)?.name||'未分类')}</small></span></label>`).join('')||'<p class="note">没有找到音频，请先在音频页导入。</p>';
   modal.querySelector('#sync-audio-more').hidden=eligible.length<=count;
   for(const input of modal.querySelectorAll('[name="sync-audio-choice"]'))input.onchange=()=>{selected=input.value;modal.querySelector('#confirm-sync-associate').disabled=false;};
  }
  on('#sync-audio-search','input',()=>{count=40;choices();});on('#sync-audio-folder','change',()=>{count=40;choices();});on('#sync-audio-more','click',()=>{count+=40;choices();});on('#sync-associate-back','click',()=>showSyncUI(context).catch(report));choices();
  on('#confirm-sync-associate','click',async()=>{const button=modal.querySelector('#confirm-sync-associate');button.disabled=true;try{await sync.associate(item,selected);toast('已关联，之后自动更新');await showSyncUI(context);}catch(error){report(error);button.disabled=false;}});
 }
 sync.uiRefresh=render;
 on('#sync-search','input',()=>{limit=40;render().catch(report);});on('#sync-filter-attention','click',()=>filter(true));on('#sync-filter-all','click',()=>filter(false));on('#sync-more','click',()=>{limit+=40;render().catch(report);});
 function filter(value){attention=value;limit=40;modal.querySelector('#sync-filter-attention').classList.toggle('active',value);modal.querySelector('#sync-filter-all').classList.toggle('active',!value);render().catch(report);}
 on('#sync-batch-open','click',()=>showSyncBatchUI(context).catch(report));
 on('#sync-refresh','click',async()=>{const button=modal.querySelector('#sync-refresh');button.disabled=true;try{await sync.refresh();await render();}catch(error){report(error);}finally{if(button.isConnected)button.disabled=false;}});
 on('#sync-logout','click',async()=>{try{await sync.logout();close();toast('已退出同步账号，本机资料保留');}catch(error){report(error);}});
 await render();sync.drain().catch(report);
}
