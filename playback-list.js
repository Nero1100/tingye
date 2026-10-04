const validId=id=>typeof id==='string'&&id.length>0&&id.length<=100;
export function validatePlaybackLists(value=[]){
 if(!Array.isArray(value)||value.length>101)throw Error('播放列表资料不正确。');
 const scopes=new Set();
 for(const state of value){
  if(!state||typeof state.scope!=='string'||state.scope.length>100||scopes.has(state.scope)||
   ![state.ids,state.excluded].every(ids=>Array.isArray(ids)&&ids.length<=10000&&ids.every(validId)&&new Set(ids).size===ids.length)||
   state.ids.some(id=>state.excluded.includes(id)))throw Error('播放列表资料不正确。');
  scopes.add(state.scope);
 }
 return value;
}
// Keep queue choices separate from the audio library's metadata and order.
// New audio appends; tracks deliberately left out stay out until selected.
export function reconcilePlaybackList(episodes,state){
 const available=episodes.map(e=>e.id),members=new Set(available);
 const excluded=(state?.excluded||[]).filter(id=>members.has(id)),omitted=new Set(excluded);
 const ids=(state?.ids||[]).filter(id=>members.has(id)&&!omitted.has(id)),known=new Set(ids);
 for(const id of available)if(!known.has(id)&&!omitted.has(id)){ids.push(id);known.add(id);}
 return {scope:state?.scope||'',ids,excluded};
}
export function selectPlaybackEpisodes(episodes,state,selectedIds){
 const current=reconcilePlaybackList(episodes,state),available=episodes.map(e=>e.id),selected=new Set(selectedIds);
 if(selected.size!==selectedIds.length||selectedIds.some(id=>!available.includes(id)))throw Error('音频列表已变化，请重新选择。');
 const ids=current.ids.filter(id=>selected.has(id)),kept=new Set(ids);
 for(const id of available)if(selected.has(id)&&!kept.has(id))ids.push(id);
 return {...current,ids,excluded:available.filter(id=>!selected.has(id))};
}
export function reorderPlaybackList(state,before,ordered){
 const members=new Set(state.ids);
 if(before.length!==members.size||new Set(before).size!==members.size||before.some(id=>!members.has(id))||
  ordered.length!==members.size||new Set(ordered).size!==members.size||ordered.some(id=>!members.has(id)))throw Error('播放列表已变化，请重新打开后排序。');
 return {...state,ids:[...ordered],excluded:[...state.excluded]};
}
export function restorePlaybackLists(existing,incoming,episodeMap,folderMap){
 validatePlaybackLists(existing);validatePlaybackLists(incoming);
 const result=existing.map(state=>({...state,ids:[...state.ids],excluded:[...state.excluded]}));
 for(const state of incoming){
  const scope=state.scope?folderMap.get(state.scope):'';if(scope===undefined)continue;
  const ids=state.ids.map(id=>episodeMap.get(id)).filter(Boolean),excluded=state.excluded.map(id=>episodeMap.get(id)).filter(Boolean);
  const target=result.find(item=>item.scope===scope);
  if(target){target.ids.push(...ids);target.excluded.push(...excluded);}else result.push({scope,ids,excluded});
 }
 return validatePlaybackLists(result);
}
