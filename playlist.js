const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
export function orderedEpisodes(episodes,mode='manual'){
 const items=[...episodes];
 if(mode==='name')return items.sort((a,b)=>collator.compare(a.filename||a.title,b.filename||b.title));
 if(mode==='newest')return items.sort((a,b)=>b.created-a.created);
 return items.sort((a,b)=>{
  const x=Number.isFinite(a.order)?a.order:Infinity,y=Number.isFinite(b.order)?b.order:Infinity;
  return x-y||b.created-a.created||collator.compare(a.title,b.title);
 });
}
export function moveEpisode(ids,id,offset){
 const result=[...ids],from=result.indexOf(id),to=from+offset;
 if(from<0||to<0||to>=result.length)return result;
 [result[from],result[to]]=[result[to],result[from]];return result;
}
export function nextEpisodeId(episodes,currentId,direction){
 const index=episodes.findIndex(e=>e.id===currentId);return index<0?null:episodes[index+direction]?.id||null;
}
export function sortAudioFiles(files){return [...files].sort((a,b)=>collator.compare(a.webkitRelativePath||a.name,b.webkitRelativePath||b.name));}
export async function findAudioMatch(episodes,file,hash,sizeOf,hashOf){
 for(const candidate of episodes.filter(e=>e.filename===file.name&&sizeOf(e)===file.size)){
  const oldHash=candidate.fingerprint||await hashOf(candidate);
  if(oldHash===hash)return {episode:candidate,hash:oldHash,writeFingerprint:!candidate.fingerprint};
 }return null;
}
export function appendedOrder(episodes){return Math.max(episodes.length,...episodes.filter(e=>Number.isFinite(e.order)).map(e=>e.order+1));}
export function bindPress(button,tap,hold,delay=600){
 let timer=null,origin=null,held=false;
 const cancel=()=>{clearTimeout(timer);timer=null;};
 button.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;cancel();held=false;origin=[event.clientX,event.clientY];
  timer=setTimeout(()=>{timer=null;held=true;hold();},delay);
 });
 button.addEventListener('pointermove',event=>{if(origin&&Math.hypot(event.clientX-origin[0],event.clientY-origin[1])>12)cancel();});
 for(const name of ['pointerup','pointercancel','pointerleave'])button.addEventListener(name,cancel);
 button.addEventListener('contextmenu',event=>event.preventDefault());
 button.addEventListener('click',event=>{if(held){event.preventDefault();held=false;return;}tap();});
}
