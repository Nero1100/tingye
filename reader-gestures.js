// One delegated gesture listener lets swipes start on words without also tapping them.
export function bindReaderGestures(root,{onWord,onWordHold,onJump,onSwipe,onBrowse,onSentence},delay=600,tapDelay=320){
 let gesture=null,timer=null,suppress=false,tapTimer=null,pendingWord=null;
 const clear=()=>{clearTimeout(timer);timer=null;};
 const clearTap=()=>{clearTimeout(tapTimer);tapTimer=null;pendingWord=null;};
 root.addEventListener('pointerdown',event=>{
  if(event.isPrimary===false||event.button!==0){clear();clearTap();gesture=null;suppress=true;return;}
  clear();gesture=null;suppress=false;
  if(event.target.closest('button,input,select,textarea')&&!event.target.closest('[data-reader-jump],[data-mask-toggle]'))return;
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,held:false,word:event.target.closest('[data-word]')};
  if(gesture.word&&onWordHold)timer=setTimeout(()=>{if(!gesture||gesture.moved)return;clearTap();gesture.held=true;suppress=true;onWordHold(gesture.word);},delay);
 });
 root.addEventListener('pointermove',event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>12){
   clear();clearTap();suppress=true;if(!gesture.moved){gesture.moved=true;onBrowse?.(event.target);}
  }
 });
 root.addEventListener('pointerup',event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  const previous=gesture;clear();gesture=null;
  const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
  if(Math.hypot(dx,dy)>12){clearTap();suppress=true;}
  if(!previous.held&&Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)onSwipe(dx<0?1:-1,previous.word);
 });
 for(const name of ['pointercancel','pointerleave'])root.addEventListener(name,event=>{if(gesture){if(name==='pointercancel'&&!gesture.held)onBrowse?.(event.target);clear();clearTap();gesture=null;suppress=true;}});
 root.addEventListener('click',event=>{
  if(suppress){event.preventDefault();event.stopPropagation();suppress=false;return;}
  const word=event.target.closest('[data-word]');if(word){
   event.preventDefault();event.stopPropagation();
   if(pendingWord?.dataset.word===word.dataset.word){clearTap();onWord(word);}
   else{clearTap();pendingWord=word;tapTimer=setTimeout(()=>{clearTap();if(word.isConnected!==false)onSentence?.(word);},tapDelay);}
   return;
  }
  clearTap();
  const jump=event.target.closest('[data-reader-jump]');if(jump){event.preventDefault();onJump?.(Number(jump.dataset.readerJump));return;}
  if(event.target.closest('[data-mask-toggle]')||!event.target.closest('button,input,select,textarea'))onSentence?.(event.target);
 },true);
 root.addEventListener('dblclick',event=>{if(event.target.closest('[data-word]')){event.preventDefault();event.stopPropagation();}});
 root.addEventListener('contextmenu',event=>{
  const word=event.target.closest('[data-word]');if(!word||!onWordHold)return;
  event.preventDefault();clear();if(!gesture?.held){if(gesture)gesture.held=true;suppress=true;onWordHold(word);}
 });
 root.addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){clear();clearTap();suppress=false;}
  const word=event.target.closest('[data-word]');if(!word)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();onWord(word);}
  if(event.key==='F10'&&event.shiftKey&&onWordHold){event.preventDefault();onWordHold(word);}
 });
 root.addEventListener('wheel',()=>{clearTap();onBrowse?.();},{passive:true});
}
