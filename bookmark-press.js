// Copy on release, retaining the touch gesture needed by Safari's clipboard.
export function bindBookmarkPress(button,{tap,copy},delay=550){
 let timer=null,gesture=null,suppressClick=false;
 const cancel=()=>{clearTimeout(timer);timer=null;};
 const copyHeld=()=>{if(gesture&&!gesture.copied){gesture.copied=true;suppressClick=true;copy();}};
 button.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.isPrimary===false)return;
  cancel();suppressClick=false;gesture={id:event.pointerId,x:event.clientX,y:event.clientY,held:false,moved:false,copied:false};
  timer=setTimeout(()=>{timer=null;if(gesture)gesture.held=true;},delay);
 });
 button.addEventListener('pointermove',event=>{
  if(gesture?.id!==event.pointerId)return;
  if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>12){cancel();gesture.moved=true;suppressClick=true;}
 });
 button.addEventListener('pointerup',event=>{
  if(gesture?.id!==event.pointerId)return;
  cancel();if(gesture.held&&!gesture.moved)copyHeld();gesture=null;
 });
 for(const name of ['pointercancel','pointerleave'])button.addEventListener(name,()=>{cancel();if(gesture)suppressClick=true;gesture=null;});
 button.addEventListener('contextmenu',event=>{
  event.preventDefault();if(gesture){if(!gesture.moved)copyHeld();}else{suppressClick=true;copy();}
 });
 button.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;return;}tap();});
 button.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.shiftKey){event.preventDefault();copy();}});
}
