import {applyTranscriptPatch,transcriptFingerprint,transcriptName} from './transcript-batch.js';
import {draftBlocksUpdate,acknowledgeTranscriptDraft} from './transcript-revisions.js';
import {FAVORITES,changeFavorite} from './favorites.js?v=2026.10.18.1';
import {validateFolders} from './folders.js';
import {LISTENING_GROUPS,validateListeningGroups,pruneListeningGroups,reconcileListeningPlaylists} from './listening-groups.js?v=2026.10.18.1';
export const FOLDER_DELETE_UNDO='folder-delete-undo-v1';
export const db = await new Promise((resolve,reject)=>{
  const request=indexedDB.open('tingye',2);
  request.onupgradeneeded=()=>{for(const name of ['episodes','cards','settings','progress'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
});
function rawRead(store,id){return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function rawAll(store){return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
const durationKey=id=>'track-duration/'+id;
const bookmarksKey=id=>'sentence-bookmarks/'+id;
export async function read(store,id){const value=await rawRead(store,id);if(store==='episodes'&&value){const [p,d,b]=await Promise.all([rawRead('progress',id),rawRead('settings',durationKey(id)),rawRead('settings',bookmarksKey(id))]);if(p)value.progress=p.seconds;if(Number.isFinite(d?.value)&&d.value>0)value.duration=d.value;if(Array.isArray(b?.value))value.bookmarks=b.value;}return value;}
export async function all(store){const values=await rawAll(store);if(store==='episodes'){const [positions,settings]=await Promise.all([rawAll('progress'),rawAll('settings')]);const progress=new Map(positions.map(p=>[p.id,p.seconds])),saved=new Map(settings.map(s=>[s.id,s.value]));for(const e of values){if(progress.has(e.id))e.progress=progress.get(e.id);const duration=saved.get(durationKey(e.id));if(Number.isFinite(duration)&&duration>0)e.duration=duration;const bookmarks=saved.get(bookmarksKey(e.id));if(Array.isArray(bookmarks))e.bookmarks=bookmarks;}}return values;}
// First playback learns duration without replacing the Blob the media decoder is reading.
export function saveDuration(id,duration){if(!id||!Number.isFinite(duration)||duration<=0)return Promise.resolve();return write('settings',{id:durationKey(id),value:duration});}
export function write(store,value){return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(value);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
// A refreshed enclosure/title must not replace an already revised transcript or progress.
export function upsertPodcastEpisode(record){return new Promise((resolve,reject)=>{
 const t=db.transaction('episodes','readwrite'),store=t.objectStore('episodes');let saved,failure;
 const request=store.get(record.id);request.onsuccess=()=>{try{
  const old=request.result;
  if(old&&(old.storageMode!=='stream'||old.podcast?.showId!==record.podcast.showId||old.podcast?.guid!==record.podcast.guid))throw Error('单集记录发生冲突，请重新打开节目。');
  saved=old?{...old,title:record.title,folder:record.folder,podcast:record.podcast,mime:record.mime,duration:old.duration||record.duration}:record;store.put(saved);
 }catch(error){failure=error;t.abort();}};
 t.oncomplete=()=>resolve(saved);t.onerror=()=>reject(failure||t.error);t.onabort=()=>reject(failure||t.error);
});}
export function updateBookmarks(id,change){return new Promise((resolve,reject)=>{
 // Never rewrite the audio Blob while its object URL is being decoded on iPhone.
 const t=db.transaction(['episodes','settings'],'readwrite'),store=t.objectStore('episodes'),settings=t.objectStore('settings');let next,failure;
 const request=store.get(id);request.onsuccess=()=>{try{
  const latest=request.result;if(!latest)throw Error('原音频已被移除。');
  const saved=settings.get(bookmarksKey(id));saved.onsuccess=()=>{try{
   const current=Array.isArray(saved.result?.value)?saved.result.value:latest.bookmarks||[];
   const bookmarks=change(current,{...latest,bookmarks:current});if(bookmarks.length>10000)throw Error('书签过多，请先整理句卡。');
   next={id,bookmarks};settings.put({id:bookmarksKey(id),value:bookmarks});
  }catch(error){failure=error;t.abort();}};
 }catch(error){failure=error;t.abort();}};
 t.oncomplete=()=>resolve(next);t.onerror=()=>reject(failure||t.error);t.onabort=()=>reject(failure||t.error);
});}
export function setEpisodeFavorite(id,liked){return new Promise((resolve,reject)=>{
 // Saving a heart never replaces the audio Blob being decoded on iPhone.
 const t=db.transaction(['episodes','settings'],'readwrite'),settings=t.objectStore('settings');let next,failure;
 const request=t.objectStore('episodes').get(id);request.onsuccess=()=>{try{
  if(!request.result)throw Error('这段音频已被移除。');
  const saved=settings.get(FAVORITES);saved.onsuccess=()=>{try{next=changeFavorite(saved.result?.value||[],id,liked);settings.put({id:FAVORITES,value:next});}catch(error){failure=error;t.abort();}};
 }catch(error){failure=error;t.abort();}};
 t.oncomplete=()=>resolve(next);t.onerror=()=>reject(failure||t.error);t.onabort=()=>reject(failure||t.error);
});}
// Read membership and queue metadata atomically; never replace a playing audio Blob.
export function updateListeningGroups(change,{reorderedGroup=''}={}){return new Promise((resolve,reject)=>{
 const t=db.transaction(['episodes','settings'],'readwrite'),settings=t.objectStore('settings');
 const values={},requests=[[LISTENING_GROUPS,settings.get(LISTENING_GROUPS)],['playback-lists',settings.get('playback-lists')],[FAVORITES,settings.get(FAVORITES)],['ids',t.objectStore('episodes').getAllKeys()]];let waiting=requests.length,result,failure;
 for(const [key,request] of requests)request.onsuccess=()=>{values[key]=key==='ids'?request.result:request.result?.value;if(--waiting)return;try{
  const available=new Set(values.ids),favorites=values[FAVORITES]||[],groups=validateListeningGroups(change(pruneListeningGroups(values[LISTENING_GROUPS]||undefined,values.ids),available,favorites));
  if(Object.values(groups).flat().some(id=>!available.has(id)))throw Error('有单集已被移除，请重新打开分类。');
  const playbackLists=reconcileListeningPlaylists(values['playback-lists']||[],groups,reorderedGroup);
  settings.put({id:LISTENING_GROUPS,value:groups});settings.put({id:'playback-lists',value:playbackLists});result={groups,playbackLists,favorites};
 }catch(error){failure=error;t.abort();}};
 t.oncomplete=()=>resolve(result);t.onerror=()=>reject(failure||t.error);t.onabort=()=>reject(failure||t.error||Error('分类更新未完成，请重试。'));
});}
export function remove(store,id){return new Promise((resolve,reject)=>{const t=db.transaction(store==='episodes'?['episodes','progress','settings']:store,'readwrite');t.objectStore(store).delete(id);if(store==='episodes'){t.objectStore('progress').delete(id);t.objectStore('settings').delete(durationKey(id));t.objectStore('settings').delete(bookmarksKey(id));}t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
export function saveBatch(episodes,cards,settings=[]){return new Promise((resolve,reject)=>{const t=db.transaction(['episodes','cards','settings'],'readwrite');for(const e of episodes)t.objectStore('episodes').put(e);for(const c of cards)t.objectStore('cards').put(c);for(const s of settings)t.objectStore('settings').put(s);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
// Folder removal never deletes an episode or touches its progress, cards or bookmarks.
// Read, detach and save undo in one transaction so another tab cannot lose changes.
export function changeAudioFolder(id,{restore=false,expectedFolder=null,undoToken=null}={}){return new Promise((resolve,reject)=>{
 const t=db.transaction(['episodes','settings'],'readwrite'),settings=t.objectStore('settings'),episodes=t.objectStore('episodes');
 const values={},keys=['audio-folders','playback-lists','playlist-scope',FOLDER_DELETE_UNDO];let waiting=keys.length,failure,result;
 const fail=error=>{failure=error;try{t.abort();}catch{}};
 t.oncomplete=()=>resolve(result);t.onerror=()=>reject(failure||t.error);t.onabort=()=>reject(failure||t.error||Error('文件夹更新未完成，请重试。'));
 for(const key of keys){const request=settings.get(key);request.onsuccess=()=>{values[key]=request.result?.value;if(--waiting===0)try{prepare();}catch(error){fail(error);}};}
 function prepare(){
  const folders=validateFolders(values['audio-folders']||[]),lists=values['playback-lists']||[],scope=values['playlist-scope']||'',undo=values[FOLDER_DELETE_UNDO];
  let folder,updated,nextLists,nextScope,members,snapshot;
  if(restore){
   if(!undo||undo.folder?.id!==id||undo.token!==undoToken)throw Error('撤销记录已更新，请重新打开音频页。');
   folder=undo.folder;if(folders.some(f=>f.id===id))throw Error('这个文件夹已经存在，无需重复恢复。');
   updated=[...folders];updated.splice(Math.min(undo.index,updated.length),0,folder);validateFolders(updated);
   nextLists=undo.playbackList&&!lists.some(list=>list.scope===id)?[...lists,undo.playbackList]:lists;
   nextScope=undo.wasActive&&!scope?id:scope;members=new Set(undo.members);snapshot=null;
  }else{
   folder=folders.find(f=>f.id===id);if(!folder)throw Error('这个文件夹已被删除。');
   if(expectedFolder&&JSON.stringify(folder)!==JSON.stringify(expectedFolder))throw Error('文件夹已在其他窗口修改，请重新打开后删除。');
   updated=folders.filter(f=>f.id!==id);nextLists=lists.filter(list=>list.scope!==id);nextScope=scope===id?'':scope;
   snapshot={token:crypto.randomUUID(),folder,index:folders.findIndex(f=>f.id===id),members:[],playbackList:lists.find(list=>list.scope===id)||null,wasActive:scope===id};
  }
  result={folders:updated,playbackLists:nextLists,playlistScope:nextScope,folder,changedIds:[],undo:snapshot};
  const request=episodes.openCursor();request.onsuccess=()=>{try{
   const cursor=request.result;
   if(!cursor){settings.put({id:'audio-folders',value:updated});settings.put({id:'playback-lists',value:nextLists});settings.put({id:'playlist-scope',value:nextScope});settings.put({id:FOLDER_DELETE_UNDO,value:snapshot});return;}
   const e=cursor.value,change=restore?members.has(e.id)&&!e.collectionId:e.collectionId===id;
   if(change){cursor.update({...e,collectionId:restore?id:''});result.changedIds.push(e.id);if(snapshot)snapshot.members.push(e.id);}
   cursor.continue();
  }catch(error){fail(error);}};
 }
});}
// Read each current record in the same transaction; a conflict rolls back the whole batch.
export function replaceEpisodeTranscripts(patches){return new Promise((resolve,reject)=>{
 const t=db.transaction('episodes','readwrite'),store=t.objectStore('episodes');let failure;
 for(const patch of patches){const r=store.get(patch.id);r.onsuccess=()=>{if(failure)return;try{store.put(applyTranscriptPatch(r.result,patch));}catch(error){failure=error;t.abort();}};}
 t.oncomplete=resolve;t.onerror=()=>reject(failure||t.error);t.onabort=()=>reject(failure||t.error||Error('替换未完成，旧稿保留。'));
});}
export function setEpisodeOrder(ids){return new Promise((resolve,reject)=>{
 const t=db.transaction('episodes','readwrite'),store=t.objectStore('episodes');
 ids.forEach((id,order)=>{const request=store.get(id);request.onsuccess=()=>{if(request.result)store.put({...request.result,order});};});
 t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);
});}

// Cloud updates replace transcript fields only; local audio, cards, progress and ordering remain untouched.
export function applyCloudTranscript(id,document,link,{initial=false,confirmed=false,expected=null}={}){
 return new Promise((resolve,reject)=>{
  const transaction=db.transaction('episodes','readwrite'),store=transaction.objectStore('episodes');let failure;
  // Moving a shared transcript to another local audio must not leave two live bindings.
  if(initial&&confirmed){const cursor=store.openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(!row)return;const other=row.value;if(other.id!==id&&other.cloudTranscript?.scope===link.scope&&other.cloudTranscript?.id===link.id){const next={...other};delete next.cloudTranscript;row.update(next);}row.continue();};}
  if(initial&&!confirmed){const cursor=store.openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(!row||failure)return;const other=row.value;if(other.id!==id&&!other.cloudTranscript&&other.language===document.language&&transcriptName(other.filename)===transcriptName(document.audio?.filename)){failure=Error('有多个同名音频，请选择对应音频。');transaction.abort();return;}row.continue();};}
  const request=store.get(id);request.onsuccess=()=>{
   try{
    const e=request.result;if(!e)throw Error('对应音频已移除，请重新关联。');
    if(!initial&&(e.cloudTranscript?.scope!==link.scope||e.cloudTranscript?.id!==link.id))throw Error('音频关联已改变，原稿保留。');
    if(initial&&!confirmed&&(e.cloudTranscript||!expected||transcriptFingerprint(e)!==expected||transcriptName(e.filename)!==transcriptName(document.audio?.filename)))throw Error('音频或逐字稿已改变，请重新匹配。');
    if(e.language!==document.language||e.duration&&Math.abs(e.duration-document.duration)>Math.max(2,document.duration*.005))throw Error('语言或音频时长不同，请选择对应音频。');
    if(!confirmed&&draftBlocksUpdate(e,link.hash))throw Error('本机有尚未同步的修订，已保留；可在共享书库选择使用共享稿。');
    const next={...e,segments:structuredClone(document.segments),duration:e.duration||document.duration,cloudTranscript:{...link}};
    delete next.transcriptDraft;
    if(confirmed&&e.transcriptDraft)next.transcriptUndo={segments:structuredClone(e.segments),cards:[],changedAt:Date.now()};else if(!e.transcriptDraft)delete next.transcriptUndo;
    store.put(next);
   }catch(error){failure=error;transaction.abort();}
  };
  transaction.oncomplete=()=>resolve(id);transaction.onerror=()=>reject(failure||transaction.error);transaction.onabort=()=>reject(failure||transaction.error);
 });
}
export function acknowledgeTranscriptPublication(id,link){return new Promise((resolve,reject)=>{
 const t=db.transaction('episodes','readwrite'),store=t.objectStore('episodes'),r=store.get(id);
 r.onsuccess=()=>{if(r.result){const next=acknowledgeTranscriptDraft(r.result,link);if(next!==r.result)store.put(next);}};
 t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);
});}
// Delete only selected audio bytes, atomically, using the latest learning records.
export function deleteAudioCopies(items,{removeRecords=false}={}){return new Promise((resolve,reject)=>{
 const selected=new Map(items.map(e=>[e.id,e]));
 if(!selected.size){resolve({ids:[],bytes:0,count:0,removeRecords});return;}
 const t=db.transaction(removeRecords?['episodes','cards','settings','progress']:['episodes'],'readwrite'),store=t.objectStore('episodes');let failure,bytes=0;
 for(const [id,expected] of selected){
  const request=store.get(id);request.onsuccess=()=>{
   if(failure)return;
   try{
    const e=request.result;
    if(!e?.audio?.size||e.audio.size!==expected.bytes||(e.audioCopyHash||'')!==expected.hash||(e.fingerprint||'')!==expected.fingerprint)throw Error('音频副本已经发生变化，请返回列表重新选择。');
    bytes+=e.audio.size;
    if(removeRecords){store.delete(id);t.objectStore('progress').delete(id);t.objectStore('settings').delete(durationKey(id));t.objectStore('settings').delete(bookmarksKey(id));}
    else{const next={...e,audio:null,storageMode:'external',audioBytes:e.audio.size};delete next.audioCopyHash;delete next.audioCopyVersion;store.put(next);}
   }catch(error){failure=error;t.abort();}
  };
 }
 if(removeRecords){
  const cards=t.objectStore('cards'),cursor=cards.openCursor();cursor.onsuccess=()=>{if(failure)return;const row=cursor.result;if(row){if(selected.has(row.value.episodeId))row.delete();row.continue();}};
  const settings=t.objectStore('settings'),lists=settings.get('playback-lists');lists.onsuccess=()=>{if(failure||!lists.result)return;const record=lists.result;settings.put({...record,value:record.value.map(state=>({...state,ids:state.ids.filter(id=>!selected.has(id)),excluded:state.excluded.filter(id=>!selected.has(id))}))});};
 }
 t.oncomplete=()=>resolve({ids:[...selected.keys()],bytes,count:selected.size,removeRecords});
 t.onerror=()=>reject(failure||t.error);t.onabort=()=>reject(failure||t.error||Error('删除未完成，原副本保留。'));
});}
