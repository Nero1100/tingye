export function replaceSubsetOrder(allIds,visibleIds,orderedIds){
 const members=new Set(visibleIds);
 if(members.size!==visibleIds.length||new Set(orderedIds).size!==orderedIds.length||orderedIds.length!==visibleIds.length||orderedIds.some(id=>!members.has(id))||visibleIds.some(id=>!allIds.includes(id)))throw Error('音频列表已变化，请重新打开后排序。');
 let index=0;return allIds.map(id=>members.has(id)?orderedIds[index++]:id);
}
// Velocity is measured per second, keeping edge scrolling consistent at 60/120 Hz.
export function dragScrollSpeed(y,top,bottom,edge=64){
 const zone=Math.min(edge,Math.max(1,(bottom-top)/3));
 if(y<top+zone)return -520*Math.min(1,Math.max(0,(top+zone-y)/zone))**2;
 if(y>bottom-zone)return 520*Math.min(1,Math.max(0,(y-bottom+zone)/zone))**2;
 return 0;
}
export function bindDragOrder(root,{onDrop,onError,scroller=root,bottomEdge}){
 if(!root)return;
 let drag=null,frame=null,busy=false;
 const motions=new Map(),reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 const rows=()=>[...root.querySelectorAll('[data-sort-row]')];
 const ids=()=>rows().map(row=>row.dataset.sortRow);
 const stop=()=>{cancelAnimationFrame(frame);frame=null;};
 function stopMotions(){for(const motion of motions.values())motion.cancel();motions.clear();}
 function layouts(){return new Map(rows().map(row=>[row,row.getBoundingClientRect()]));}
 function movePlaceholder(before){
  const order=rows(),index=order.indexOf(drag.row);
  if(order[index+1]===before||!before&&index===order.length-1)return;
  const previous=layouts();stopMotions();
  if(before)root.insertBefore(drag.row,before);else root.append(drag.row);
  drag.boxes=layouts();
  if(reduced())return;
  for(const row of rows()){
   if(row===drag.row)continue;
   const delta=previous.get(row).top-drag.boxes.get(row).top;
   if(Math.abs(delta)<.5||!row.animate)continue;
   const motion=row.animate([{transform:`translate3d(0,${delta}px,0)`},{transform:'translate3d(0,0,0)'}],{duration:180,easing:'cubic-bezier(.2,.75,.25,1)'});
   motions.set(row,motion);motion.onfinish=()=>{if(motions.get(row)===motion)motions.delete(row);};
  }
 }
 function position(){
  if(!drag)return;
  drag.ghost.style.transform=`translate3d(0,${drag.y-drag.offset-drag.top}px,0)`;
  const center=drag.y-drag.offset+drag.height/2;
  const before=rows().filter(row=>row!==drag.row).find(row=>{const box=drag.boxes.get(row);return center<box.top+box.height/2;});
  movePlaceholder(before);
 }
 function tick(now){
  if(!drag||drag.phase!=='moving')return;
  const dt=drag.lastTime===null?0:Math.min(32,Math.max(0,now-drag.lastTime));drag.lastTime=now;
  const rect=scroller.getBoundingClientRect(),bottom=Math.min(rect.bottom,bottomEdge?.()??rect.bottom),previous=scroller.scrollTop;
  scroller.scrollTop+=dragScrollSpeed(drag.y,rect.top,bottom)*dt/1000;
  const delta=scroller.scrollTop-previous;
  if(delta)for(const [row,box] of drag.boxes)drag.boxes.set(row,{top:box.top-delta,height:box.height});
  position();frame=requestAnimationFrame(tick);
 }
 function clean(cancel){
  if(!drag)return null;const previous=drag;stop();stopMotions();drag=null;
  previous.settling?.cancel();previous.ghost.remove();
  if(cancel)for(const row of previous.originalRows)root.append(row);
  previous.row.classList.remove('drag-placeholder');previous.handle.setAttribute('aria-pressed','false');
  root.classList.remove('sorting-active');
  try{root.releasePointerCapture(previous.pointer);}catch{}
  return previous;
 }
 async function commit(before,after){
  if(before.every((id,i)=>id===after[i]))return;
  busy=true;root.setAttribute('aria-busy','true');
  try{await onDrop(after,before);}catch(error){await onError?.(error);}
  finally{busy=false;root.removeAttribute('aria-busy');}
 }
 function drop(){
  position();stop();drag.phase='settling';
  const previous=drag,box=drag.boxes.get(drag.row),to=`translate3d(0,${box.top-drag.top}px,0)`;
  const finish=()=>{if(drag!==previous)return;const before=clean(false).before;commit(before,ids());};
  if(reduced()||!drag.ghost.animate){finish();return;}
  previous.settling=drag.ghost.animate([{transform:drag.ghost.style.transform},{transform:to}],{duration:150,easing:'cubic-bezier(.2,.75,.25,1)',fill:'forwards'});
  previous.settling.onfinish=finish;
 }
 root.addEventListener('pointerdown',event=>{
  if(drag){if(event.pointerId!==drag.pointer&&drag.phase==='moving')clean(true);return;}
  const handle=event.target.closest('[data-drag-id]');if(!handle||busy||event.button!==0||event.isPrimary===false)return;
  const row=handle.closest('[data-sort-row]');if(!row)return;
  event.preventDefault();const box=row.getBoundingClientRect(),ghost=row.cloneNode(true);
  ghost.removeAttribute('data-sort-row');ghost.removeAttribute('id');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
  for(const element of ghost.querySelectorAll('[id]'))element.removeAttribute('id');
  ghost.classList.add('drag-ghost');Object.assign(ghost.style,{top:`${box.top}px`,left:`${box.left}px`,width:`${box.width}px`,height:`${box.height}px`});
  (root.closest('dialog')||document.body).append(ghost);
  drag={row,handle,ghost,pointer:event.pointerId,y:event.clientY,top:box.top,height:box.height,offset:event.clientY-box.top,phase:'moving',lastTime:null,originalRows:rows(),before:ids(),boxes:layouts()};
  row.classList.add('drag-placeholder');root.classList.add('sorting-active');handle.setAttribute('aria-pressed','true');
  try{root.setPointerCapture(event.pointerId);}catch{clean(true);return;}
  frame=requestAnimationFrame(tick);
 });
 root.addEventListener('pointermove',event=>{if(drag?.phase==='moving'&&drag.pointer===event.pointerId){event.preventDefault();drag.y=event.clientY;}});
 root.addEventListener('pointerup',event=>{if(drag?.phase==='moving'&&drag.pointer===event.pointerId){event.preventDefault();drag.y=event.clientY;drop();}});
 root.addEventListener('pointercancel',event=>{if(drag?.pointer===event.pointerId)clean(true);});
 root.addEventListener('lostpointercapture',()=>{if(drag?.phase==='moving')clean(true);});
 root.addEventListener('contextmenu',event=>{if(event.target.closest('[data-drag-id]'))event.preventDefault();});
 root.addEventListener('click',event=>{if(event.target.closest('[data-drag-id]')){event.preventDefault();event.stopPropagation();}},true);
 root.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&drag){event.preventDefault();clean(true);return;}
  const handle=event.target.closest('[data-drag-id]');if(!handle||busy||drag||!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const before=ids(),from=before.indexOf(handle.dataset.dragId),to=from+(event.key==='ArrowUp'?-1:1);
  if(to<0||to>=before.length)return;const after=[...before];[after[from],after[to]]=[after[to],after[from]];commit(before,after);
 });
}
