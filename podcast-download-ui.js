import {downloadLimits,cleanupCandidates} from './podcast-offline.js?v=2026.10.09.1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function downloadLabel(info){
 if(!info)return '下载';if(info.status==='ready')return '已下载';if(info.status==='queued')return '等待 · 取消';if(info.status==='cancelling')return '正在取消';if(info.status==='interrupted')return '重新下载';
 return info.opaque?'下载中 · 取消':`下载 ${Math.min(99,Math.floor((info.received||0)/Math.max(info.bytes,1)*100))}% · 取消`;
}
export async function showOfflineManager({manager,open,modal,current,episodes,favorites,size,remove,back,report,lock=()=>()=>{}}){
 const smallSize=size;size=n=>n>=1073741824?`${(n/1073741824).toFixed(1)} GB`:smallSize(n);
 const estimate=await manager.estimate(),selected=new Set();let query='';
 open('播客下载与容量',`<section class="offline-manager"><div class="offline-summary"><strong id="offline-total"></strong><span id="offline-count"></span></div><div class="storage-track"><span id="offline-meter"></span></div><div class="offline-limit-row"><label for="offline-limit">下载容量上限</label><select id="offline-limit">${downloadLimits.map(n=>`<option value="${n}" ${n===manager.limit?'selected':''}>${size(n)}</option>`).join('')}</select></div><p class="note">达到上限后停止新增下载，已有下载不会自动删除。</p><p class="note">听页全部资料约 ${size(estimate.usage||0)}</p><div class="copy-filters"><input id="offline-search" type="search" aria-label="搜索播客下载" placeholder="搜索下载的单集"><select id="offline-sort" aria-label="下载排序"><option value="size">占用最多在前</option><option value="newest">最新下载</option></select></div><button class="secondary full" id="offline-pick-finished">选中已听完且未喜欢的单集</button><label class="copy-select-all"><input id="offline-select-all" type="checkbox">全选当前列表</label><div class="copy-list" id="offline-rows"></div><div class="copy-footer"><span id="offline-selected" role="status"></span><button class="danger" id="offline-delete-selected" disabled>删除所选下载</button></div><details class="offline-help"><summary>下载与保存说明</summary><p class="note">删除下载会保留喜欢、逐字稿、词卡和收听进度。下载时请保持听页打开；关闭或锁屏可能中断。容量按音频大小估算，系统占用可能更多。离线音频不包含在学习备份中，可重新下载。</p></details></section>`);
 modal.classList.add('copy-manager','offline-dialog');const alive=current(),byId=new Map(episodes.map(e=>[e.id,e]));
 const entries=()=>{const map=new Map(manager.records);for(const [id,job] of manager.jobs)map.set(id,job.info);return [...map.values()].filter(d=>!query||d.title.toLocaleLowerCase().includes(query));};
 const sync=()=>{
  const rows=entries(),ready=rows.filter(d=>d.status==='ready');for(const id of [...selected])if(!manager.ready(id))selected.delete(id);
  const bytes=[...selected].reduce((n,id)=>n+(manager.records.get(id)?.bytes||0),0),all=modal.querySelector('#offline-select-all');
  all.checked=!!ready.length&&ready.every(d=>selected.has(d.id));all.indeterminate=ready.some(d=>selected.has(d.id))&&!all.checked;all.disabled=!ready.length;
  modal.querySelector('#offline-selected').textContent=selected.size?`已选 ${selected.size} 集 · 约 ${size(bytes)}`:'选择需要清理的下载';modal.querySelector('#offline-delete-selected').disabled=!selected.size;
 };
 const confirm=items=>{
  if(!items.length)return;
  open('删除播客下载？',`<p>将删除 ${items.length} 集下载，约 ${size(items.reduce((n,e)=>n+(e.bytes||0),0))}。</p><div class="copy-confirm-list">${items.map(e=>`<p>${esc(e.title)}</p>`).join('')}</div><p class="note">喜欢、逐字稿、词卡、收听进度和列表顺序都会保留。若正在播放所选下载，会先暂停。</p><p id="offline-delete-status" role="status"></p><div class="actions"><button class="secondary" id="offline-delete-back">返回</button><button class="danger" id="offline-delete-confirm">删除下载</button></div>`);
  modal.querySelector('#offline-delete-back').onclick=back;modal.querySelector('#offline-delete-confirm').onclick=async()=>{const button=modal.querySelector('#offline-delete-confirm'),returnButton=modal.querySelector('#offline-delete-back'),unlock=lock();button.disabled=true;returnButton.disabled=true;try{await remove(items.map(d=>d.id));unlock();await back();}catch(error){unlock();report(error);if(button.isConnected){button.disabled=false;returnButton.disabled=false;}}};
 };
 const render=()=>{
  if(!alive())return;
  const rows=entries().sort((a,b)=>modal.querySelector('#offline-sort').value==='newest'?(b.downloaded||0)-(a.downloaded||0):(b.bytes||0)-(a.bytes||0));
  modal.querySelector('#offline-total').textContent=`约 ${size(manager.used())} / ${size(manager.limit)}`;modal.querySelector('#offline-count').textContent=[...manager.records.values()].filter(d=>d.status==='ready').length+' 集已下载';modal.querySelector('#offline-meter').style.width=Math.min(100,manager.used()/manager.limit*100)+'%';
  const list=modal.querySelector('#offline-rows'),top=list.scrollTop;
  list.innerHTML=rows.length?rows.map(d=>`<div class="copy-row"><label class="copy-pick"><input type="checkbox" data-offline-pick="${esc(d.id)}" ${selected.has(d.id)?'checked':''} ${d.status==='ready'?'':'disabled'} aria-label="选择 ${esc(d.title)}"><span><strong>${esc(d.title)}${favorites.includes(d.id)?' ♥':''}</strong><small>${d.bytes?'约 '+size(d.bytes)+' · ':''}${d.status==='ready'?'已下载':d.status==='interrupted'?'下载已中断':downloadLabel(d)}</small></span></label><button class="copy-delete" data-offline-action="${esc(d.id)}" aria-label="${d.status==='ready'?'删除':d.status==='interrupted'?'重试':'取消'} ${esc(d.title)}">${d.status==='ready'?'删除':d.status==='interrupted'?'重试':'取消'}</button></div>`).join(''):'<p class="note copy-empty">暂无下载。在单集列表或播放界面点“下载”，即可离线收听。</p>';
  list.scrollTop=top;list.querySelectorAll('[data-offline-pick]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.offlinePick):selected.delete(input.dataset.offlinePick);sync();});
  list.querySelectorAll('[data-offline-action]').forEach(button=>button.onclick=()=>{const id=button.dataset.offlineAction;if(manager.jobs.has(id))manager.cancel(id);else if(manager.ready(id))confirm([manager.records.get(id)]);else if(byId.has(id))manager.download(byId.get(id)).catch(report);});sync();
 };
 modal.querySelector('#offline-limit').onchange=event=>manager.setLimit(Number(event.target.value)).catch(report);
 modal.querySelector('#offline-search').oninput=event=>{query=event.target.value.trim().toLocaleLowerCase();render();};modal.querySelector('#offline-sort').onchange=render;
 modal.querySelector('#offline-select-all').onchange=event=>{for(const d of entries().filter(d=>d.status==='ready'))event.target.checked?selected.add(d.id):selected.delete(d.id);render();};
 modal.querySelector('#offline-pick-finished').onclick=()=>{selected.clear();cleanupCandidates([...manager.records.values()],episodes,favorites).forEach(id=>selected.add(id));render();};
 modal.querySelector('#offline-delete-selected').onclick=()=>confirm([...manager.records.values()].filter(d=>selected.has(d.id)));render();return manager.subscribe(render);
}
