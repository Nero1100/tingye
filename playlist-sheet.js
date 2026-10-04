// Only the playlist uses sheet gestures; other dialogs keep their edit guards.
export function bindPlaylistSheet(dialog,close){
 const controller=new AbortController(),options={signal:controller.signal};
 const handle=dialog.querySelector('.sheet-grip'),rows=dialog.querySelector('.playlist-rows');
 let start=null,distance=0,dragging=false,closing=false,timer=null,clickTimer=null,suppressClick=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function dismiss(){
  if(closing)return;closing=true;dialog.classList.remove('sheet-dragging');
  dialog.classList.add('sheet-closing');dialog.style.removeProperty('--sheet-drag');
  timer=setTimeout(close,reduced?0:200);
 }
 function begin(x,y){if(closing)return;start={x,y,time:performance.now()};distance=0;dragging=false;}
 function move(x,y){
  if(!start)return false;
  const dy=y-start.y;
  if(!dragging&&(dy<8||Math.abs(x-start.x)>dy))return false;
  dragging=true;distance=Math.max(0,dy);dialog.classList.add('sheet-dragging');
  dialog.style.setProperty('--sheet-drag',`${distance}px`);return true;
 }
 function finish(cancelled=false){
  if(!start)return;
  const velocity=distance/Math.max(1,performance.now()-start.time);
  const shouldClose=!cancelled&&dragging&&(distance>85||distance>30&&velocity>.5);
  suppressClick=dragging;clearTimeout(clickTimer);clickTimer=setTimeout(()=>{suppressClick=false;},350);start=null;dragging=false;
  dialog.classList.remove('sheet-dragging');dialog.style.removeProperty('--sheet-drag');
  if(shouldClose)dismiss();
 }
 for(const surface of [handle,dialog.querySelector('.dialog-head')]){
  surface.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button')&&surface!==handle)return;begin(e.clientX,e.clientY);surface.setPointerCapture(e.pointerId);},options);
  surface.addEventListener('pointermove',e=>{if(move(e.clientX,e.clientY))e.preventDefault();},options);
  surface.addEventListener('pointerup',()=>finish(),options);
  surface.addEventListener('pointercancel',()=>finish(true),options);
 }
 // At the top of the list, a downward touch pulls the sheet. Scrolling and
 // the independent reorder handles otherwise keep their normal gestures.
 rows.addEventListener('touchstart',e=>{
  if(e.touches.length!==1||rows.scrollTop>0||e.target.closest('.drag-handle'))return;
  const t=e.touches[0];begin(t.clientX,t.clientY);
 },{...options,passive:true});
 rows.addEventListener('touchmove',e=>{
  if(e.touches.length!==1){finish(true);return;}
  const t=e.touches[0];if(move(t.clientX,t.clientY))e.preventDefault();
 },{...options,passive:false});
 rows.addEventListener('touchend',()=>finish(),options);
 rows.addEventListener('touchcancel',()=>finish(true),options);
 dialog.addEventListener('click',e=>{
  if(suppressClick){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;return;}
  const r=dialog.getBoundingClientRect();
  if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))dismiss();
 },{...options,capture:true});
 dialog.addEventListener('cancel',e=>{e.preventDefault();dismiss();},options);
 return {dismiss,dispose(){clearTimeout(timer);clearTimeout(clickTimer);controller.abort();dialog.classList.remove('playlist-sheet','sheet-dragging','sheet-closing');dialog.style.removeProperty('--sheet-drag');}};
}
