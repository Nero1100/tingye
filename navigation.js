// Tabs are peers. Only folder/player screens add depth to the app's history.
export function appRoute(hash){
 const value=String(hash||'').replace(/^#/,'');
 if(value.startsWith('audio/')&&value.length>6)return {view:'player',id:value.slice(6),hash:value};
 if(value.startsWith('folder/')&&value.length>7)return {view:'library',id:value.slice(7),hash:value};
 if(value.startsWith('podcast/')&&['shun','noriko'].includes(value.slice(8)))return {view:'library',podcasts:true,showId:value.slice(8),hash:value};
 if(value==='podcasts')return {view:'library',podcasts:true,hash:value};
 if(value==='favorites')return {view:'library',favorites:true,hash:value};
 const view=['cards','settings'].includes(value)?value:'library';
 return {view,hash:view};
}
export function setAppRoute(hash,replace=false,browser=window){
 const next='#'+hash;
 const route=appRoute(next),previous=appRoute(browser.location.hash),saved=browser.history.state?.tingyeRoute;
 const root=route.view!=='player'&&!route.id&&!route.showId;
 if(root){browser.history.replaceState({...browser.history.state,tingyeRoute:{trail:[route.hash]}},'',next);return;}
 if(saved?.trail?.at(-1)===hash&&browser.location.hash===next)return;
 let trail=saved?.trail?.at(-1)===previous.hash?[...saved.trail]:[previous.hash];
 if(replace){
  // Opening a deep link starts with a real library parent for both native and button back.
  const parent=route.podcasts?'podcasts':'library';
  browser.history.replaceState({...browser.history.state,tingyeRoute:{trail:[parent]}},'','#'+parent);
  browser.history.pushState({...browser.history.state,tingyeRoute:{trail:[parent,hash]}},'',next);return;
 }
 if(route.view==='player'&&previous.view==='player'||route.id&&previous.id&&route.view==='library'&&previous.view==='library'||route.showId&&previous.showId){
  trail[trail.length-1]=hash;browser.history.replaceState({...browser.history.state,tingyeRoute:{trail}},'',next);
 }else{trail.push(hash);browser.history.pushState({...browser.history.state,tingyeRoute:{trail}},'',next);}
}
export function backAppRoute(browser=window){
 const trail=browser.history.state?.tingyeRoute?.trail;
 if(trail?.length>1){browser.history.back();return true;}
 return false;
}
export function bindRouteRestore(browser,restore,onError=()=>{}){
 // A hash history traversal fires both popstate and hashchange. Never overlap renders.
 let running=null,pending=null,active=null;
 const schedule=()=>{
  const hash=browser.location.hash;
  if(running&&active===hash&&pending===null)return running;
  pending=hash;
  if(running)return running;
  running=Promise.resolve().then(async()=>{
   while(pending!==null){active=pending;pending=null;await restore(appRoute(active));}
  }).catch(onError).finally(()=>{running=null;active=null;});
  return running;
 };
 browser.addEventListener('popstate',schedule);
 browser.addEventListener('hashchange',schedule);
 return ()=>{browser.removeEventListener('popstate',schedule);browser.removeEventListener('hashchange',schedule);};
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
