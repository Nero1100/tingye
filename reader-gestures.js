// One delegated gesture listener lets swipes start on words without also tapping them.
export function bindReaderGestures(root,{onWord,onWordHold,onJump,onSwipe,onBrowse},delay=600){
 let gesture=null,timer=null,suppress=false;
 const clear=()=>{clearTimeout(timer);timer=null;};
 root.addEventListener('pointerdown',event=>{
  if(event.isPrimary===false||event.button!==0){clear();gesture=null;suppress=true;return;}
  clear();gesture=null;suppress=false;
  if(event.target.closest('button,input,select,textarea')&&!event.target.closest('[data-reader-jump]'))return;
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,held:false,word:event.target.closest('[data-word]')};
  if(gesture.word)timer=setTimeout(()=>{if(!gesture||gesture.moved)return;gesture.held=true;suppress=true;onWordHold(gesture.word);},delay);
 });
 root.addEventListener('pointermove',event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>12){
   clear();suppress=true;if(!gesture.moved){gesture.moved=true;onBrowse?.(event.target);}
  }
 });
 root.addEventListener('pointerup',event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  const previous=gesture;clear();gesture=null;
  const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
  if(Math.hypot(dx,dy)>12)suppress=true;
  if(!previous.held&&Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)onSwipe(dx<0?1:-1,previous.word);
 });
 for(const name of ['pointercancel','pointerleave'])root.addEventListener(name,event=>{if(gesture){if(name==='pointercancel'&&!gesture.held)onBrowse?.(event.target);clear();gesture=null;suppress=true;}});
 root.addEventListener('click',event=>{
  if(suppress){event.preventDefault();event.stopPropagation();suppress=false;return;}
  const word=event.target.closest('[data-word]');if(word){event.preventDefault();onWord(word);}
  const jump=event.target.closest('[data-reader-jump]');if(jump){event.preventDefault();onJump?.(Number(jump.dataset.readerJump));}
 },true);
 root.addEventListener('contextmenu',event=>{
  const word=event.target.closest('[data-word]');if(!word)return;
  event.preventDefault();clear();if(!gesture?.held){if(gesture)gesture.held=true;suppress=true;onWordHold(word);}
 });
 root.addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){clear();suppress=false;}
  const word=event.target.closest('[data-word]');if(!word)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();onWord(word);}
  if(event.key==='F10'&&event.shiftKey){event.preventDefault();onWordHold(word);}
 });
 root.addEventListener('wheel',()=>onBrowse?.(),{passive:true});
}
