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
// A shuffle cycle visits every track before starting another cycle. History
// lets Previous retrace what was actually heard without changing saved order.
export class ShuffleQueue{
 constructor(random=Math.random){this.random=random;this.reset();}
 reset(){this.scope='';this.remaining=[];this.history=[];this.cursor=-1;}
 sync(ids,current){
  const scope=JSON.stringify([...ids].sort());
  if(scope!==this.scope){this.reset();this.scope=scope;this.remaining=ids.filter(id=>id!==current);}
  if(ids.includes(current))this.select(current);
 }
 select(id){
  if(!id||this.history[this.cursor]===id)return;
  this.history.splice(this.cursor+1);this.history.push(id);this.cursor=this.history.length-1;
  this.remaining=this.remaining.filter(candidate=>candidate!==id);
 }
 next(ids,current,direction=1){
  if(!ids.length)return null;
  this.sync(ids,current);
  if(direction<0)return this.cursor>0?this.history[--this.cursor]:null;
  if(this.cursor<this.history.length-1)return this.history[++this.cursor];
  if(!this.remaining.length)this.remaining=ids.filter(id=>id!==current);
  if(!this.remaining.length)return ids[0];
  const index=Math.min(this.remaining.length-1,Math.floor(this.random()*this.remaining.length));
  const [id]=this.remaining.splice(index,1);this.select(id);return id;
 }
}
export function playbackTarget(episodes,currentId,{mode='sequence',direction=1,automatic=false,shuffle}={}){
 if(automatic&&mode==='single')return episodes.some(e=>e.id===currentId)?currentId:null;
 if(mode==='shuffle')return shuffle.next(episodes.map(e=>e.id),currentId,direction);
 if(!episodes.some(e=>e.id===currentId))return direction>0?episodes[0]?.id||null:episodes.at(-1)?.id||null;
 return nextEpisodeId(episodes,currentId,direction);
}
export function sortAudioFiles(files){return [...files].sort((a,b)=>collator.compare(a.webkitRelativePath||a.name,b.webkitRelativePath||b.name));}
export async function findAudioMatch(episodes,file,hash,sizeOf,hashOf,sameContent=()=>true){
 for(const candidate of episodes.filter(e=>e.filename===file.name&&sizeOf(e)===file.size)){
  const oldHash=candidate.fingerprint||await hashOf(candidate);
  if(oldHash===hash&&await sameContent(candidate))return {episode:candidate,hash:oldHash,writeFingerprint:!candidate.fingerprint};
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
