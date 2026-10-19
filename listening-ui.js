import {listeningNames,validListeningGroup} from './listening-groups.js?v=2026.10.19.1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function listeningTabs(group,counts){return `<div class="listening-tabs" role="group" aria-label="收听分类">${[['','全部'],...Object.entries(listeningNames)].map(([id,label])=>`<button type="button" data-listening-group="${id}" class="${group===id?'selected':''}" aria-pressed="${group===id}">${label}<small>${counts[id]||0}</small></button>`).join('')}</div>`;}
export function listeningTags(groups,id){return Object.entries(listeningNames).filter(([group])=>groups[group].includes(id)).map(([group,name])=>`<span class="listening-tag ${group}">${name}</span>`).join('');}
export async function showListeningPicker(ctx,group){
 if(!validListeningGroup(group))return;
 const entries=await ctx.favorites(),selected=new Set(),existing=new Set(ctx.groups()[group]);let query='',saving=false;
 ctx.open('添加到'+listeningNames[group],`<p class="note listening-picker-note">从喜欢的${esc(ctx.languageLabel||'')}单集中选择，可多选。</p><label class="sr-only" for="listening-picker-search">搜索喜欢的单集</label><input type="search" id="listening-picker-search" placeholder="搜索喜欢的单集" autocomplete="off"><div class="listening-picker-tools"><button type="button" id="listening-pick-visible">全选当前结果</button><span id="listening-pick-count"></span></div><div class="playlist-rows listening-pick-rows"></div><div class="listening-picker-footer"><span id="listening-selected" role="status">已选 0 集</span><button type="button" class="primary" id="listening-pick-save" disabled>添加 0 集</button></div><p class="note listening-copy-note">分类只引用单集，不额外保存音频。</p>`);
 ctx.sheet();const current=ctx.current(),modal=ctx.modal,rows=modal.querySelector('.listening-pick-rows'),button=modal.querySelector('#listening-pick-save');
 const visible=()=>entries.filter(e=>!query||(e.title+' '+ctx.folderName(e)).toLocaleLowerCase().includes(query));
 function status(){modal.querySelector('#listening-selected').textContent='已选 '+selected.size+' 集';button.textContent='添加 '+selected.size+' 集';button.disabled=saving||!selected.size;}
 function render(){
  const items=visible();modal.querySelector('#listening-pick-count').textContent=items.length+' 集';
  modal.querySelector('#listening-pick-visible').disabled=saving||items.every(e=>existing.has(e.id));
  rows.innerHTML=items.length?items.map(e=>`<label class="listening-pick-row ${existing.has(e.id)?'already-added':''}"><input type="checkbox" data-listening-pick="${esc(e.id)}" ${existing.has(e.id)||selected.has(e.id)?'checked':''} ${existing.has(e.id)||saving?'disabled':''}><span class="favorite-cover">${ctx.cover(e)}</span><span class="episode-info"><strong>${esc(e.title)}</strong><small>${esc(ctx.folderName(e))} · ${ctx.duration(e)}${existing.has(e.id)?' · 已添加':''}</small></span></label>`).join(''):'<p class="listening-picker-empty">'+(query?'没有匹配的单集':'先在播客或播放界面点爱心，收藏喜欢的单集。')+'</p>';
  rows.querySelectorAll('[data-listening-pick]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.listeningPick):selected.delete(input.dataset.listeningPick);status();});ctx.paint();status();
 }
 modal.querySelector('#listening-picker-search').oninput=event=>{query=event.target.value.trim().toLocaleLowerCase();render();};
 modal.querySelector('#listening-pick-visible').onclick=()=>{const available=visible().filter(e=>!existing.has(e.id));const all=available.every(e=>selected.has(e.id));for(const e of available)all?selected.delete(e.id):selected.add(e.id);render();};
 button.onclick=async()=>{
  if(saving||!selected.size)return;saving=true;ctx.lock(true);render();const count=selected.size;
  try{await ctx.change(group,[...selected],'add',true);if(current()){ctx.lock(false);ctx.close();ctx.refresh();}ctx.toast('已添加 '+count+' 集到'+listeningNames[group]);}
  catch(error){if(current()){ctx.report(error);saving=false;ctx.lock(false);render();}}
 };
 render();
}
export function showListeningActions(ctx,entry,group=''){
 const groups=ctx.groups(),other=group==='intensive'?'extensive':'intensive';
 const actions=group?[
  {action:'both',label:'同时加入'+listeningNames[other],disabled:groups[other].includes(entry.id)},
  {action:'move',label:'移到'+listeningNames[other]},
  {action:'remove',label:'移出'+listeningNames[group],danger:true}
 ]:Object.entries(listeningNames).map(([target,label])=>({action:'add',target,label:groups[target].includes(entry.id)?'已加入'+label:'加入'+label,disabled:groups[target].includes(entry.id)}));
 ctx.open('单集分类',`<p class="listening-action-title">${esc(entry.title)}</p><div class="playlist-rows listening-action-rows">${actions.map((a,i)=>`<button type="button" class="listening-action ${a.danger?'danger-text':''}" data-listening-action="${i}" ${a.disabled?'disabled':''}>${esc(a.label)}</button>`).join('')}</div><p class="note listening-copy-note">移出分类后，喜欢、音频和逐字稿仍会保留。</p>`);
 ctx.sheet();const current=ctx.current();let saving=false;
 ctx.modal.querySelectorAll('[data-listening-action]').forEach(button=>button.onclick=async()=>{
  if(saving)return;saving=true;ctx.lock(true);ctx.modal.querySelectorAll('[data-listening-action]').forEach(b=>b.disabled=true);
  const action=actions[Number(button.dataset.listeningAction)];
  try{await ctx.change(action.target||group,[entry.id],action.action);if(current()){ctx.lock(false);ctx.close();ctx.refresh();}ctx.toast(action.action==='remove'?'已移出'+listeningNames[group]:'单集分类已更新');}
  catch(error){if(current()){ctx.report(error);ctx.lock(false);showListeningActions(ctx,entry,group);}}
 });
}
