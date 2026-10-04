const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function copyInventory(episodes){
 return episodes.filter(e=>e.audio?.size>0).map(e=>({id:e.id,title:e.title||e.filename||'音频',filename:e.filename||'',language:e.language,collectionId:e.collectionId,folder:e.folder,bytes:e.audio.size,hash:e.audioCopyHash||'',fingerprint:e.fingerprint||''}));
}
export function matchingCopies(copies,query='',sort='size'){
 const needle=query.trim().toLocaleLowerCase();
 return copies.filter(e=>!needle||[e.title,e.filename,e.folder].some(v=>String(v||'').toLocaleLowerCase().includes(needle))).sort((a,b)=>sort==='name'?a.title.localeCompare(b.title,undefined,{numeric:true}):b.bytes-a.bytes||a.title.localeCompare(b.title,undefined,{numeric:true}));
}
export async function showCopyManager({load,open,modal,current,lock,remove,beforeDelete,afterDelete,report,size,folderName,language}){
 let copies=copyInventory(await load()),query='',sort='size',selected=new Set();
 const render=()=>{
  const total=copies.reduce((n,e)=>n+e.bytes,0);
  open('管理应用副本',`<div class="copy-manager-body"><p class="copy-summary"><strong>${copies.length} 份副本</strong><span>${size(total)}</span></p><p class="note">删除副本会保留逐字稿、词卡和进度；再次播放时需选择原音频。手机「文件」中的原文件不会删除。</p>${copies.length?`<div class="copy-filters"><input id="copy-search" type="search" aria-label="搜索音频副本" placeholder="搜索音频或文件名" value="${escape(query)}"><select id="copy-sort" aria-label="副本排序"><option value="size" ${sort==='size'?'selected':''}>占用最多在前</option><option value="name" ${sort==='name'?'selected':''}>文件名顺序</option></select></div><label class="copy-select-all"><input id="copy-select-all" type="checkbox">全选当前列表</label><div class="copy-list" id="copy-list"></div><div class="copy-footer"><span id="copy-selected" role="status" aria-live="polite"></span><button class="danger" id="delete-selected-copies" disabled>删除所选副本</button></div>`:'<div class="copy-empty"><p>没有已保存的音频副本</p><p class="note">直接读取原文件的音频不占用副本空间。</p></div>'}</div>`);
  modal.classList.add('copy-manager');
  if(!copies.length)return;
  const sync=()=>{
   const visible=matchingCopies(copies,query,sort),picked=copies.filter(e=>selected.has(e.id)),check=modal.querySelector('#copy-select-all');
   check.checked=visible.length>0&&visible.every(e=>selected.has(e.id));check.indeterminate=visible.some(e=>selected.has(e.id))&&!check.checked;check.disabled=!visible.length;
   modal.querySelector('#copy-selected').textContent=picked.length?`已选 ${picked.length} 份 · ${size(picked.reduce((n,e)=>n+e.bytes,0))}`:'选择需要清理的副本';
   modal.querySelector('#delete-selected-copies').disabled=!picked.length;
  };
  const rows=()=>{
   const visible=matchingCopies(copies,query,sort),list=modal.querySelector('#copy-list');
   list.innerHTML=visible.length?visible.map(e=>`<div class="copy-row"><label class="copy-pick"><input type="checkbox" data-copy-id="${escape(e.id)}" aria-label="选择 ${escape(e.title)}" ${selected.has(e.id)?'checked':''}><span><strong>${escape(e.title)}</strong><small>${escape(e.filename)} · ${escape(folderName(e))} · ${escape(language[e.language]||'音频')}</small><small>${size(e.bytes)}</small></span></label><button class="copy-delete" data-delete-copy="${escape(e.id)}" aria-label="删除 ${escape(e.title)} 的副本">删除</button></div>`).join(''):'<p class="note copy-empty">没有匹配的副本</p>';
   list.querySelectorAll('[data-copy-id]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.copyId):selected.delete(input.dataset.copyId);sync();});
   list.querySelectorAll('[data-delete-copy]').forEach(button=>button.onclick=()=>confirmDelete(copies.filter(e=>e.id===button.dataset.deleteCopy)));
   sync();
  };
  modal.querySelector('#copy-search').oninput=event=>{query=event.target.value;rows();};
  modal.querySelector('#copy-sort').onchange=event=>{sort=event.target.value;rows();};
  modal.querySelector('#copy-select-all').onchange=event=>{matchingCopies(copies,query,sort).forEach(e=>event.target.checked?selected.add(e.id):selected.delete(e.id));rows();};
  modal.querySelector('#delete-selected-copies').onclick=()=>confirmDelete(copies.filter(e=>selected.has(e.id)));
  rows();
 };
 const confirmDelete=items=>{
  if(!items.length)return;
  open('删除应用副本？',`<p>将删除 ${items.length} 份副本，占用 ${size(items.reduce((n,e)=>n+e.bytes,0))}。</p><div class="copy-confirm-list">${items.map(e=>`<p>${escape(e.title)}</p>`).join('')}</div><p class="note">默认仅删除音频副本，保留逐字稿、词卡、进度及列表顺序。以后需要重新选择原音频才能播放。</p><label class="checkbox-line copy-remove-records"><input id="copy-remove-records" type="checkbox">同时删除这些音频的记录、逐字稿和词卡</label><p class="note">手机「文件」中的原音频不受影响。</p><p id="copy-delete-status" class="note" role="status"></p><div class="actions"><button class="secondary" id="cancel-copy-delete">返回</button><button class="danger" id="confirm-copy-delete">确认删除副本</button></div>`);
  const checkbox=modal.querySelector('#copy-remove-records'),confirm=modal.querySelector('#confirm-copy-delete');
  checkbox.onchange=()=>confirm.textContent=checkbox.checked?'确认删除副本和学习资料':'确认删除副本';
  modal.querySelector('#cancel-copy-delete').onclick=render;
  confirm.onclick=async()=>{
   const isCurrent=current(),removeRecords=checkbox.checked,unlock=lock();let committed=false;confirm.disabled=true;checkbox.disabled=true;modal.querySelector('#cancel-copy-delete').disabled=true;modal.querySelector('#copy-delete-status').textContent='正在删除…';
   try{
    await beforeDelete(items.map(e=>e.id));
    if(!isCurrent())return;
    const result=await remove(items,{removeRecords});committed=true;await afterDelete(result);
    copies=copyInventory(await load());selected=new Set([...selected].filter(id=>copies.some(e=>e.id===id)));
    if(isCurrent())render();
   }catch(error){
    report(error);
    if(isCurrent()){modal.querySelector('#copy-delete-status').textContent=committed?'副本已删除，列表刷新未完成。请关闭后重新打开。':'删除未完成，原副本保留。请返回列表重新选择。';confirm.disabled=committed;checkbox.disabled=committed;modal.querySelector('#cancel-copy-delete').disabled=false;}
   }finally{unlock();}
  };
 };
 render();
}
