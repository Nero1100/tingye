import {replaceSubsetOrder} from './drag-order.js';
import {validatePlaybackLists} from './playback-list.js';
export const LISTENING_GROUPS='listening-groups-v1',LISTENING_VIEW='listening-group-view-v1';
export const listeningNames=Object.freeze({intensive:'精听',extensive:'泛听'});
export const validListeningGroup=group=>Object.hasOwn(listeningNames,group);
export const listeningScope=(group,language='')=>validListeningGroup(group)&&['','ja','en','fr'].includes(language)?'listening/'+group+(language?'/'+language:''):'';
export const isListeningScope=value=>typeof value==='string'&&/^listening\/(?:intensive|extensive)(?:\/(?:ja|en|fr))?$/.test(value);
export const listeningScopeGroup=value=>isListeningScope(value)?value.split('/')[1]:'';
export const listeningScopeLanguage=value=>isListeningScope(value)?value.split('/')[2]||'':'';
export const listeningScopes=()=>Object.keys(listeningNames).flatMap(group=>['','ja','en','fr'].map(language=>listeningScope(group,language)));
export function validateListeningGroups(value={intensive:[],extensive:[]}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!validListeningGroup(key)))throw Error('精听与泛听分类资料不正确。');
 for(const group of Object.keys(listeningNames)){
  const ids=value[group];
  if(!Array.isArray(ids)||ids.length>5000||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id||id.length>100))throw Error('精听与泛听分类资料不正确。');
 }
 return value;
}
export function listeningEpisodes(episodes,value,group){
 validateListeningGroups(value);if(!validListeningGroup(group))throw Error('请选择精听或泛听。');
 const byId=new Map(episodes.map(e=>[e.id,e]));return value[group].map(id=>byId.get(id)).filter(Boolean);
}
export function changeListeningGroups(value,group,ids,action='add'){
 validateListeningGroups(value);
 if(!validListeningGroup(group)||!['add','remove','move','both'].includes(action)||!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id||id.length>100))throw Error('分类已变化，请重新选择单集。');
 const next={intensive:[...value.intensive],extensive:[...value.extensive]},selected=new Set(ids),other=group==='intensive'?'extensive':'intensive';
 if(action==='remove'||action==='move')next[group]=next[group].filter(id=>!selected.has(id));
 if(action==='add')next[group]=[...new Set([...next[group],...ids])];
 if(action==='move'||action==='both'){
  if(ids.some(id=>!value[group].includes(id)))throw Error('这集已移出当前分类，请重新打开。');
  next[other]=[...new Set([...next[other],...ids])];
 }
 return validateListeningGroups(next);
}
export function reorderListeningGroups(value,group,before,after){
 validateListeningGroups(value);if(!validListeningGroup(group))throw Error('请选择精听或泛听。');
 const visible=new Set(before),latest=value[group].filter(id=>visible.has(id));
 if(latest.length!==before.length||latest.some((id,i)=>id!==before[i]))throw Error('分类顺序已在其他窗口修改，请重新打开后排序。');
 return {...value,[group]:replaceSubsetOrder(value[group],before,after)};
}
export function pruneListeningGroups(value,available){
 value=validateListeningGroups(value);const ids=new Set(available);
 return {intensive:value.intensive.filter(id=>ids.has(id)),extensive:value.extensive.filter(id=>ids.has(id))};
}
export function restoreListeningGroups(existing,incoming,idMap){
 existing=validateListeningGroups(existing);incoming=validateListeningGroups(incoming);
 return validateListeningGroups(Object.fromEntries(Object.keys(listeningNames).map(group=>[group,[...new Set([...existing[group],...incoming[group].map(id=>idMap.get(id)).filter(Boolean)])]])));
}
export function reconcileListeningPlaylists(lists,groups,reorderedGroup=''){
 validatePlaybackLists(lists);validateListeningGroups(groups);
 return lists.map(state=>{
  if(!isListeningScope(state.scope))return state;
  const group=listeningScopeGroup(state.scope),members=new Set(groups[group]);
  let ids=state.ids.filter(id=>members.has(id));
  if(group===reorderedGroup){const selected=new Set(ids);ids=groups[group].filter(id=>selected.has(id));}
  return {...state,ids,excluded:state.excluded.filter(id=>members.has(id))};
 });
}
