export function replaceSubsetOrder(allIds,visibleIds,orderedIds){
 const members=new Set(visibleIds);
 if(members.size!==visibleIds.length||new Set(orderedIds).size!==orderedIds.length||orderedIds.length!==visibleIds.length||orderedIds.some(id=>!members.has(id))||visibleIds.some(id=>!allIds.includes(id)))throw Error('音频列表已变化，请重新打开后排序。');
 let index=0;return allIds.map(id=>members.has(id)?orderedIds[index++]:id);
}
// Handles reserve their own touch area; scrolling elsewhere never starts sorting.
export function bindDragOrder(root,{onDrop,onError,scroller=root,bottomEdge}){
 if(!root)return;
 let drag=null,frame=null,busy=false;
 const rows=()=>[...root.querySelectorAll('[data-sort-row]')];
 const ids=()=>rows().map(row=>row.dataset.sortRow);
 const stop=()=>{cancelAnimationFrame(frame);frame=null;};
 function position(y){
  if(!drag)return;drag.y=y;
  const siblings=rows().filter(row=>row!==drag.row),before=siblings.find(row=>{const rect=row.getBoundingClientRect();return y<rect.top+rect.height/2;});
  if(before)root.insertBefore(drag.row,before);else root.append(drag.row);
 }
 function scroll(){
  if(!drag)return;const rect=scroller.getBoundingClientRect(),bottom=Math.min(rect.bottom,bottomEdge?.()??rect.bottom),edge=45;
  const delta=drag.y<rect.top+edge?-Math.min(16,(rect.top+edge-drag.y)/3):drag.y>bottom-edge?Math.min(16,(drag.y-bottom+edge)/3):0;
  if(delta){scroller.scrollTop+=delta;position(drag.y);}frame=requestAnimationFrame(scroll);
 }
 function clean(cancel){
  if(!drag)return null;const previous=drag;stop();drag=null;
  if(cancel)for(const row of previous.originalRows)root.append(row);
  previous.row.classList.remove('dragging');previous.handle.setAttribute('aria-pressed','false');
  try{root.releasePointerCapture(previous.pointer);}catch{}
  return previous;
 }
 async function commit(before,after){
  if(before.every((id,i)=>id===after[i]))return;
  busy=true;root.setAttribute('aria-busy','true');
  try{await onDrop(after,before);}catch(error){onError?.(error);}
  finally{busy=false;root.removeAttribute('aria-busy');}
 }
 root.addEventListener('pointerdown',event=>{
  const handle=event.target.closest('[data-drag-id]');if(!handle||busy||event.button!==0||event.isPrimary===false)return;
  event.preventDefault();const row=handle.closest('[data-sort-row]');if(!row)return;
  drag={row,handle,pointer:event.pointerId,y:event.clientY,originalRows:rows(),before:ids()};
  row.classList.add('dragging');handle.setAttribute('aria-pressed','true');root.setPointerCapture(event.pointerId);frame=requestAnimationFrame(scroll);
 });
 root.addEventListener('pointermove',event=>{if(drag&&drag.pointer===event.pointerId){event.preventDefault();position(event.clientY);}});
 root.addEventListener('pointerup',event=>{if(drag&&drag.pointer===event.pointerId){event.preventDefault();position(event.clientY);const previous=clean(false);commit(previous.before,ids());}});
 root.addEventListener('pointercancel',()=>clean(true));
 root.addEventListener('lostpointercapture',()=>clean(true));
 root.addEventListener('contextmenu',event=>{if(event.target.closest('[data-drag-id]'))event.preventDefault();});
 root.addEventListener('click',event=>{if(event.target.closest('[data-drag-id]')){event.preventDefault();event.stopPropagation();}},true);
 root.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&drag){event.preventDefault();clean(true);return;}
  const handle=event.target.closest('[data-drag-id]');if(!handle||busy||!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const before=ids(),from=before.indexOf(handle.dataset.dragId),to=from+(event.key==='ArrowUp'?-1:1);
  if(to<0||to>=before.length)return;const after=[...before];[after[from],after[to]]=[after[to],after[from]];commit(before,after);
 });
}
