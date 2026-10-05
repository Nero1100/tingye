import {matchingEpisode} from './cloud-transcript.js';
export function syncPanel(sync){
 const message=sync.error||(!sync.config?'尚未连接共享书库':!sync.user?'登录后自动接收电脑修订':!sync.role?'正在检查账号权限':sync.running?'正在同步…':sync.pending.length?`本机已保存 · ${sync.pending.length} 份等待同步`:'已连接 · 打开时自动获取最新逐字稿');
 return `<section class="panel"><h2>逐字稿同步</h2><p class="note" id="sync-summary">${escapeHTML(message)}</p><div class="stack"><button class="secondary full" id="open-transcript-sync">${sync.user?'管理逐字稿同步':'连接共享书库'}</button></div></section>`;
}
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function showSyncUI({sync,open,modal,all,read,write,on,close,report,toast,phone}){
 const episodes=await all('episodes');
 if(!sync.config){
  open('连接共享书库',`<p class="note">首次设置好免费项目后，把同一份连接信息填到需要同步的设备。连接信息不含密码；逐字稿只有获准的账号可以读取。</p><label for="sync-connection">同步连接信息</label><textarea id="sync-connection" rows="5" spellcheck="false" placeholder="粘贴项目配置的 JSON"></textarea><button class="primary full" id="save-sync-connection">连接</button>`);
  on('#save-sync-connection','click',async()=>{try{await sync.configure(JSON.parse(modal.querySelector('#sync-connection').value));toast('连接信息已保存，正在重新打开');location.reload();}catch(error){report(error);}});return;
 }
 if(!sync.user){
  open('登录共享书库',`<p class="note">使用项目中为你们创建的账号。任意手机、平板或电脑登录后，都可以接收逐字稿；音频仍需在各设备导入。</p><form id="sync-login-form"><label for="sync-email">邮箱</label><input id="sync-email" type="email" autocomplete="username" required><label for="sync-password">密码</label><input id="sync-password" type="password" autocomplete="current-password" required><p class="note" id="sync-login-status" role="status"></p><button class="primary full" type="submit">登录</button></form>`);
  on('#sync-login-form','submit',async event=>{event.preventDefault();const button=modal.querySelector('button[type=submit]');button.disabled=true;try{const password=modal.querySelector('#sync-password').value;await sync.login(modal.querySelector('#sync-email').value,password);modal.querySelector('#sync-password').value='';toast('已登录，正在读取共享书库');close();}catch(error){report(error);}finally{button.disabled=false;}});return;
 }
 const pending=sync.pending.length?`<p class="note">${sync.pending.length} 份本机修订等待同步。同步失败不会撤销电脑文件的保存。</p>`:'';
 open('逐字稿同步',`<p class="note">${escapeHTML(sync.user.email||'已登录')} · ${sync.role==='editor'?'可在电脑发布修订':sync.role==='reader'?'自动接收修订':'等待授权'}</p><p id="sync-dialog-status" class="note" role="status">${escapeHTML(sync.error||'共享逐字稿联网更新，学习资料各自保留。')}</p>${pending}<div class="actions"><button class="secondary" id="sync-refresh">立即同步</button><button class="secondary" id="sync-logout">退出登录</button></div><div class="sync-catalog">${sync.items.length?sync.items.map((item,index)=>{
  const match=matchingEpisode(item,episodes,sync.scope),e=match.episode,upToDate=e?.cloudTranscript?.hash===item.hash;
  return `<article class="sync-catalog-row"><strong>${escapeHTML(item.title||item.filename)}</strong><small>${escapeHTML(item.filename)}</small><p class="note">${upToDate?'已是最新稿':match.needsConfirmation?'已有本机逐字稿，关联后开始接收新稿':match.bound?'已关联，等待安全更新':escapeHTML(match.reason||'可接收最新稿')}</p><button class="secondary" data-sync-associate="${index}">${upToDate?'更换对应音频':'关联音频 / 获取最新稿'}</button></article>`;
 }).join(''):'<p class="note">电脑首次保存并同步逐字稿后，会显示在这里。</p>'}</div><p class="note">播放中收到的修订会在暂停后应用。完全关闭应用时，下次联网打开补齐更新。</p>`);
 on('#sync-refresh','click',async()=>{const button=modal.querySelector('#sync-refresh');button.disabled=true;try{await sync.refresh();modal.querySelector('#sync-dialog-status').textContent=sync.error||'已检查最新逐字稿';}catch(error){report(error);}finally{button.disabled=false;}});
 on('#sync-logout','click',async()=>{try{await sync.logout();close();toast('已退出同步账号，本机资料保留');}catch(error){report(error);}});
 for(const button of modal.querySelectorAll('[data-sync-associate]'))button.onclick=()=>{
  const item=sync.items[Number(button.dataset.syncAssociate)],eligible=episodes.filter(e=>e.language===item.language);
  open('关联共享逐字稿',`<p class="note">${escapeHTML(item.filename)} · ${Math.round(item.duration)} 秒</p><label for="sync-episode">这台设备上对应的音频</label><select id="sync-episode"><option value="">请选择音频</option>${eligible.map(e=>`<option value="${escapeHTML(e.id)}">${escapeHTML(e.title)} · ${escapeHTML(e.filename)}</option>`).join('')}</select><p class="note">确认后，新稿将替换所选音频的原文、译文、假名和时间轴，并接收后续修订；音频副本、词卡和进度保留。如果这份共享稿已关联其他音频，旧关联会取消，旧音频的资料仍保留。</p><button class="primary full" id="confirm-sync-associate">关联并使用最新稿</button>`);
  on('#confirm-sync-associate','click',async()=>{const id=modal.querySelector('#sync-episode').value;if(!id){toast('请选择对应音频');return;}const b=modal.querySelector('#confirm-sync-associate');b.disabled=true;try{await sync.associate(item,id);close();toast('已关联，之后自动接收新稿');}catch(error){report(error);}finally{b.disabled=false;}});
 };
}
