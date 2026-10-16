// Horizontal gestures reveal an action; a swipe alone never removes a folder.
export function bindFolderSwipes(root){
 if(!root)return ()=>{};
 const controller=new AbortController(),options={signal:controller.signal};
 let gesture=null,opened=null,suppressUntil=0,suppressRow=null;
 const clamp=x=>Math.max(-86,Math.min(86,x));
 function paint(row,offset){row.style.setProperty('--folder-shift',`${offset}px`);row.dataset.swipeSide=offset<0?'left':'right';}
 function settle(row,offset){
  row.classList.remove('folder-swiping');paint(row,offset);row.classList.toggle('folder-swipe-open',offset!==0);
  const action=row.querySelector('[data-folder-delete]');action.hidden=offset===0;
  row.querySelector('[data-folder-swipe-toggle]')?.setAttribute('aria-expanded',String(offset!==0));
  if(offset)opened=row;else if(opened===row)opened=null;
 }
 function close(){if(opened)settle(opened,0);}
 root.addEventListener('pointerdown',event=>{
  if(event.isPrimary===false||event.button!==0)return;
  const row=event.target.closest('[data-folder-row]');if(!row||event.target.closest('[data-folder-delete],[data-folder-swipe-toggle]'))return;
  if(opened&&opened!==row)close();
  gesture={row,id:event.pointerId,x:event.clientX,y:event.clientY,base:opened===row?(row.dataset.swipeSide==='left'?-86:86):0,dx:0,dragging:false};
 },options);
 root.addEventListener('pointermove',event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  if(!gesture.dragging){
   if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){gesture=null;return;}
   if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy)*1.35)return;
   gesture.dragging=true;gesture.row.classList.add('folder-swiping');gesture.row.setPointerCapture?.(event.pointerId);
   gesture.row.querySelector('[data-folder-delete]').hidden=false;
  }
  gesture.dx=dx;paint(gesture.row,clamp(gesture.base+dx));if(event.cancelable)event.preventDefault();
 },{...options,passive:false});
 function finish(event,cancelled=false){
  if(!gesture||gesture.id!==event.pointerId)return;const previous=gesture;gesture=null;
  if(!previous.dragging)return;
  const offset=cancelled?previous.base:clamp(previous.base+previous.dx);
  settle(previous.row,Math.abs(offset)>=34?Math.sign(offset)*86:0);
  suppressRow=previous.row;suppressUntil=Date.now()+450;
  if(previous.row.hasPointerCapture?.(event.pointerId))previous.row.releasePointerCapture(event.pointerId);
 }
 root.addEventListener('pointerup',event=>finish(event),options);
 root.addEventListener('pointercancel',event=>finish(event,true),options);
 root.addEventListener('click',event=>{
  const row=event.target.closest('[data-folder-row]');
  if(row===suppressRow&&Date.now()<suppressUntil&&!event.target.closest('[data-folder-delete],[data-folder-swipe-toggle]')){event.preventDefault();event.stopImmediatePropagation();return;}
  const toggle=event.target.closest('[data-folder-swipe-toggle]');if(toggle){settle(row,opened===row?0:-86);return;}
  if(opened&&!event.target.closest('[data-folder-delete]')){const same=opened===row;close();if(same){event.preventDefault();event.stopImmediatePropagation();}}
 },{...options,capture:true});
 root.addEventListener('keydown',event=>{if(event.key==='Escape')close();},options);
 const outside=event=>{if(!root.isConnected){controller.abort();return;}if(opened&&!opened.contains(event.target))close();};
 root.ownerDocument?.addEventListener('pointerdown',outside,options);
 return ()=>{controller.abort();gesture=null;};
}
