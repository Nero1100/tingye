// Startup and history restoration replace an entry instead of adding another home.
export function appRoute(hash){
 const value=String(hash||'').replace(/^#/,'');
 if(value.startsWith('audio/')&&value.length>6)return {view:'player',id:value.slice(6),hash:value};
 const view=['cards','settings'].includes(value)?value:'library';
 return {view,hash:view};
}
export function setAppRoute(hash,replace=false,browser=window){
 const next='#'+hash;
 if(browser.location.hash===next)return;
 if(replace)browser.history.replaceState(browser.history.state,'',next);
 else browser.location.hash=hash;
}
export function bindHomeEdgeGuard(root,isHome){
 // Reserve the outer 16px gutter for the installed app's home boundary.
 // Content touches, other screens and open dialogs keep their usual gestures.
 const guard=event=>{
  if(!isHome()||!event.cancelable||event.touches.length!==1)return;
  const x=event.touches[0].clientX;
  if(x>=0&&x<=16)event.preventDefault();
 };
 root.addEventListener('touchstart',guard,{capture:true,passive:false});
 return ()=>root.removeEventListener('touchstart',guard,{capture:true});
}
