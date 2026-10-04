import {planTranscriptImports,phoneInterface,transcriptExportName} from './transcript-batch.js?v=2026.10.04.13';
import {clearModelDownloads,clearBrowserTranslation} from './browser-model-cleanup.js?v=2026.10.04.13';
import {all,read,write,remove,saveBatch,setEpisodeOrder,saveDuration,replaceEpisodeTranscripts} from './db.js?v=2026.10.04.13';
import {validateTranscript,validatePreferences,validateBackup} from './validate.js?v=2026.10.04.13';
import {lexicalWords,dictionaryText} from './lexicon.js';
import {Practice,practiceOptions} from './practice.js?v=2026.10.04.13';
import {palettes,applyTheme} from './theme.js';
import {hasKanji,rubyParts,setRubyReading,prepareReadings} from './furigana.js';
import {editedSentence,changedCards,replacementTranscript} from './transcript-edit.js?v=2026.10.04.13';
import {splitChoices,splitSentence,mergeSentences,resegmentCards} from './segment-edit.js?v=2026.10.04.13';
import {boundaryWords,suggestSentences} from './sentence-boundaries.js?v=2026.10.04.13';
import {orderedEpisodes,playbackTarget,ShuffleQueue,sortAudioFiles,bindPress,appendedOrder,findAudioMatch} from './playlist.js?v=2026.10.04.13';
import {bindPlaylistSheet} from './playlist-sheet.js?v=2026.10.04.13';
import {validatePlaybackLists,reconcilePlaybackList,selectPlaybackEpisodes,reorderPlaybackList,restorePlaybackLists,includePlaybackEpisode} from './playback-list.js?v=2026.10.04.13';
import {bindReaderGestures} from './reader-gestures.js?v=2026.10.04.13';
import {bindDragOrder,replaceSubsetOrder} from './drag-order.js';
import {cardCategory,cardCategories,selectedCards,cardSentence} from './cards.js';
import {saveAudioCopy,audioContentHash,canReuseAudioCopy} from './audio-storage.js?v=2026.10.04.13';
import {audioMime,resumePosition,playbackError,wavInfo} from './audio-media.js?v=2026.10.04.13';
import {validateFolders,folderEpisodes,folderMembership,restoreFolders,makeFolderCover} from './folders.js';
import {releaseAudio,configureAudio,bindAudioEvents,restoreAudioPosition} from './audio-lifecycle.js?v=2026.10.04.13';
import {ListPosition} from './list-position.js?v=2026.10.04.13';
import {appRoute,setAppRoute,bindHomeEdgeGuard} from './navigation.js?v=2026.10.04.13';
const phone=phoneInterface(navigator.userAgent,navigator.maxTouchPoints);
const main=document.querySelector('#main'),modal=document.querySelector('#modal');
let audio=document.querySelector('#audio');
const LANG={en:'英语',fr:'法语',ja:'日语'},GOTHIC='"Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif',MINCHO='"Hiragino Mincho ProN","Yu Mincho",serif',BASE=new URL('./',import.meta.url);
let prefs=validatePreferences((await read('settings','preferences'))?.value);
let episode=null,objectURL=null,view='library',filter='',current=-1,wordCurrent=-1,immersive=false,follow=true,clipEnd=null,toastTimer,backend=false,jobTimer,modalSerial=0,revealed=false,modalCanClose=null,backendVersion=0,immListening=false,autoRevealSuppressed=-1;
const originalFiles=new Map(),uncoveredSentences=new Set();
let openSerial=0,audioUnbind=()=>{},audioGeneration=0,playbackMime='';
const libraryPositions=new ListPosition(),shuffleQueue=new ShuffleQueue();
let playlistSheet=null;
function rememberLibrary(){libraryPositions.remember(main,main.dataset.libraryPositionKey);}
function reportPlayback(error){const message=playbackError(error,audio.error);if(message)toast(message);}
let folders=validateFolders((await read('settings','audio-folders'))?.value||[]),libraryFolder='',playlistFolder=(await read('settings','playlist-scope'))?.value||'',browseIndex=null,cardCategoryFilter='',cardFolderFilter='';
if(!folders.some(f=>f.id===playlistFolder))playlistFolder='';
let playbackLists=validatePlaybackLists((await read('settings','playback-lists'))?.value||[]);
async function choosePlaylistFolder(id){playlistFolder=folders.some(f=>f.id===id)?id:'';shuffleQueue.reset();await write('settings',{id:'playlist-scope',value:playlistFolder});}
const folderName=e=>folders.find(f=>f.id===e.collectionId)?.name||e.folder||LANG[e.language];
const folderCover=f=>f?.cover?`<img src="${esc(f.cover)}" alt="" loading="lazy">`:'<span aria-hidden="true">♫</span>';
async function savePlaybackList(state){
 const updated=[...playbackLists.filter(item=>item.scope!==state.scope&&(!item.scope||folders.some(f=>f.id===item.scope))),state];
 validatePlaybackLists(updated);await write('settings',{id:'playback-lists',value:updated});playbackLists=updated;
}
async function playlistState(collection,scope=playlistFolder){
 const available=folderEpisodes(orderedEpisodes(collection,prefs.playlistSort),scope),saved=playbackLists.find(item=>item.scope===scope);
 const state={...reconcilePlaybackList(available,saved),scope};
 if(JSON.stringify(saved)!==JSON.stringify(state))await savePlaybackList(state);
 return {available,state};
}
async function playlistItems(collection){
 const {available,state}=await playlistState(collection),byId=new Map(available.map(e=>[e.id,e]));
 return state.ids.map(id=>byId.get(id));
}
async function ensureEpisodeInPlaylist(e){
 const collection=await episodeCollection();
 if(!folderEpisodes(collection,playlistFolder).some(item=>item.id===e.id))await choosePlaylistFolder(e.collectionId&&folders.some(f=>f.id===e.collectionId)?e.collectionId:'');
 const {available,state}=await playlistState(collection);
 if(!state.ids.includes(e.id)){await savePlaybackList(includePlaybackEpisode(available,state,e.id));shuffleQueue.reset();}
}
const audioSize=e=>e.audio?.size||e.audioBytes||0;
const audioFile=e=>e.audio||originalFiles.get(e.id)||null;
function updatePracticeLabel(){const el=$('#practice-status');if(prefs.sentenceLoop){if(el)el.textContent=practice.enabled?'单句循环':'';return;}if(el)el.textContent=practice.enabled?`${practice.waiting?'间隔中 · ':''}第 ${Math.min(practice.completed+1,prefs.repeats||Infinity)} / ${prefs.repeats||'∞'} 遍`:'';}
function cancelPractice(){practice.cancel();}
function repetitionActive(){return prefs.loop||prefs.sentenceLoop;}
async function fingerprint(file){const chunks=await new Blob([file.slice(0,65536),file.slice(Math.max(65536,file.size-65536))]).arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',chunks))].map(v=>v.toString(16).padStart(2,'0')).join('');}
const $=s=>document.querySelector(s);
const practice=new Practice(audio,()=>updatePracticeLabel());
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function time(v){const n=Math.max(0,Math.floor(Number(v)||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
const size=v=>v>1048576?`${(v/1048576).toFixed(1)} MB`:`${Math.ceil(v/1024)} KB`;
function on(s,event,fn){$(s)?.addEventListener(event,fn);}
function toast(text){$('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4000);}
function report(e){toast(e?.name==='QuotaExceededError'?'设备空间不足，请先导出备份并清理音频。':e.message||'操作未完成，请重试。');console.error(e);}
function applyPrefs(){updateListeningMask();document.documentElement.style.setProperty('--source-scale',prefs.sourceSize);document.documentElement.style.setProperty('--translation-scale',prefs.translationSize);document.documentElement.style.setProperty('--imm-scale',prefs.immSize);const colors={ink:['var(--text)','var(--text)'],vermilion:['#9b4626','#efad91'],pine:['#42613a','#b0d09e'],blue:['#2e5b70','#a2cce0'],ochre:['#805d17','#e7ca87']};document.documentElement.style.setProperty('--jp-font',prefs.font==='mincho'?MINCHO:GOTHIC);document.documentElement.style.setProperty('--imm-font',prefs.immFont==='gothic'?GOTHIC:MINCHO);document.body.classList.toggle('hide-ruby',!prefs.reading);document.body.classList.toggle('hide-translations',!prefs.translation);document.querySelectorAll('.translation').forEach(el=>el.hidden=!prefs.translation);audio.playbackRate=Number(prefs.rate)||1;applyTheme(prefs);for(const [key,choice] of [['source-color',prefs.sourceColor],['translation-color',prefs.translationColor]])document.documentElement.style.setProperty('--'+key,colors[choice][document.documentElement.dataset.theme==='dark'?1:0]);}
async function savePrefs(){await write('settings',{id:'preferences',value:prefs});applyPrefs();}
function updateListeningMask(){
 const button=$('#listen-mask');if(button){button.classList.toggle('selected',prefs.listeningMask);button.setAttribute('aria-pressed',String(prefs.listeningMask));}
 document.querySelectorAll('.sentence[data-sentence]').forEach(row=>{const covered=prefs.listeningMask&&!uncoveredSentences.has(Number(row.dataset.sentence));row.classList.toggle('listening-covered',covered);const cover=row.querySelector('.sentence-cover');if(cover)cover.hidden=!covered;});
 if(immersive){immListening=prefs.listeningMask;$('.immersive-mode')?.classList.toggle('focused-listening',immListening);const toggle=$('[data-action="listening-mask"]');if(toggle){toggle.classList.toggle('selected',immListening);toggle.setAttribute('aria-pressed',String(immListening));}}
}
async function toggleListeningMask(){
 prefs.listeningMask=!prefs.listeningMask;uncoveredSentences.clear();revealed=false;await savePrefs();
 if(immersive)renderImmersiveSentence();
}
function resetClip(){cancelPractice();if(clipEnd!==null)audio.pause();clipEnd=null;}
function closeModal(){if(modalCanClose&&!modalCanClose())return;playlistSheet?.dispose();playlistSheet=null;modalCanClose=null;modal.classList.remove('transcript-editor','word-sheet','practice-sheet');if(immersive){main.inert=true;if($('.immersive-mode'))$('.immersive-mode').inert=false;}resetClip();modalSerial++;modal.close();clearInterval(jobTimer);jobTimer=null;}
function openModal(title,body){closeSpeedMenu();playlistSheet?.dispose();playlistSheet=null;modalCanClose=null;modal.classList.remove('transcript-editor','word-sheet','practice-sheet');if(immersive&&$('.immersive-mode'))$('.immersive-mode').inert=true;resetClip();modalSerial++;clearInterval(jobTimer);jobTimer=null;modal.innerHTML=`<div class="dialog-head"><h2>${esc(title)}</h2><button id="close-modal" aria-label="关闭">×</button></div>${body}`;if(!modal.open)modal.showModal();on('#close-modal','click',()=>{if(playlistSheet)playlistSheet.dismiss();else closeModal();});}
modal.addEventListener('cancel',event=>{if(playlistSheet){event.preventDefault();return;}if(modalCanClose&&!modalCanClose()){event.preventDefault();return;}modalCanClose=null;modal.classList.remove('transcript-editor','word-sheet','practice-sheet');if(immersive)main.inert=true;if(immersive&&$('.immersive-mode'))$('.immersive-mode').inert=false;resetClip();modalSerial++;clearInterval(jobTimer);jobTimer=null;});
function setNav(){closeSpeedMenu();document.body.classList.toggle('player-open',view==='player');document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function exportTranscript(e){try{await saveTranscriptDocument(transcriptData(e),transcriptExportName(transcriptData(e)));}catch(error){report(error);}}
async function exportRequest(path,body){
 const response=await fetch(new URL(path,BASE),body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw Error(data.detail||'操作未完成');return data;
}
async function saveTranscriptDocument(document,filename){
 validateTranscript(document);
 if(backend&&backendVersion>=6){const settings=await exportRequest('api/export-settings');if(settings.enabled){const result=await exportRequest('api/export-transcript',{filename,transcript:document});toast(`已保存到 ${result.path}`);return result;}}
 download(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}),filename);return {downloaded:true};
}
async function exportLocation(back=null){
 if(!backend||backendVersion<6){openModal('逐字稿保存位置','<p class="note">请使用新版电脑转写工具来记住保存文件夹。旧工具中已经完成的逐字稿仍可按原方式导出。</p>');return;}
 try{
  const settings=await exportRequest('api/export-settings');
  openModal('逐字稿保存位置',`<p class="note">选一次电脑文件夹，之后点击导出，逐字稿、中文译文和假名修订文件会直接保存到这里。设置在这台电脑记住；同名文件另存新版本。</p><label for="export-directory">保存文件夹</label><input id="export-directory" value="${esc(settings.directory)}" placeholder="可粘贴完整文件夹路径"><button class="secondary full section-title" id="browse-export-directory">浏览选择文件夹</button><label class="checkbox-line"><input id="export-directory-enabled" type="checkbox" ${settings.directory?settings.enabled?'checked':'':'checked'}>导出时默认保存到此文件夹</label><p class="note" id="export-directory-status">关闭此选项时使用浏览器的普通下载方式。</p><div class="actions">${back?'<button class="secondary" id="export-location-back">返回电脑转写</button>':''}<button class="primary" id="save-export-directory">保存设置</button></div>`);
  const serial=modalSerial;
  on('#browse-export-directory','click',async()=>{const b=$('#browse-export-directory');b.disabled=true;$('#export-directory-status').textContent='请在电脑弹出的窗口中选择文件夹。';try{const data=await exportRequest('api/export-directory/select',{});if(serial!==modalSerial)return;if(!data.cancelled){$('#export-directory').value=data.directory;$('#export-directory-enabled').checked=true;}$('#export-directory-status').textContent=data.cancelled?'已取消选择。':'已选好文件夹，点击“保存设置”记住。';}catch(error){if(serial===modalSerial){report(error);$('#export-directory-status').textContent='也可复制电脑文件夹路径到上方输入框。';}}finally{if(b.isConnected)b.disabled=false;}});
  on('#save-export-directory','click',async()=>{const b=$('#save-export-directory');b.disabled=true;try{const result=await exportRequest('api/export-settings',{directory:$('#export-directory').value.trim(),enabled:$('#export-directory-enabled').checked});if(serial!==modalSerial)return;toast(result.enabled?'保存位置已记住，后续导出会自动保存到这里':'已恢复普通下载方式');closeModal();if(back)await back();}catch(error){report(error);b.disabled=false;}});
  on('#export-location-back','click',()=>{closeModal();back?.();});
 }catch(error){report(error);}
}
async function probe(blob){return new Promise(resolve=>{
 const a=document.createElement('audio'),url=URL.createObjectURL(blob);let done=false;
 const timer=setTimeout(()=>finish(0),6000);
 const finish=d=>{if(done)return;done=true;clearTimeout(timer);a.onloadedmetadata=null;a.onerror=null;releaseAudio(a,URL.revokeObjectURL,url);resolve(Number.isFinite(d)?d:0);};
 a.preload='metadata';a.onloadedmetadata=()=>finish(a.duration);a.onerror=()=>finish(0);a.src=url;
});}
async function episodeCollection(){
 const entries=await all('episodes');if(entries.some(e=>!Number.isFinite(e.order))){const ordered=orderedEpisodes(entries);await setEpisodeOrder(ordered.map(e=>e.id));ordered.forEach((e,i)=>e.order=i);return ordered;}return entries;
}
async function storeAudio(file,language,title,storageMode=backend?'external':'copy',quick=false){
  if(!file?.size)throw Error('请选择一个非空音频文件。');
  if(file.size>350*1048576)throw Error('每段音频不能超过 350 MB。');
  const e={id:crypto.randomUUID(),title:title||file.name.replace(/\.[^.]+$/,''),filename:file.name,language,
    order:appendedOrder(await episodeCollection()),folder:file.webkitRelativePath?.split('/')[0]||'',storageMode,audio:storageMode==='copy'?file:null,audioBytes:file.size,mime:file.type,fingerprint:await fingerprint(file),
    duration:quick?0:await probe(file),created:Date.now(),segments:[],progress:0,bookmarks:[],collectionId:folders.some(f=>f.id===libraryFolder)?libraryFolder:''};
  if(storageMode==='copy')return saveAudioCopy(e,file,e.fingerprint,{write,read,fingerprint});
  await write('episodes',e);if(storageMode==='external')originalFiles.set(e.id,file);return e;
}
async function attachTranscript(e,data){
 const latest=await read('episodes',e.id);if(!latest)throw Error('音频记录已移除。');
 const next=replacementTranscript(latest,data);
 next.segments=next.segments.map(s=>prepareReadings({...s,words:lexicalWords(s,data.language)},data.language));
 if(episode?.id===e.id){resetClip();audio.pause();}
 await write('episodes',next);
 if(episode?.id===e.id){episode=next;current=-1;wordCurrent=-1;browseIndex=null;follow=true;}
 return next;
}
async function renderLibrary(){
 rememberLibrary();delete main.dataset.libraryPositionKey;view='library';setNav();const collection=orderedEpisodes(await episodeCollection(),prefs.playlistSort),folder=folders.find(f=>f.id===libraryFolder);
 if(libraryFolder&&libraryFolder!=='unfiled'&&!folder)libraryFolder='';
 const grouped=folderEpisodes(collection,libraryFolder),items=grouped.filter(e=>!filter||e.language===filter);
 const heading=folder?`<div class="folder-nav"><button id="folder-back" aria-label="返回所有音频">‹</button><button id="edit-folder" aria-label="编辑文件夹">···</button></div><header class="folder-heading"><div class="folder-cover">${folderCover(folder)}</div><div><h1>${esc(folder.name)}</h1><small>本机文件夹</small></div></header><div class="folder-count"><strong>${grouped.length}</strong><span>段音频</span></div>`:`<section class="library-intro"><small>随时听，慢慢学。</small><h1>我的声音</h1><p>${collection.length} 段音频 · 本机保存</p></section>`;
 main.innerHTML=`${heading}<div class="library-actions"><button class="primary" id="add-audio">${folder?'添加音频':'导入'}</button><button class="secondary" id="refresh-folder">更新文件夹</button><button class="icon-button" id="library-order" aria-label="排列播放列表">⇅</button></div>${!folder?`<section class="folder-section"><div class="folder-section-title"><h2>我的文件夹</h2><button id="new-folder">＋ 新建</button></div><div class="folder-list">${folders.map(f=>`<button class="folder-tile" data-folder="${esc(f.id)}"><span class="folder-cover">${folderCover(f)}</span><span>${esc(f.name)}<small>${collection.filter(e=>e.collectionId===f.id).length} 段音频</small></span><span class="episode-chevron">›</span></button>`).join('')}</div></section>`:''}<div class="library-tools"><div class="filters">${[['','全部'],...Object.entries(LANG)].map(([c,n])=>`<button class="chip ${filter===c?'active':''}" data-filter="${c}">${n}</button>`).join('')}</div><select id="library-sort" class="compact-select" aria-label="音频排序">${[['manual','我的顺序'],['name','文件名顺序'],['newest','最新添加']].map(([v,n])=>`<option value="${v}" ${prefs.playlistSort===v?'selected':''}>${n}</option>`).join('')}</select></div><div class="library-list">${items.length?items.map(e=>`<div class="library-track" data-sort-row="${e.id}"><button class="episode" data-episode="${e.id}"><span class="episode-mark" aria-hidden="true">${{en:'EN',fr:'FR',ja:'日'}[e.language]}</span><span class="episode-info"><span class="episode-title">${esc(e.title)}</span><span class="episode-meta">${esc(folderName(e))} · ${e.duration?time(e.duration):'音频'} · ${e.segments?.length?'有稿':'待转写'}</span><span class="progress-line"><span style="width:${Math.min(100,(e.progress||0)/Math.max(e.duration||1,1)*100)}%"></span></span></span><span class="episode-chevron" aria-hidden="true">›</span></button><button class="drag-handle" data-drag-id="${e.id}" aria-label="拖动排序 ${esc(e.title)}" aria-pressed="false">≡</button></div>`).join(''):`<div class="empty"><h2>${folder?'这个文件夹还没有音频':'留下第一段声音'}</h2><p>${folder?'编辑文件夹，选入已有音频；也可添加新文件。':'从手机“文件”中导入音频或文件夹。'}</p>${folder?'<button class="secondary" id="folder-add-existing">选择已有音频</button>':''}</div>`}</div><div class="library-documents"><button id="import-script">导入逐字稿</button><button id="batch-import-script">批量替换逐字稿</button>${!phone?'<button id="edit-document-file">校对逐字稿文件</button>':''}</div>`;
 on('#new-folder','click',()=>editFolder());on('#edit-folder','click',()=>editFolder(libraryFolder));on('#folder-add-existing','click',()=>editFolder(libraryFolder));on('#folder-back','click',()=>{rememberLibrary();libraryFolder='';renderLibrary();});
 document.querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>{rememberLibrary();libraryFolder=b.dataset.folder;filter='';renderLibrary();});
 on('#add-audio','click',()=>importAudio(false));on('#refresh-folder','click',()=>importAudio(true));on('#library-order','click',async()=>{await choosePlaylistFolder(libraryFolder);showPlaylist(true);});on('#import-script','click',()=>importScript());on('#edit-document-file','click',editDocumentFile);on('#batch-import-script','click',()=>batchImportScripts().catch(report));
 on('#library-sort','change',async e=>{prefs.playlistSort=e.target.value;await savePrefs();renderLibrary();});
 bindDragOrder($('.library-list'),{scroller:main,bottomEdge:()=>$('.mini-player')?.getBoundingClientRect().top||$('nav').getBoundingClientRect().top,onDrop:async(ids,before)=>{const top=main.scrollTop;await saveDraggedOrder(ids,before);await renderLibrary();main.scrollTop=top;},onError:async error=>{report(error);await renderLibrary();}});
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderLibrary();});document.querySelectorAll('[data-episode]').forEach(b=>b.onclick=async()=>{await choosePlaylistFolder(libraryFolder);openEpisode(b.dataset.episode).catch(report);});
 main.dataset.libraryPositionKey=JSON.stringify([libraryFolder,filter]);libraryPositions.restore(main,main.dataset.libraryPositionKey);
}
async function editFolder(id){
 const existing=folders.find(f=>f.id===id),collection=orderedEpisodes(await episodeCollection()),draft={...(existing||{id:crypto.randomUUID(),name:'',cover:'',created:Date.now()})};
 openModal(existing?'编辑文件夹':'创建文件夹',`<div class="folder-preview folder-cover" id="folder-preview">${folderCover(draft)}</div><label for="folder-name">文件夹名称</label><input id="folder-name" maxlength="80" placeholder="例如：日语练习" value="${esc(draft.name)}"><label for="folder-image">封面图片</label><input id="folder-image" type="file" accept="image/*"><button id="clear-folder-cover" class="cover-clear">使用默认封面</button><label>放入已有音频</label><div class="folder-members">${collection.length?collection.map(e=>`<label class="checkbox-line"><input type="checkbox" data-folder-member="${e.id}" ${e.collectionId===draft.id?'checked':''}><span>${esc(e.title)}${e.collectionId&&e.collectionId!==draft.id?`<small>当前在 ${esc(folderName(e))}</small>`:''}</span></label>`).join(''):'<p class="note">创建后可以添加音频。</p>'}</div><button class="primary full section-title" id="save-folder">保存文件夹</button>`);
 const serial=modalSerial;
 on('#clear-folder-cover','click',()=>{draft.cover='';$('#folder-image').value='';$('#folder-preview').innerHTML=folderCover(draft);});
 on('#folder-image','change',async()=>{const file=$('#folder-image').files[0];if(!file)return;$('#save-folder').disabled=true;$('#clear-folder-cover').disabled=true;try{const cover=await makeFolderCover(file);if(modalSerial===serial){draft.cover=cover;$('#folder-preview').innerHTML=folderCover(draft);}}catch(e){if(modalSerial===serial)report(e);}finally{if(modalSerial===serial){$('#save-folder').disabled=false;$('#clear-folder-cover').disabled=false;}}});
 on('#save-folder','click',async()=>{
  const button=$('#save-folder');button.disabled=true;
  try{draft.name=$('#folder-name').value.trim();const freshFolders=validateFolders((await read('settings','audio-folders'))?.value||[]);if(existing&&JSON.stringify(freshFolders.find(f=>f.id===id))!==JSON.stringify(existing))throw Error('这个文件夹已在其他窗口修改，请重新打开后编辑。');const updated=existing?freshFolders.map(f=>f.id===draft.id?draft:f):[...freshFolders,draft];validateFolders(updated);
   const selected=[...document.querySelectorAll('[data-folder-member]:checked')].map(el=>el.dataset.folderMember),fresh=await all('episodes'),changed=folderMembership(fresh.filter(e=>collection.some(old=>old.id===e.id)),draft.id,selected);
   await saveBatch(changed,[],[{id:'audio-folders',value:updated}]);folders=updated;const active=changed.find(e=>e.id===episode?.id);if(active)episode=active;
   closeModal();libraryFolder=draft.id;if(view==='library'){await renderLibrary();miniPlayer();if(target!=='library')main.scrollTo(0,0);}else if(view==='player'&&!immersive)renderPlayer();toast('文件夹已保存');
  }catch(e){report(e);button.disabled=false;}
 });
}
function importAudio(folder=false){
  openModal(folder?'更新文件夹':'添加音频',`<div class="input-tabs"><button class="chip active" id="choose-files">选择文件</button><button class="chip" id="choose-folder">选择文件夹</button></div>
    <label for="local-audio">${backend?'从电脑选择原音频，可多选':'从手机「文件」选择，可多选'}</label><input id="local-audio" type="file" multiple ${folder?'webkitdirectory':''} accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.opus,.aac,.mp4,.webm">
    <label for="audio-title">名称（单个文件时可修改）</label><input id="audio-title" placeholder="使用原文件名">
    <label for="language">音频语言</label><select id="language">${Object.entries(LANG).map(([c,n])=>`<option value="${c}">${n}</option>`).join('')}</select>
    <label for="audio-storage">保存方式</label><select id="audio-storage"><option value="copy" ${backend?'':'selected'}>保存音频副本 · 重开可直接播放</option><option value="external" ${backend?'selected':''}>直接读取原文件 · 不保存副本</option></select>
    <p class="note" id="storage-note">${backend?'电脑默认直接读取原音频，不保存副本。完全关闭浏览器后需重新选择原文件或文件夹，逐字稿和进度仍保留。':'音频副本保存在听页的私有本机存储，不在手机“文件”里显示，重开可直接播放。更新时复用未变的已有副本，只保存新音频或尚未保存的旧音频；逐字稿、词卡和顺序保留。'}</p>
    <p class="note" id="file-selection"></p><button class="primary full" id="save-audio">添加到播放器</button>`);
  $('#choose-files').classList.toggle('active',!folder);$('#choose-folder').classList.toggle('active',folder);
  for(const [id,folder] of [['#choose-files',false],['#choose-folder',true]])on(id,'click',()=>{
    const input=$('#local-audio');input.value='';input.toggleAttribute('webkitdirectory',folder);
    $('#choose-files').classList.toggle('active',!folder);$('#choose-folder').classList.toggle('active',folder);$('#file-selection').textContent='';
  });
  on('#local-audio','change',()=>{const files=sortAudioFiles([...$('#local-audio').files]).filter(f=>/\.(mp3|m4a|wav|ogg|flac|opus|aac|mp4|webm)$/i.test(f.name));$('#file-selection').textContent=`已选择 ${files.length} 个音频`;$('#audio-title').value=files.length===1?files[0].name.replace(/\.[^.]+$/,''):'';});
  on('#audio-storage','change',()=>$('#storage-note').textContent=$('#audio-storage').value==='copy'?'会在听页中保存一份音频副本，占用额外空间，重开后不用再选原文件。列表里已有的音频也会保存，逐字稿、词卡、顺序和分组保留。':'不保存音频副本。完全关闭后需再次选择原文件或文件夹；旧词卡、逐字稿和进度保留。');
  on('#save-audio','click',async()=>{
    const b=$('#save-audio');b.disabled=true;let added=0,linked=0,copied=0,reused=0,last=null;
    try{
      const files=sortAudioFiles([...$('#local-audio').files]).filter(f=>/\.(mp3|m4a|wav|ogg|flac|opus|aac|mp4|webm)$/i.test(f.name));
      if(!files.length)throw Error('请选择音频文件。');if(files.length>1000)throw Error('一次最多选择 1000 个音频。');
      const collection=await all('episodes'),mode=$('#audio-storage').value,language=$('#language').value,title=$('#audio-title').value.trim();
      for(const file of files){
        if(!file.size||file.size>350*1048576)throw Error(!file.size?'请选择一个非空音频文件。':'每段音频不能超过 350 MB。');
        b.textContent=`正在${mode==='copy'?'保存':'添加'} ${added+linked+copied+reused+1} / ${files.length}`;
        const hash=await fingerprint(file),contentHash=mode==='copy'?await audioContentHash(file):null;
        const match=await findAudioMatch(collection,file,hash,audioSize,e=>e.audio?fingerprint(e.audio):null,async e=>!contentHash||!e.audio||contentHash===(e.audioCopyHash||await audioContentHash(e.audio))),existing=match?.episode;if(match?.writeFingerprint){existing.fingerprint=match.hash;await write('episodes',existing);}
        if(existing){
          let updated=existing;if(!updated.folder&&file.webkitRelativePath)updated={...updated,folder:file.webkitRelativePath.split('/')[0]};
          if(mode==='copy'){
            if(canReuseAudioCopy(updated,file,contentHash)){if(updated!==existing)await write('episodes',updated);reused++;}
            else {updated=await saveAudioCopy(updated,file,hash,{write,read,fingerprint});copied++;}
            originalFiles.delete(updated.id);
          }
          else {if(updated!==existing)await write('episodes',updated);if(!updated.audio)originalFiles.set(updated.id,file);linked++;}
          if(episode?.id===updated.id)episode=updated;
          collection[collection.findIndex(e=>e.id===updated.id)]=updated;last=updated;continue;
        }
        last=await storeAudio(file,language,files.length===1?title:null,mode,files.length>1);collection.push(last);added++;
      }
      closeModal();await renderLibrary();toast(mode==='copy'?`${added+copied?`已保存 ${added+copied} 段音频副本`:'没有需要新增保存的音频'}${reused?` · 复用 ${reused} 段`:''}${copied?' · 原有学习记录保留':''}`:`添加 ${added} 段 · 重新连接 ${linked} 段`);
      if(mode==='copy')try{await navigator.storage?.persist?.();}catch{}if(files.length===1&&last)await openEpisode(last.id);
    }catch(error){report(error);b.disabled=false;b.textContent='添加到播放器';}
  });
}
async function reconnectAudio(e=episode,resume){
  if(!e)return;
  openModal('选择原音频',`<p class="note">${esc(e.filename)} · ${size(audioSize(e))}</p><input id="reconnect-file" type="file" accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.opus,.aac,.mp4,.webm"><p class="note">保存一份本机音频副本，重开后可直接播放；已有逐字稿、词卡和进度保留。也可在音频库更新整个文件夹。</p><button class="primary full" id="reconnect-confirm">保存并播放</button>`);
  on('#reconnect-confirm','click',async()=>{const button=$('#reconnect-confirm');button.disabled=true;try{
    const file=$('#reconnect-file').files[0];if(!file)throw Error('请选择原音频。');
    const hash=await fingerprint(file);if(file.size!==audioSize(e)||e.fingerprint&&hash!==e.fingerprint)throw Error('这不是原来的音频，请重新选择。');
    const latest=await read('episodes',e.id);if(!latest)throw Error('这段音频已被移除。');
    const contentHash=await audioContentHash(file);if(latest.audio&&contentHash!==(latest.audioCopyHash||await audioContentHash(latest.audio)))throw Error('这不是原来的音频，请重新选择。');
    if(!canReuseAudioCopy(latest,file,contentHash))await saveAudioCopy(latest,file,hash,{write,read,fingerprint});originalFiles.delete(e.id);
    closeModal();await openEpisode(e.id,resume?.start??e.progress);if(resume?.end!==undefined)playSentenceClip(resume);else if(resume)playFromSentence(resume.sentence);toast('音频副本已保存，重开可直接播放');
    try{await navigator.storage?.persist?.();}catch{}
  }catch(err){report(err);button.disabled=false;}});
}
async function importScript(preselected){
 const episodes=await all('episodes'),target=episodes.find(e=>e.id===preselected),replacing=!!target?.segments?.length;
 openModal(replacing?'替换逐字稿':'导入逐字稿',`<label for="script-file">${replacing?'新的逐字稿文件':'电脑导出的逐字稿'}</label><input id="script-file" type="file" accept=".json,application/json"><label for="script-episode">对应的音频</label><select id="script-episode" ${target?'disabled':''}><option value="new">同时选择一个新音频</option>${episodes.map(e=>`<option value="${e.id}" ${e.id===preselected?'selected':''}>${esc(e.title)}</option>`).join('')}</select><div id="script-new-audio" ${preselected?'hidden':''}><label for="script-audio">音频文件</label><input id="script-audio" type="file" accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg"></div><p class="note" id="script-replace-note">${replacing?'新稿将完整替换旧稿及旧校对记录，不会追加另一份。音频、播放进度和已保存词卡保留。':'请选择同一段音频，确保文字与声音的位置对应；选已有音频时，新稿会覆盖旧稿。'}</p><p class="note" id="script-file-summary"></p><button class="primary full" id="attach-script">${replacing?'替换当前逐字稿':'导入到本机'}</button>`);
 let prepared=null,selectedFile=null,serial=modalSerial;
 async function load(){const file=$('#script-file').files[0];if(!file)throw Error('请选择逐字稿文件。');if(file.size>30*1048576)throw Error('逐字稿文件过大。');if(file!==selectedFile){const parsed=validateTranscript(JSON.parse(await file.text()));if(serial!==modalSerial)throw Error('导入窗口已关闭。');prepared=parsed;selectedFile=file;}return prepared;}
 on('#script-file','change',async()=>{try{const data=await load();$('#script-file-summary').textContent=`新稿：${LANG[data.language]} · ${data.segments.length} 句 · ${time(data.duration)}${replacing?'；旧稿 '+target.segments.length+' 句将被替换':''}`;}catch(error){if(serial===modalSerial){$('#script-file-summary').textContent='';report(error);}}});
 on('#script-episode','change',()=>{$('#script-new-audio').hidden=$('#script-episode').value!=='new';});
 on('#attach-script','click',async()=>{const b=$('#attach-script');b.disabled=true;let created=null;try{
  const data=await load();let e;
  if($('#script-episode').value==='new'){const f=$('#script-audio').files[0];if(!f)throw Error('请选择对应的音频。');if(data.audio?.bytes&&data.audio.bytes!==f.size)throw Error('音频大小与逐字稿记录不同，请重新选择。');e=await storeAudio(f,data.language,data.title);created=e.id;}
  else{e=await read('episodes',$('#script-episode').value);if(!e)throw Error('音频记录已移除。');}
  const old=!!e.segments?.length;await attachTranscript(e,data);closeModal();await openEpisode(e.id);toast(old?'旧稿已清除，新逐字稿已保存':'逐字稿和时间轴已保存');
 }catch(error){if(created)await remove('episodes',created);report(error);b.disabled=false;}});
}

async function batchImportScripts(){
 const collection=await all('episodes');
 if(!collection.length){toast('请先导入对应音频');return;}
 openModal('批量替换逐字稿',`<p class="note">选择电脑整理好的逐字稿文件夹，按文件名匹配已有音频。例如 15-2.json 对应 15-2.wav。</p><label for="batch-script-folder">选择逐字稿文件夹</label><input id="batch-script-folder" type="file" webkitdirectory multiple><label for="batch-script-files">或多选逐字稿文件</label><input id="batch-script-files" type="file" accept=".json,application/json" multiple><p class="note">新稿会完整覆盖旧原文、译文、假名和校对记录。音频、播放进度、词卡和排列顺序保留；重名文件会跳过。</p><p id="batch-script-status" role="status"></p><div id="batch-script-preview" class="batch-script-preview"></div><button class="primary full" id="batch-script-apply" disabled>读取文件后替换</button>`);
 const serial=modalSerial;let rows=[],loading=0;
 async function load(files){
  const generation=++loading;rows=[];$('#batch-script-apply').disabled=true;$('#batch-script-preview').innerHTML='';$('#batch-script-status').textContent='正在读取逐字稿…';
  try{
   const next=await planTranscriptImports(files,await all('episodes'));
   if(serial!==modalSerial||generation!==loading)return;
   rows=next;const ready=rows.filter(r=>r.status==='ready');
   $('#batch-script-status').textContent=`可替换 ${ready.length} 份 · 跳过 ${rows.length-ready.length} 份`;
   $('#batch-script-preview').innerHTML=rows.map(r=>`<article class="batch-script-row"><strong>${esc(r.name)}</strong><small>${r.status==='ready'?`${esc(r.title)} · ${r.oldCount} → ${r.data.segments.length} 句`:esc(r.reason)}</small></article>`).join('');
   $('#batch-script-apply').textContent=`替换 ${ready.length} 份逐字稿`;$('#batch-script-apply').disabled=!ready.length;
  }catch(error){if(serial===modalSerial&&generation===loading){$('#batch-script-status').textContent=error.message;}}
 }
 on('#batch-script-folder','change',e=>load(e.target.files));on('#batch-script-files','change',e=>load(e.target.files));
 on('#batch-script-apply','click',async()=>{
  const button=$('#batch-script-apply');button.disabled=true;
  $('#batch-script-folder').disabled=true;$('#batch-script-files').disabled=true;modalCanClose=()=>false;
  try{
   const ready=rows.filter(r=>r.status==='ready'),patches=ready.map(r=>({id:r.episodeId,expected:r.expected,language:r.data.language,duration:r.data.duration,segments:r.data.segments.map(s=>prepareReadings({...s,words:lexicalWords(s,r.data.language)},r.data.language))}));
   if(patches.some(p=>p.id===episode?.id)){resetClip();audio.pause();}
   await replaceEpisodeTranscripts(patches);
   if(episode&&patches.some(p=>p.id===episode.id)){episode=await read('episodes',episode.id);current=-1;wordCurrent=-1;browseIndex=null;uncoveredSentences.clear();}
   modalCanClose=null;closeModal();await renderLibrary();toast(`已替换 ${patches.length} 份逐字稿，旧稿已清除`);
  }catch(error){modalCanClose=null;report(error);button.disabled=false;$('#batch-script-folder').disabled=false;$('#batch-script-files').disabled=false;}
 });
}

async function openEpisode(id,initialPosition,{replaceRoute=false}={}){
  uncoveredSentences.clear();rememberLibrary();const serial=++openSerial;resetClip();const e=await read('episodes',id);if(serial!==openSerial)return;if(!e)throw Error('找不到这段音频。');
  await ensureEpisodeInPlaylist(e);if(serial!==openSerial)return;
  e.segments=(e.segments||[]).map(s=>prepareReadings({...s,words:lexicalWords(s,e.language)},e.language));
  const file=audioFile(e);if(!file&&Number.isFinite(initialPosition)){e.progress=initialPosition;await write('progress',{id:e.id,seconds:initialPosition});}
  if(episode?.id!==id||audio.error||!audio.getAttribute('src')&&file){
    const mime=file?await audioMime(file,e.filename):'';if(serial!==openSerial)return;
    await saveProgress();if(serial!==openSerial)return;audioGeneration++;cancelAnimationFrame(playbackFrame);const oldURL=objectURL;objectURL=null;releaseAudio(audio,URL.revokeObjectURL,oldURL);episode=e;if(mime)e.mime=mime;
    if(file){
      playbackMime=mime;objectURL=URL.createObjectURL(file.type===mime?file:new Blob([file],{type:mime}));const source=objectURL;
      audio.onloadedmetadata=()=>{if(objectURL!==source||episode?.id!==id)return;const pos=resumePosition(initialPosition??e.progress??0,audio.duration,{explicit:Number.isFinite(initialPosition)});restoreAudioPosition(audio,pos);if(!e.duration&&Number.isFinite(audio.duration)){e.duration=audio.duration;saveDuration(e.id,e.duration).catch(report);if(view==='player'&&!immersive)renderPlayer();}updatePlayback();};
      audio.src=source;audio.load();configureAudio(audio,prefs.rate);
    }else{audio.onloadedmetadata=null;audio.removeAttribute('src');audio.load();}
    current=-1;wordCurrent=-1;
  }else{episode=e;if(Number.isFinite(initialPosition)&&file){current=-1;audio.currentTime=initialPosition;}}
  delete main.dataset.libraryPositionKey;view='player';follow=true;browseIndex=null;setNav();renderPlayer();setAppRoute(`audio/${id}`,replaceRoute);
  if('mediaSession'in navigator)navigator.mediaSession.metadata=new MediaMetadata({title:e.title,artist:'听页',album:LANG[e.language]});
}

function rubyHTML(word){return rubyParts(word).map(p=>p.reading?`<ruby>${esc(p.text)}<rt>${esc(p.reading)}</rt></ruby>`:esc(p.text)).join('');}
function wordsHTML(s,index){
  if(!s.words?.length)return esc(s.text);
  return s.words.map((w,j)=>!w.text.trim()||/^[\p{P}\p{S}]+$/u.test(w.text.trim())?rubyHTML(w):`<span class="word" role="button" tabindex="0" aria-label="${esc(w.lemma||w.text.trim())}，双击查看词卡" data-word="${index}:${j}">${rubyHTML(w)}</span>`).join('');
}
const icon=(name)=>{const paths={prev:'M18 5 8 12l10 7M5 5v14',next:'m6 5 10 7-10 7M19 5v14',list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',sliders:'M4 7h16M4 17h16M8 4v6M16 14v6',repeat:'M5 7h13l-3-3m3 3-3 3M19 17H6l3 3m-3-3 3-3'};return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;};
function transportHTML(){
 const speed=`<button data-action="speed" aria-label="播放速度" aria-haspopup="menu" aria-controls="speed-menu" aria-expanded="false"><strong>${prefs.rate}×</strong>${immersive?'':'<small>倍速</small>'}</button>`;
 const playlist=`<button data-action="playlist" aria-label="播放列表">${icon('list')}${immersive?'':'<small>播放列表</small>'}</button>`;
 return `<div class="transport">${speed}${immersive?'':playlist}<button data-action="prev" aria-label="${episode.segments?.length?'上一句':'后退 10 秒'}" title="长按切换上一集">${icon('prev')}${immersive?'':'<small>上一句</small>'}</button><button class="play" data-action="play" aria-label="${audio.paused&&!practice.waiting?'播放':'暂停'}">${audio.paused&&!practice.waiting?'▶':'Ⅱ'}</button><button data-action="next" aria-label="${episode.segments?.length?'下一句':'前进 10 秒'}" title="长按切换下一集">${icon('next')}${immersive?'':'<small>下一句</small>'}</button>${immersive?playlist:`<button data-action="sentence-loop" class="${prefs.sentenceLoop?'selected':''}" aria-label="单句循环" aria-pressed="${prefs.sentenceLoop}" ${episode.segments?.length?'':'disabled'}>${icon('repeat')}<small>单句循环</small></button>`}</div>${immersive?`<div class="imm-switches"><button data-action="translation" class="${prefs.translation?'selected':''}">译文</button><button data-action="reading" class="${prefs.reading?'selected':''}">读音</button><button data-action="loop" class="${repetitionActive()?'selected':''}" aria-pressed="${repetitionActive()}">循环</button><button data-action="listening-mask" class="${prefs.listeningMask?'selected':''}" aria-pressed="${prefs.listeningMask}">精听</button><button data-action="practice-settings" aria-label="精听设置">${icon('sliders')}</button></div><div class="practice-status" id="practice-status"></div>`:''}`;
}
function stepSentence(direction){if(episode.segments?.length)jump(direction<0?Math.max(0,(browseIndex??current)-1):Math.min(episode.segments.length-1,(browseIndex??current)+1),true);else if(audioFile(episode)){cancelPractice();audio.currentTime=Math.max(0,Math.min(episode.duration,audio.currentTime+direction*10));updatePlayback();}}
async function playEpisode(id){if(modalCanClose&&!modalCanClose())return;modalCanClose=null;const wasImmersive=immersive;if(immersive)toggleImmersive();closeModal();await openEpisode(id,0);if(episode?.id!==id)return;if(prefs.playbackMode==='shuffle')shuffleQueue.select(id);if(wasImmersive&&episode.segments?.length)toggleImmersive();if(audioFile(episode))await togglePlay();else toast('请重新选择原文件或文件夹以播放这一集');}
async function switchEpisode(direction,automatic=false){
 const items=await playlistItems(await episodeCollection()),id=playbackTarget(items,episode?.id,{mode:prefs.playbackMode,direction,automatic,shuffle:shuffleQueue});
 if(!id){if(!automatic&&!items.length){toast('播放列表为空，请先选择集数');return;}if(!automatic)toast(direction>0?'已经是最后一集':prefs.playbackMode==='shuffle'?'没有更早的播放记录':'已经是第一集');return;}
 if(automatic&&id===episode?.id){resetClip();audio.currentTime=0;current=-1;updatePlayback();await audio.play().catch(reportPlayback);return;}
 await playEpisode(id);
}
async function saveDraggedOrder(ids,before){const collection=orderedEpisodes(await episodeCollection(),prefs.playlistSort),order=replaceSubsetOrder(collection.map(e=>e.id),before,ids);await setEpisodeOrder(order);prefs.playlistSort='manual';await savePrefs();toast('音频库顺序已保存');}
async function showPlaylist(editing=false){
 const scope=playlistFolder,collection=await episodeCollection(),items=await playlistItems(collection);
 openModal('播放列表',`<label class="sr-only" for="playlist-folder">播放范围</label><select id="playlist-folder" aria-label="播放范围"><option value="">全部音频</option>${folders.map(f=>`<option value="${esc(f.id)}" ${playlistFolder===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select><div class="playlist-modes" role="group" aria-label="播放模式">${[['sequence','顺序播放'],['shuffle','随机播放'],['single','单集循环']].map(([mode,label])=>`<button data-playback-mode="${mode}" aria-pressed="${prefs.playbackMode===mode}" class="${prefs.playbackMode===mode?'selected':''}">${label}</button>`).join('')}</div><div class="playlist-options"><label class="checkbox-line"><input id="playlist-continuous" type="checkbox" ${prefs.continuous?'checked':''}>播完继续</label><div class="playlist-edit-actions"><button id="playlist-pick" class="secondary">选择集数</button><button id="playlist-edit" class="secondary">${editing?'完成排序':'调整顺序'}</button></div></div><div class="playlist-rows">${items.length?items.map((e,i)=>`<div class="playlist-row ${episode?.id===e.id?'playing':''}" data-sort-row="${e.id}"><button class="playlist-track" data-play-track="${e.id}"><small>${i+1}</small><span>${esc(e.title)}<small>${esc(folderName(e))} · ${e.duration?time(e.duration):'音频'}</small></span></button><div class="playlist-row-actions">${editing?`<button class="drag-handle" data-drag-id="${e.id}" aria-label="拖动排序 ${esc(e.title)}" aria-pressed="false">≡</button>`:''}<button class="playlist-remove" data-remove-track="${e.id}" aria-label="移出播放列表 ${esc(e.title)}" title="移出播放列表">×</button></div></div>`).join(''):'<p class="note playlist-empty">播放列表为空，点“选择集数”加入想听的音频。</p>'}</div>`);
 modal.classList.add('playlist-sheet');$('#close-modal').hidden=true;
 $('.dialog-head').insertAdjacentHTML('beforebegin','<button class="sheet-grip" aria-label="向下滑动收起播放列表"><span></span></button>');
 playlistSheet=bindPlaylistSheet(modal,closeModal);
 modal.querySelectorAll('[data-playback-mode]').forEach(b=>b.onclick=async()=>{
  if(prefs.playbackMode!==b.dataset.playbackMode)shuffleQueue.reset();
  prefs.playbackMode=b.dataset.playbackMode;prefs.continuous=true;
  modal.querySelectorAll('[data-playback-mode]').forEach(el=>{const active=el.dataset.playbackMode===prefs.playbackMode;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));});
  $('#playlist-continuous').checked=true;await savePrefs();
 });
 if(editing)bindDragOrder($('.playlist-rows'),{onDrop:async(ids,before)=>{const top=$('.playlist-rows').scrollTop;const {state}=await playlistState(await episodeCollection(),scope);await savePlaybackList(reorderPlaybackList(state,before,ids));toast('播放列表顺序已保存');await showPlaylist(true);$('.playlist-rows').scrollTop=top;},onError:async error=>{report(error);await showPlaylist(true);}});
 on('#playlist-pick','click',()=>choosePlaylistEpisodes().catch(report));
 on('#playlist-folder','change',async e=>{await choosePlaylistFolder(e.target.value);showPlaylist(editing);});
 on('#playlist-continuous','change',async e=>{prefs.continuous=e.target.checked;await savePrefs();});on('#playlist-edit','click',()=>showPlaylist(!editing));
 let removing=false;
 modal.querySelectorAll('[data-remove-track]').forEach(button=>button.onclick=async()=>{
  if(removing)return;removing=true;
  const serial=modalSerial,top=$('.playlist-rows').scrollTop,buttons=[...modal.querySelectorAll('[data-remove-track]')],index=buttons.indexOf(button),focused=document.activeElement===button;
  buttons.forEach(b=>b.disabled=true);
  try{
   const {available,state}=await playlistState(await episodeCollection(),scope);
   await savePlaybackList(selectPlaybackEpisodes(available,state,state.ids.filter(id=>id!==button.dataset.removeTrack)));
   shuffleQueue.reset();toast('已移出播放列表');
   if(serial!==modalSerial)return;
   await showPlaylist(editing);$('.playlist-rows').scrollTop=top;
   if(focused){const remaining=[...modal.querySelectorAll('[data-remove-track]')];(remaining[Math.min(index,remaining.length-1)]||$('#playlist-pick')).focus({preventScroll:true});}
  }catch(error){report(error);}finally{removing=false;buttons.forEach(b=>{if(b.isConnected)b.disabled=false;});}
 });
 document.querySelectorAll('[data-play-track]').forEach(b=>b.onclick=()=>playEpisode(b.dataset.playTrack).catch(report));
}
async function choosePlaylistEpisodes(){
 const scope=playlistFolder,{available,state}=await playlistState(await episodeCollection(),scope),chosen=new Set(state.ids);
 openModal('选择播放集数',`<p class="note">只改变播放列表，音频库和文件夹中的音频仍会保留。</p><div class="playlist-picker-actions"><button class="secondary" id="playlist-pick-all">全选</button><button class="secondary" id="playlist-pick-none">全不选</button></div><div class="playlist-picker-rows">${available.length?available.map(e=>`<label class="playlist-pick-row"><input type="checkbox" data-pick-track="${esc(e.id)}" ${chosen.has(e.id)?'checked':''}><span>${esc(e.title)}<small>${esc(folderName(e))} · ${e.duration?time(e.duration):'音频'}</small></span></label>`).join(''):'<p class="note">这个范围里还没有音频。</p>'}</div><div class="actions"><button class="secondary" id="playlist-pick-back">返回</button><button class="primary" id="playlist-pick-save">保存播放列表</button></div>`);
 const inputs=()=>[...modal.querySelectorAll('[data-pick-track]')];
 on('#playlist-pick-all','click',()=>inputs().forEach(input=>input.checked=true));
 on('#playlist-pick-none','click',()=>inputs().forEach(input=>input.checked=false));
 on('#playlist-pick-back','click',()=>showPlaylist());
 on('#playlist-pick-save','click',async()=>{
  const button=$('#playlist-pick-save'),selected=inputs().filter(input=>input.checked).map(input=>input.dataset.pickTrack);button.disabled=true;
  try{
   const {available,state}=await playlistState(await episodeCollection(),scope);
   await savePlaybackList(selectPlaybackEpisodes(available,state,selected));shuffleQueue.reset();
   toast('播放集数已保存，音频库保持原样');await showPlaylist();
  }catch(error){report(error);button.disabled=false;}
 });
}
function closeSpeedMenu(){const menu=$('#speed-menu');if(menu){menu.release?.();if(menu.matches(':popover-open'))menu.hidePopover();menu.remove();}}
function speedSettings(anchor){
 if($('#speed-menu')){closeSpeedMenu();return;}
 const menu=document.createElement('div'),controller=new AbortController(),events={signal:controller.signal};
 menu.id='speed-menu';menu.className='speed-menu';menu.setAttribute('popover','manual');menu.setAttribute('role','menu');menu.setAttribute('aria-label','播放速度');
 menu.innerHTML=[.6,.75,1,1.25,1.5,2].map(n=>`<button role="menuitemradio" aria-checked="${prefs.rate===n}" data-speed="${n}"><span>${n}×${n===1?' · 正常':''}</span><span aria-hidden="true">${prefs.rate===n?'✓':''}</span></button>`).join('');
 document.body.append(menu);const rect=anchor.getBoundingClientRect();menu.style.left=`${Math.max(12,Math.min(innerWidth-192,rect.left))}px`;menu.style.bottom=`${Math.max(12,innerHeight-rect.top+8)}px`;
 menu.release=()=>{controller.abort();anchor.setAttribute('aria-expanded','false');};
 menu.addEventListener('toggle',event=>{if(event.newState==='closed'){menu.release();menu.remove();}});
 // Manual light dismissal lets the original button receive its second tap.
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!anchor.contains(event.target))closeSpeedMenu();},{...events,capture:true});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeSpeedMenu();anchor.focus({preventScroll:true});}},events);
 window.addEventListener('resize',closeSpeedMenu,events);
 menu.showPopover();anchor.setAttribute('aria-expanded','true');menu.querySelector('[aria-checked="true"]').focus({preventScroll:true});
 menu.onkeydown=event=>{const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}};
 menu.querySelectorAll('[data-speed]').forEach(button=>button.onclick=async()=>{try{prefs.rate=Number(button.dataset.speed);await savePrefs();document.querySelectorAll('[data-action="speed"] strong').forEach(el=>el.textContent=`${prefs.rate}×`);closeSpeedMenu();anchor.focus({preventScroll:true});}catch(error){report(error);}});
}
function bindTransport(){
 document.querySelectorAll('[data-action]').forEach(b=>{
 const run=async()=>{const action=b.dataset.action;if(action==='play')togglePlay();if(action==='repeat')jump(Math.max(0,current),true);if(action==='prev'||action==='next')stepSentence(action==='prev'?-1:1);if(action==='playlist')showPlaylist();if(action==='speed')speedSettings(b);if(action==='practice-settings')practiceSettings();
 if(action==='listening-mask')await toggleListeningMask();
 if(action==='translation'){await toggleTranslation();b.classList.toggle('selected',prefs.translation);}if(action==='reading'){prefs.reading=!prefs.reading;await savePrefs();renderImmersiveSentence();b.classList.toggle('selected',prefs.reading);}
 if(action==='loop'||action==='sentence-loop'){
  if(action==='loop'){prefs.loop=!repetitionActive();prefs.sentenceLoop=false;}else{prefs.sentenceLoop=!prefs.sentenceLoop;if(prefs.sentenceLoop)prefs.loop=false;}
  cancelPractice();await savePrefs();
  document.querySelectorAll('[data-action="loop"],[data-action="sentence-loop"]').forEach(el=>{const active=el.dataset.action==='loop'?repetitionActive():prefs.sentenceLoop;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));});
  if(repetitionActive()&&!audio.paused&&episode.segments?.length)practice.start(Math.max(0,segmentAt(audio.currentTime)));
 }};
 if(['prev','next'].includes(b.dataset.action))bindPress(b,()=>run().catch(report),()=>switchEpisode(b.dataset.action==='prev'?-1:1).catch(report));else b.onclick=()=>run().catch(report);
 });
 on('#seek','input',e=>{resumeFollow();cancelPractice();audio.currentTime=Number(e.target.value);current=-1;clipEnd=null;if(repetitionActive()&&!audio.paused)practice.start(Math.max(0,segmentAt(audio.currentTime)));updatePlayback();if(!immersive)scrollSentenceToView(current,'auto');});updatePracticeLabel();
}
async function toggleTranslation(){
 if(!episode?.segments?.length){openModal('先准备逐字稿',`<p class="note">这段音频还没有逐字稿。导入逐字稿或在电脑转写后，才能显示对应的中文译文。</p><button class="primary full" id="import-before-translation">导入逐字稿</button>${backend?'<button class="secondary full section-title" id="transcribe-before-translation">电脑转写与翻译</button>':''}`);on('#import-before-translation','click',()=>importScript(episode.id));on('#transcribe-before-translation','click',()=>computerTranscription(episode));return;}
 if(!(episode?.segments||[]).some(s=>s.translation?.trim())){
  openModal('这份逐字稿还没有中文译文',`<p class="note">“译文”用于显示或隐藏已经生成的中文。可以在电脑生成或修改中文后，替换这份逐字稿。</p><button class="secondary full" id="export-for-translation">导出这份逐字稿</button>${backend?'<button class="primary full section-title" id="open-translation-tool">打开本机翻译</button>':''}`);
  on('#export-for-translation','click',()=>exportTranscript(episode));on('#open-translation-tool','click',()=>translateScript(false,transcriptData(episode)));return;
 }
 prefs.translation=!prefs.translation;await savePrefs();if(immersive)renderImmersiveSentence();
 if(prefs.translation&&!episode.segments[Math.max(0,current)]?.translation)toast('这一句还没有译文，其他句子的译文可以正常显示');
 if(immListening)toast(prefs.translation?'译文已开启；精听遮挡点开后显示':'译文已关闭');
}
function readingSettings(){
 openModal('阅读显示',`<div class="reading-options"><h3>字号</h3>${[['sourceSize','原文'],['translationSize','中文']].map(([key,label])=>`<label>${label}</label><div class="segmented">${[[1,'标准'],[1.15,'舒适'],[1.3,'大']].map(([v,n])=>`<button data-reading-pref="${key}" data-value="${v}" class="${prefs[key]===v?'selected':''}">${n}</button>`).join('')}</div>`).join('')}<h3>字色</h3>${[['sourceColor','原文'],['translationColor','译文']].map(([key,label])=>`<label>${label}</label><div class="ink-options">${[['ink','墨','#27261f'],['vermilion','朱','#9b4626'],['pine','松','#42613a'],['blue','靛','#2e5b70'],['ochre','芥','#805d17']].map(([v,n,c])=>`<button data-reading-pref="${key}" data-value="${v}" class="${prefs[key]===v?'selected':''}" aria-label="${label}字色${n}"><i style="background:${c}"></i><small>${n}</small></button>`).join('')}</div>`).join('')}<h3>日语字体</h3>${[['font','正文'],['immFont','沉浸']].map(([key,label])=>`<label>${label}</label><div class="segmented">${[['mincho','明朝'],['gothic','黑体']].map(([v,n])=>`<button data-reading-pref="${key}" data-value="${v}" class="${prefs[key]===v?'selected':''}">${n}</button>`).join('')}</div>`).join('')}<label class="checkbox-line"><input id="reading-follow" type="checkbox" ${follow?'checked':''}>播放时跟随当前句</label><div class="actions"><button class="secondary" id="reader-practice">精听设置</button><button class="secondary" id="reader-manage">管理与校对</button></div></div>`);
 document.querySelectorAll('[data-reading-pref]').forEach(b=>b.onclick=async()=>{const key=b.dataset.readingPref;prefs[key]=key.endsWith('Size')?Number(b.dataset.value):b.dataset.value;await savePrefs();readingSettings();});on('#reading-follow','change',e=>{if(e.target.checked)resumeFollow();else{follow=false;updateBrowseUI();}});on('#reader-practice','click',practiceSettings);on('#reader-manage','click',audioMenu);
}
function practiceSettings(){
 audio.pause();cancelPractice();
 openModal('精听设置',`<div class="playlist-rows practice-sheet-body"><label for="repeat-count">每句重复次数</label><select id="repeat-count">${[1,2,3,5,10,0].map(n=>`<option value="${n}" ${prefs.repeats===n?'selected':''}>${n?n+' 遍':'无限重复'}</option>`).join('')}</select><label for="repeat-gap">每遍间隔</label><select id="repeat-gap">${[0,.5,1,2,3,5,10].map(n=>`<option value="${n}" ${prefs.gap===n?'selected':''}>${n} 秒</option>`).join('')}</select><label for="mask-mode">沉浸文字遮盖</label><select id="mask-mode">${[['none','全部显示'],['source','遮盖原文'],['translation','遮盖译文'],['both','遮盖原文和译文']].map(([v,n])=>`<option value="${v}" ${prefs.mask===v?'selected':''}>${n}</option>`).join('')}</select><label for="practice-reveal">听完后的显示</label><select id="practice-reveal"><option value="show" ${prefs.revealAfter?'selected':''}>显示原文与译文</option><option value="hide" ${!prefs.revealAfter?'selected':''}>保持遮盖</option></select><label class="checkbox-line"><input id="practice-pause" type="checkbox" ${prefs.pause?'checked':''}>重复完成后暂停，等待手动下一句</label><p class="note">开启循环后，按次数和间隔重复。单击句子切换遮盖与显示，双击单词打开词卡。</p><p class="note practice-save-status" id="practice-save-status" role="status" aria-live="polite">修改后自动保存</p></div>`);
 modal.classList.add('playlist-sheet','practice-sheet');$('.dialog-head').insertAdjacentHTML('beforebegin','<button class="sheet-grip" aria-label="向下滑动收起精听设置"><span></span></button>');playlistSheet=bindPlaylistSheet(modal,closeModal);
 const serial=modalSerial;let pending=0;
 const change=async()=>{
  prefs.repeats=Number($('#repeat-count').value);prefs.gap=Number($('#repeat-gap').value);prefs.mask=$('#mask-mode').value;prefs.pause=$('#practice-pause').checked;prefs.revealAfter=$('#practice-reveal').value==='show';
  pending++;$('#practice-save-status').textContent='保存中…';revealed=false;
  try{await savePrefs();if(immersive)renderImmersiveSentence();pending--;if(modal.open&&modalSerial===serial&&!pending)$('#practice-save-status').textContent='已自动保存';}
  catch(error){pending--;if(modal.open&&modalSerial===serial)$('#practice-save-status').textContent='保存未完成，请重新修改后重试。';report(error);}
 };
 for(const id of ['#repeat-count','#repeat-gap','#mask-mode','#practice-reveal','#practice-pause'])on(id,'change',()=>change());
}
function renderPlayer(){
 if(!episode)return;$('.mini-player')?.remove();$('.player-dock')?.remove();setNav();const segments=episode.segments||[],connected=!!audioFile(episode),position=audio.getAttribute('src')?audio.currentTime:episode.progress||0;
 main.innerHTML=`<div class="player-layout"><div class="player-fixed"><div class="now-playing"><button id="back-library" aria-label="返回音频库">⌄</button><span>正在播放</span><button id="reading-settings" aria-label="阅读显示设置">${icon('sliders')}</button></div><header class="episode-heading"><div class="episode-cover folder-cover" aria-hidden="true">${folderCover(folders.find(f=>f.id===episode.collectionId))}</div><div><h1>${esc(episode.title)}</h1><button id="audio-menu" class="episode-origin">${esc(folders.find(f=>f.id===episode.collectionId)?.name||episode.folder||'我的声音')} · ${LANG[episode.language]} ›</button></div></header><section class="player-progress"><div class="player-clock"><strong id="elapsed">${time(position)}</strong><small> / ${time(episode.duration)}</small></div><div class="progress-ruler" aria-hidden="true">${Array.from({length:80},(_,i)=>`<i class="${i%5===0?'major':''}"></i>`).join('')}<div class="ruler-played">${Array.from({length:80},(_,i)=>`<i class="${i%5===0?'major':''}"></i>`).join('')}</div></div><input id="seek" type="range" min="0" max="${episode.duration||1}" step=".1" value="${position}" ${connected?'':'disabled'} aria-label="播放位置"></section>${!connected?'<button class="reconnect-link" id="reconnect-audio">选择原文件播放</button>':''}</div><section class="player-reader"><button id="reader-follow" class="reader-follow" hidden>回到播放</button><div class="reader-tools"><button id="transcript-tools" aria-label="逐字稿操作">逐字稿</button><button id="toggle-translation" class="${prefs.translation?'selected':''}">译文</button><button id="toggle-reading" class="${prefs.reading?'selected':''}">读音</button><button id="listen-mask" class="${prefs.listeningMask?'selected':''}" aria-pressed="${prefs.listeningMask}">精听</button><button id="enter-immersive">沉浸阅读 →</button></div><div class="transcript" id="transcript">${segments.length?segments.map((seg,i)=>`<article class="sentence" data-sentence="${i}"><button class="sentence-time" data-jump="${i}" aria-label="播放第 ${i+1} 句">${time(seg.start)}</button><div class="sentence-content"><button class="sentence-cover" data-mask-toggle aria-label="显示第 ${i+1} 句原文与译文" hidden><i></i><i></i><i></i></button><button class="sentence-jump" data-reader-jump="${i}" aria-label="从第 ${i+1} 句开始播放"></button><div class="source" lang="${episode.language}">${wordsHTML(seg,i)}</div><div class="translation ${seg.translation?'':'empty-translation'}" ${prefs.translation?'':'hidden'}>${esc(seg.translation||'这一句还没有中文译文')}</div></div></article>`).join(''):`<div class="empty-transcript"><p>导入逐字稿，就能跟着声音阅读。</p><button class="secondary" id="player-import">导入逐字稿</button>${backend?'<button class="secondary" id="player-transcribe">电脑转写与翻译</button>':''}</div>`}</div></section></div>`;
 main.scrollTo(0,0);const dock=document.createElement('div');dock.className='player-dock';dock.innerHTML=`<div class="dock-content">${transportHTML()}</div>`;document.body.append(dock);bindTransport();
 on('#back-library','click',()=>navigate('library'));on('#reading-settings','click',readingSettings);on('#audio-menu','click',audioMenu);on('#transcript-tools','click',transcriptTools);on('#enter-immersive','click',toggleImmersive);on('#listen-mask','click',()=>toggleListeningMask().catch(report));on('#reconnect-audio','click',()=>reconnectAudio());on('#player-import','click',()=>importScript(episode.id));on('#player-transcribe','click',()=>computerTranscription(episode));
 for(const key of ['reading','translation'])on('#toggle-'+key,'click',async()=>{if(key==='translation')await toggleTranslation();else{prefs.reading=!prefs.reading;await savePrefs();}$('#toggle-'+key)?.classList.toggle('selected',prefs[key]);});
 updateListeningMask();
 document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>jump(Number(b.dataset.jump),true));bindReader($('#transcript'));on('#reader-follow','click',()=>resumeFollow(true));current=-1;wordCurrent=-1;updatePlayback();updateBrowseUI();
}
function scrollSentenceToView(index,behavior='smooth'){
 const container=$('#transcript'),target=container?.querySelector(`[data-sentence="${index}"]`);if(!target)return;
 const area=container.getBoundingClientRect(),row=target.getBoundingClientRect();
 const top=container.scrollTop+row.top-area.top-(area.height-row.height)/2;
 container.scrollTo({top:Math.max(0,Math.min(container.scrollHeight-container.clientHeight,top)),behavior});
}
function displayedSentence(){return Math.max(0,Math.min((episode?.segments?.length||1)-1,browseIndex??current));}
function updateBrowseUI(){
 $('#transcript')?.classList.toggle('manual-browse',!follow);
 document.querySelectorAll('.sentence.browsing').forEach(el=>el.classList.remove('browsing'));
 if(browseIndex!==null)$(`[data-sentence="${browseIndex}"]`)?.classList.add('browsing');
 const button=$(immersive?'#imm-follow':'#reader-follow');if(button)button.hidden=follow;
}
function resumeFollow(scroll=false){follow=true;browseIndex=null;updateBrowseUI();if(immersive)renderImmersiveSentence();else if(scroll)scrollSentenceToView(current);}
function browseSentence(index){
 const next=Math.min(episode.segments.length-1,Math.max(0,index));if(next<0)return;
 follow=false;browseIndex=next;revealed=false;updateBrowseUI();
 if(immersive)renderImmersiveSentence();else scrollSentenceToView(next);
}
function toggleSentenceMask(target){
 const row=target?.closest('[data-sentence]');if(!row)return;
 const index=Number(row.dataset.sentence);
 if(row.classList.contains('imm-current')){
  if(index!==displayedSentence()||!(immListening||prefs.mask!=='none'))return;
  revealed=!revealed;if(!revealed)autoRevealSuppressed=index;renderImmersiveSentence();
 }else if(prefs.listeningMask){
  if(uncoveredSentences.has(index))uncoveredSentences.delete(index);else uncoveredSentences.add(index);
  updateListeningMask();
 }
}
function bindReader(root){
 const indices=el=>el.dataset.word.split(':').map(Number);
 bindReaderGestures(root,{
  onWord:el=>showWord(...indices(el)).catch(report),onJump:index=>playFromSentence(index),onSentence:toggleSentenceMask,
  onSwipe:(direction,word)=>browseSentence((word?indices(word)[0]:displayedSentence())+direction),
  onBrowse:target=>{if(follow){follow=false;browseIndex=current;updateBrowseUI();}const row=target?.closest('[data-sentence]');if(row){browseIndex=Number(row.dataset.sentence);updateBrowseUI();}}
 });
}
function playFromSentence(si){
 const s=episode?.segments?.[si];if(!s)return;
 if(!audioFile(episode)){reconnectAudio(episode,{sentence:si,start:s.start});return;}
 cancelPractice();clipEnd=null;follow=true;browseIndex=null;current=-1;revealed=false;
 audio.currentTime=Math.min(s.start,Math.max(0,(episode.duration||audio.duration)-.01));updatePlayback();updateBrowseUI();
 if(immersive)renderImmersiveSentence();else scrollSentenceToView(si);
 if(repetitionActive())practice.start(si);
 // The right gutter is an explicit seek; scrolling and word lookup never seek.
 audio.play().catch(reportPlayback);
}
async function togglePlay(){
  if(!audioFile(episode)){await reconnectAudio();return;}
  if(practice.waiting){cancelPractice();audio.pause();updatePlayback();return;}
  if(audio.paused){try{if(audio.ended)audio.currentTime=0;if(repetitionActive()&&episode.segments?.length){const i=Math.max(0,segmentAt(audio.currentTime));practice.start(i);if(audio.currentTime>=episode.segments[i].end-.025)audio.currentTime=episode.segments[i].start+.005;}await audio.play();}catch(error){cancelPractice();reportPlayback(error);}}
  else{cancelPractice();audio.pause();}
}
function jump(index,play){
  const s=episode.segments?.[index];if(!s){if(play)togglePlay();return;}
  if(!audioFile(episode)){reconnectAudio();return;}
  resumeFollow();cancelPractice();clipEnd=null;current=-1;audio.currentTime=s.start+.005;updatePlayback();
  if(play){if(repetitionActive())practice.start(index);audio.play().catch(reportPlayback);}
}
function segmentAt(t){const a=episode?.segments||[];let low=0,high=a.length-1,best=-1;while(low<=high){const mid=(low+high)>>1;if(a[mid].start<=t){best=mid;low=mid+1;}else high=mid-1;}return best;}
function updatePlayback(){if(!episode)return;if($('#mini-play')){$('#mini-play').textContent=audio.paused?'▶':'Ⅱ';$('#mini-play').setAttribute('aria-label',audio.paused?'播放':'暂停');}let t=audio.getAttribute('src')?audio.currentTime:episode.progress||0;const clipping=clipEnd!==null;if(clipping&&t>=clipEnd){audio.pause();clipEnd=null;}const segments=episode.segments||[];if(!clipping){practice.tick(segments,practiceOptions(prefs));if(practice.waiting)return;}const index=segments.length?Math.max(0,segmentAt(t)):-1;if(index!==current){document.querySelectorAll('.sentence.active').forEach(el=>el.classList.remove('active'));current=index;wordCurrent=-1;autoRevealSuppressed=-1;if(browseIndex===null)revealed=false;const target=$(`[data-sentence="${index}"]`);target?.classList.add('active');if(follow&&!audio.paused&&view==='player'&&!immersive&&!modal.open)scrollSentenceToView(index,'auto');if(immersive&&browseIndex===null)renderImmersiveSentence();}const s=segments[current],word=s?.words?.findIndex(w=>t>=w.start&&t<w.end)??-1;if(word!==wordCurrent){document.querySelectorAll('.word.current').forEach(el=>el.classList.remove('current'));wordCurrent=word;if(word>=0)document.querySelectorAll(`[data-word="${current}:${word}"]`).forEach(el=>el.classList.add('current'));}if($('#elapsed'))$('#elapsed').textContent=time(t);if($('#seek'))$('#seek').value=t;if($('.progress-ruler'))$('.progress-ruler').style.setProperty('--progress',`${Math.min(100,t/Math.max(episode.duration,1)*100)}%`);if(browseIndex===null&&immListening&&prefs.revealAfter&&audio.paused&&!practice.waiting&&!revealed&&autoRevealSuppressed!==index&&s&&t>=s.end-.04){revealed=true;renderImmersiveSentence();}document.querySelectorAll('[data-action="play"]').forEach(b=>{b.textContent=audio.paused&&!practice.waiting?'▶':'Ⅱ';b.setAttribute('aria-label',audio.paused&&!practice.waiting?'播放':'暂停');});}
async function saveProgress(){if(episode){if(!objectURL||audio.currentSrc!==objectURL||audio.readyState<1)return;episode.progress=audio.currentTime||0;await write('progress',{id:episode.id,seconds:episode.progress});}}
let playbackFrame;
function activeAudio(target){return target===audio&&!!objectURL&&target.currentSrc===objectURL;}
function animatePlayback(){updatePlayback();if(!audio.paused)playbackFrame=requestAnimationFrame(animatePlayback);}
function connectAudioEvents(){
 audioUnbind();audioUnbind=bindAudioEvents(audio,activeAudio,{
  error:()=>{if(audio.error){cancelPractice();reportPlayback();updatePlayback();}},
  play:()=>{if(audio.paused)return;cancelAnimationFrame(playbackFrame);playbackFrame=requestAnimationFrame(animatePlayback);updatePlayback();},
  timeupdate:updatePlayback,
  pause:()=>{if(!audio.paused)return;cancelAnimationFrame(playbackFrame);updatePlayback();saveProgress().catch(report);},
  ended:()=>{if(!audio.ended)return;const wasClip=clipEnd!==null,wasPractice=practice.enabled;if(clipEnd===null)practice.tick(episode?.segments||[],practiceOptions(prefs),true);saveProgress().catch(report);updatePlayback();if(!wasClip&&!wasPractice&&prefs.continuous)switchEpisode(1,true).catch(report);}
 });
}
connectAudioEvents();
setInterval(()=>{if(episode&&!audio.paused)saveProgress().catch(report);},3500);
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveProgress().catch(report);});
function recoverSound(){
 const file=audioFile(episode);if(!file){reconnectAudio();return;}
 const position=resumePosition(audio.readyState?audio.currentTime:episode.progress,episode.duration),mime=playbackMime||file.type;
 const old=audio,oldURL=objectURL;audioGeneration++;openSerial++;cancelPractice();clipEnd=null;cancelAnimationFrame(playbackFrame);audioUnbind();objectURL=null;
 releaseAudio(old,URL.revokeObjectURL,oldURL);
 const fresh=document.createElement('audio');fresh.id='audio';fresh.preload='metadata';old.replaceWith(fresh);audio=fresh;practice.audio=fresh;connectAudioEvents();
 objectURL=URL.createObjectURL(mime&&file.type!==mime?new Blob([file],{type:mime}):file);const source=objectURL;
 fresh.onloadedmetadata=()=>{if(audio!==fresh||objectURL!==source)return;restoreAudioPosition(fresh,resumePosition(position,fresh.duration,{explicit:true}));current=-1;updatePlayback();};
 fresh.src=source;fresh.load();configureAudio(fresh,prefs.rate);
 // Call play synchronously from the recovery click to retain iPhone user activation.
 fresh.play().catch(reportPlayback);updatePlayback();toast('播放器已重新初始化');
}
function setImmersiveAccess(active){document.body.style.overflow=active?'hidden':'';main.inert=active;const header=document.querySelector('.app-header');if(header)header.inert=active;document.querySelector('nav').inert=active;}
function toggleImmersive(){
 closeSpeedMenu();
 if(immersive){immersive=false;immListening=false;browseIndex=null;follow=true;setImmersiveAccess(false);$('.immersive-mode')?.remove();renderPlayer();return;}
 if(!episode.segments?.length){toast('请先导入逐字稿。');return;}
 immersive=true;immListening=prefs.listeningMask;revealed=false;browseIndex=null;follow=true;setImmersiveAccess(true);
 const panel=document.createElement('section');panel.className='immersive-mode';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','沉浸阅读');
 panel.innerHTML=`<div class="imm-top"><div class="imm-position"><span id="imm-counter"></span><button id="imm-follow" hidden>回到播放</button></div><div class="actions"><button id="imm-smaller" aria-label="减小沉浸字号">A−</button><button id="imm-larger" aria-label="增大沉浸字号">A+</button><button id="exit-immersive" aria-label="退出沉浸阅读">×</button></div></div><div class="imm-body" id="imm-body"></div><div class="imm-bottom">${transportHTML()}</div>`;
 $('.player-dock')?.remove();document.body.append(panel);
 panel.classList.toggle('focused-listening',immListening);
 for(const [id,step] of [['#imm-smaller',-.1],['#imm-larger',.1]])on(id,'click',async()=>{prefs.immSize=Math.round(Math.min(1.6,Math.max(.8,prefs.immSize+step))*10)/10;await savePrefs();});
 on('#exit-immersive','click',toggleImmersive);bindTransport();renderImmersiveSentence();updatePlayback();$('#exit-immersive').focus();
 on('#imm-follow','click',()=>resumeFollow());bindReader($('#imm-body'));

}
function renderImmersiveSentence(){
 if(!immersive)return;const index=displayedSentence(),s=episode.segments[index];if(!s)return;
 $('#imm-counter').textContent=`${index+1} / ${episode.segments.length}`;
 const hideSource=!revealed&&(immListening||['source','both'].includes(prefs.mask)),hideTranslation=!revealed&&(immListening||['translation','both'].includes(prefs.mask));
 const previous=episode.segments[index-1],next=episode.segments[index+1];
 $('#imm-body').innerHTML=`${!immListening&&previous?`<button class="imm-neighbor" data-imm-neighbor="${index-1}">${esc(previous.text)}</button>`:'<div class="imm-neighbor"></div>'}<div class="imm-current" data-sentence="${index}"><button class="sentence-jump" data-reader-jump="${index}" aria-label="从第 ${index+1} 句开始播放"></button><time>${time(s.start)}</time>${hideSource?'<button class="text-cover" id="reveal-source" data-mask-toggle aria-label="显示遮盖原文"><i></i><i></i><i></i></button>':`<div class="source" lang="${episode.language}">${wordsHTML(s,index)}</div>`}${prefs.translation&&!hideTranslation?`<div class="translation ${s.translation?'':'empty-translation'}">${esc(s.translation||'这一句还没有中文译文')}</div>`:''}${hideSource?'<button class="cover-check" id="reveal-translation" data-mask-toggle>'+(prefs.translation?'显示原文与译文':'显示原文')+'</button>':hideTranslation&&s.translation&&prefs.translation?'<button class="cover-check" id="reveal-translation" data-mask-toggle>显示译文</button>':''}</div>${!immListening&&next?`<button class="imm-neighbor" data-imm-neighbor="${index+1}">${esc(next.text)}</button>`:'<div class="imm-neighbor"></div>'}`;
 document.querySelectorAll('[data-imm-neighbor]').forEach(b=>b.onclick=()=>browseSentence(Number(b.dataset.immNeighbor)));wordCurrent=-1;updateBrowseUI();
}
function categoryField(cards,value='',id='word-category'){
 return `<label for="${id}">分类</label><input id="${id}" list="card-category-options" maxlength="60" value="${esc(value)}" placeholder="例如：日常会话、旅行"><datalist id="card-category-options">${cardCategories(cards).map(name=>`<option value="${esc(name)}"></option>`).join('')}</datalist>`;
}
function playSentenceClip(range){
 cancelPractice();follow=true;browseIndex=null;current=-1;revealed=false;
 audio.currentTime=range.start;clipEnd=range.end;updatePlayback();audio.play().catch(reportPlayback);
}
async function showWord(si,wi){
 const source=episode,s=source.segments[si],w=s.words[wi];cancelPractice();audio.pause();
 const cards=await all('cards'),saved=cards.find(c=>c.episodeId===source.id&&(c.lemma||c.text)===(w.lemma||w.text.trim()));
 const context=s.words.map(token=>token.text).join('').trim()===s.text.trim()?s.words.map((token,i)=>i===wi?`<mark>${esc(token.text)}</mark>`:esc(token.text)).join(''):esc(s.text);
 openModal(w.text.trim(),`<p class="word-reading">${esc(w.reading||'')}${w.lemma&&w.lemma!==w.text.trim()?` · ${esc(w.lemma)}`:''}</p><div class="word-actions"><button class="primary" id="save-word">${saved?'更新词卡':'＋ 词卡'}</button></div><div class="playlist-rows word-sheet-body"><section class="word-definition"><label for="word-note">释义 · 我的笔记</label><textarea id="word-note" rows="2" placeholder="补充中文释义，随词卡保存">${esc(saved?.note||'')}</textarea></section><section class="word-origin"><div class="word-section-title"><span>在这句里</span><small>${esc(source.title)}</small></div><p class="word-origin-source" lang="${source.language}">${context}</p>${s.translation?`<p class="word-origin-translation">${esc(s.translation)}</p>${s.translationPending?'<small class="note">译文待更新</small>':''}`:''}<button class="secondary" id="listen-word">▶ 听原句</button></section><section class="word-category">${categoryField(cards,saved?.category||'')}</section>${!phone?'<button class="word-edit" id="edit-word-reading">修改原文与假名</button>':''}</div>`);
 modal.classList.add('playlist-sheet','word-sheet');$('.dialog-head').insertAdjacentHTML('beforebegin','<button class="sheet-grip" aria-label="向下滑动收起词卡"><span></span></button>');playlistSheet=bindPlaylistSheet(modal,closeModal);
 on('#edit-word-reading','click',()=>editEpisodeSentence(si));
 on('#listen-word','click',()=>{if(!audioFile(source)){closeModal();reconnectAudio(source,{start:s.start,end:s.end});return;}playSentenceClip(s);});
 on('#save-word','click',async()=>{try{
  await write('cards',{...saved,id:saved?.id||crypto.randomUUID(),episodeId:source.id,language:source.language,text:w.text.trim(),lemma:w.lemma||w.text.trim(),reading:w.reading||'',context:s.text,start:w.start,end:w.end,note:$('#word-note').value.trim(),category:cardCategory($('#word-category').value),due:saved?.due??Date.now(),level:saved?.level??0});
  closeModal();toast('词卡已保存');
 }catch(e){report(e);}});
}


function transcriptTools(){
 const has=!!episode.segments?.length;
 openModal('逐字稿',`<p class="note">${has?`${episode.segments.length} 句 · 可在电脑校对并试听。`:'导入后可以在电脑修改原文、译文、假名和断句。'}</p><div class="stack"><button class="primary full" id="transcript-edit-current" ${has?'':'disabled'}>修改与调整断句</button>${backend&&has?'<button class="secondary full" id="transcript-computer-translate">在电脑重新生成中文</button>':''}<button class="secondary full" id="transcript-replace">${has?'替换逐字稿':'导入逐字稿'}</button><button class="secondary full" id="transcript-export" ${has?'':'disabled'}>导出修订逐字稿</button><button class="secondary full" id="transcript-undo" ${episode.transcriptUndo?'':'disabled'}>撤销上一次校对</button></div>`);
 on('#transcript-edit-current','click',()=>editEpisodeSentence(Math.max(0,displayedSentence())));
 on('#transcript-computer-translate','click',()=>translateScript(false,transcriptData(episode)));
 on('#transcript-replace','click',()=>importScript(episode.id));on('#transcript-export','click',()=>exportTranscript(episode));on('#transcript-undo','click',undoTranscript);
}
function previewSentenceSuggestions(document,index,persist,session){
 try{
  const next=suggestSentences(document.segments,document.language);validateTranscript({...document,segments:next});
  const changed=next.length>document.segments.length;
  openModal('自动分句预览',`<p class="note">${changed?`${document.segments.length} 句 → ${next.length} 句。按标点、停顿和长度提出分界，保存前可逐句试听。拆开的旧译文暂留作参考；分句后可点击“按新断句生成中文”，更新对应译文。`:'没有找到新的分界。可以返回校对，选择“拆分这一句”，听音后手动设定断句。'}</p><div class="boundary-preview">${next.map((s,i)=>`<article><small>${i+1} · ${time(s.start)}—${time(s.end)}</small><p lang="${document.language}">${esc(s.text)}</p>${persist?`<button class="secondary" data-preview-sentence="${i}" aria-label="试听第 ${i+1} 句">试听</button>`:''}</article>`).join('')}</div><div class="actions"><button class="secondary" id="boundary-preview-back">返回校对</button>${persist?'<button class="secondary" id="boundary-preview-stop">暂停试听</button>':''}<button class="primary" id="boundary-preview-save" ${changed?'':'disabled'}>应用分句</button></div>`);
  const back=()=>{modalCanClose=null;openDocumentEditor(document,index,persist,session);};
  modalCanClose=()=>{back();return false;};on('#boundary-preview-back','click',back);on('#boundary-preview-stop','click',()=>{resetClip();audio.pause();});
  modal.querySelectorAll('[data-preview-sentence]').forEach(b=>b.onclick=()=>persist?.preview(next[Number(b.dataset.previewSentence)]));
  on('#boundary-preview-save','click',async()=>{const b=$('#boundary-preview-save');b.disabled=true;try{
   resetClip();audio.pause();if(persist?.resegment)await persist.resegment(document.segments,next);document.segments=next;session.modified=true;session.exported=false;back();toast('分句已保存，可直接试听与继续校对');
  }catch(error){report(error);b.disabled=false;}});
 }catch(error){report(error);}
}
function transcriptData(e){return {format:'tingye-transcript-v1',version:1,title:e.title,language:e.language,duration:e.duration,audio:{filename:e.filename||e.audio?.filename||'',bytes:audioSize(e)||e.audio?.bytes||0},segments:e.segments||[]};}
async function editEpisodeSentence(index=0){
  if(phone){await importScript(episode?.id);return;}
  const id=episode?.id;if(!id)return;
  const document=transcriptData(episode);
  const persist=async(before,after,index)=>{
    const e=await read('episodes',id);if(!e)throw Error('音频记录已移除。');
    const existing=prepareReadings({...e.segments[index],words:lexicalWords(e.segments[index],e.language)},e.language);
    if(JSON.stringify(existing)!==JSON.stringify(before))throw Error('这一句已在另一个窗口修改，请关闭校对后重新打开。');
    const previous=structuredClone(e.segments),related=changedCards(await all('cards'),id,before,after);
    e.segments[index]=after;e.transcriptUndo={segments:previous,cards:[],changedAt:Date.now()};
    // Keep only readings/context in the undo record: review notes and scheduling remain independent.
    const currentCards=await all('cards');e.transcriptUndo.cards=related.map(c=>{const old=currentCards.find(o=>o.id===c.id);return{id:old.id,reading:old.reading,context:old.context};});
    await saveBatch([e],related,[]);if(episode?.id===id){episode=e;current=-1;wordCurrent=-1;browseIndex=null;follow=true;if(immersive)renderImmersiveSentence();else if(view==='player')renderPlayer();}
  };
  persist.resegment=async(before,next)=>{const e=await read('episodes',id);if(!e)throw Error('音频记录已移除。');const existing=e.segments.map(seg=>prepareReadings({...seg,words:lexicalWords(seg,e.language)},e.language));if(JSON.stringify(existing)!==JSON.stringify(before))throw Error('逐字稿已在另一个窗口修改，请重新打开校对。');const cards=await all('cards'),related=resegmentCards(cards,id,before,next);e.transcriptUndo={segments:structuredClone(e.segments),cards:related.map(c=>{const old=cards.find(v=>v.id===c.id);return{id:old.id,reading:old.reading,context:old.context};}),changedAt:Date.now()};e.segments=next;await saveBatch([e],related,[]);if(episode?.id===id){episode=e;current=-1;wordCurrent=-1;browseIndex=null;follow=true;if(immersive)renderImmersiveSentence();else if(view==='player')renderPlayer();}};
  persist.preview=range=>{if(episode?.id!==id||!audioFile(episode)){toast('请先连接这段音频，再试听。');return;}playSentenceClip(range);};
  openDocumentEditor(document,index,persist);
}
async function undoTranscript(){
  try{const e=await read('episodes',episode.id),revision=e.transcriptUndo;if(!revision)throw Error('没有可撤销的校对。');
    validateTranscript({...transcriptData(e),segments:revision.segments});
    e.segments=revision.segments;delete e.transcriptUndo;
    const cards=(await all('cards')).filter(c=>c.episodeId===e.id&&revision.cards?.some(v=>v.id===c.id&&typeof v.reading==='string'&&v.reading.length<=512&&typeof v.context==='string'&&v.context.length<=10000)).map(c=>{const v=revision.cards.find(v=>v.id===c.id);return{...c,reading:v.reading,context:v.context};});
    resetClip();audio.pause();await saveBatch([e],cards,[]);episode=e;current=-1;wordCurrent=-1;browseIndex=null;follow=true;modalCanClose=null;closeModal();if(immersive)renderImmersiveSentence();else renderPlayer();toast('已撤销上一次校对');
  }catch(error){report(error);}
}
function editDocumentFile(){
  openModal('校对逐字稿文件','<label for="document-edit-file">电脑生成或已经导出的逐字稿</label><input id="document-edit-file" type="file" accept=".json,application/json"><p class="note">无需音频即可编辑英语、法语、日语原文与译文，日语假名也能修改。修订完成后导出新文件。</p><button class="primary full section-title" id="open-document-editor">打开校对</button>');
  on('#open-document-editor','click',async()=>{try{const file=$('#document-edit-file').files[0];if(!file)throw Error('请选择逐字稿文件。');if(file.size>30*1048576)throw Error('逐字稿文件过大。');openDocumentEditor(validateTranscript(JSON.parse(await file.text())));}catch(error){report(error);}});
}
function openDocumentEditor(document,index=0,persist=null,session={modified:false,exported:true}){
  validateTranscript(document);cancelPractice();audio.pause();
  if(!document.segments.length){toast('这份逐字稿没有句子。');return;}
  index=Math.max(0,Math.min(index,document.segments.length-1));
  document.segments=document.segments.map(s=>prepareReadings({...s,words:lexicalWords(s,document.language)},document.language));
  let draft=structuredClone(document.segments[index]),dirty=false;
  openModal(`校对逐字稿 · ${index+1} / ${document.segments.length}`,`<label for="editor-sentence">选择句子</label><select id="editor-sentence">${document.segments.map((s,i)=>`<option value="${i}" ${index===i?'selected':''}>${i+1} · ${time(s.start)} · ${esc(s.text.slice(0,45))}</option>`).join('')}</select>
    <p class="note">${persist?'保存后更新本机逐字稿，可在“逐字稿”菜单撤销上一次校对。':'修订先保留在这个窗口中；完成后点击“导出修订文件”。'}句子时间轴 ${time(draft.start)}—${time(draft.end)}。原文变化后，新增词的位置会估算。</p>
    ${persist?'<div class="editor-listen"><button class="secondary" id="editor-listen">听这一句</button><button class="secondary" id="editor-stop">暂停试听</button></div>':''}<label for="editor-source">原文</label><textarea id="editor-source" rows="3" maxlength="10000" spellcheck="false" lang="${document.language}">${esc(draft.text)}</textarea>
    <button class="secondary full" id="rebuild-editor-words">按修改后的原文更新词语</button>
    <div class="actions boundary-actions"><button class="secondary" id="auto-editor-segments">自动分句</button><button class="secondary" id="split-editor-sentence">拆分这一句</button><button class="secondary" id="merge-editor-next" ${index===document.segments.length-1?'disabled':''}>与下一句合并</button></div>
    ${backend?'<button class="secondary full" id="editor-computer-translate">在电脑重新生成中文</button>':''}<p class="note">${draft.translationPending?'原文或断句已改变，这一句的译文需要更新。':'可在电脑生成对应译文，或直接人工校对。'}</p><label for="editor-translation">中文译文</label><textarea id="editor-translation" rows="3" maxlength="10000">${esc(draft.translation||'')}</textarea>
    ${document.language==='ja'?'<h3 class="editor-heading">假名标注</h3><p class="note">只给汉字部分填读音，可留空取消标注。例如「話し」的「話」填「はな」；名词「話」填「はなし」。</p><div id="ruby-editor-fields"></div><div class="editor-preview source" lang="ja" id="ruby-editor-preview"></div>':''}
    <div class="editor-footer"><button class="primary full" id="save-editor-sentence">${persist?'保存这一句':'保留这一句的修订'}</button><div class="actions"><button class="secondary" id="editor-previous" ${index===0?'disabled':''}>上一句</button><button class="secondary" id="editor-next" ${index===document.segments.length-1?'disabled':''}>保存并下一句</button><button class="secondary" id="export-editor-file">导出修订文件</button></div></div>`);
  modal.classList.add('transcript-editor');
  const canDiscard=()=>!dirty||confirm('这一句的修改尚未保存，确定放弃吗？');
  modalCanClose=()=>canDiscard()&&(persist||!session.modified||session.exported||confirm('修订文件尚未导出。关闭会丢失这个窗口里的修订，确定关闭吗？'));
  function preview(){if($('#ruby-editor-preview'))$('#ruby-editor-preview').innerHTML=draft.words.map(rubyHTML).join('');}
  function fields(){
    if(!$('#ruby-editor-fields'))return;
    $('#ruby-editor-fields').innerHTML=draft.words.map((w,wi)=>rubyParts(w).map((part,pi)=>hasKanji(part.text)||part.reading?`<label class="ruby-edit-row"><span>${esc(part.text)}<small>${esc(w.text)}</small></span><input data-edit-ruby="${wi}:${pi}" aria-label="${esc(part.text)}的假名（${wi+1}）" value="${esc(part.reading)}" maxlength="512" autocomplete="off" spellcheck="false"></label>`:'').join('')).join('')||'<p class="note">这一句没有需要标注的汉字。</p>';
    documentQuery('[data-edit-ruby]').forEach(input=>input.addEventListener('input',()=>{dirty=true;try{const [wi,pi]=input.dataset.editRuby.split(':').map(Number);setRubyReading(draft.words[wi],pi,input.value);input.setCustomValidity('');preview();}catch(error){input.setCustomValidity(error.message);}}));preview();
  }
  function rebuild(){draft=editedSentence(draft,$('#editor-source').value,$('#editor-translation').value,document.language);fields();}
  async function save(move=false){
    const button=$('#save-editor-sentence');button.disabled=true;
    try{
      const invalid=documentQuery('[data-edit-ruby]').find(input=>!input.checkValidity());if(invalid){invalid.reportValidity();throw Error('请修正假名输入后保存。');}
      const before=structuredClone(document.segments[index]);rebuild();if((before.translation||'')!==draft.translation){draft.translationEdited=true;draft.translationPending=false;}draft.editedAt=Date.now();validateTranscript({...document,segments:document.segments.map((s,i)=>i===index?draft:s)});
      resetClip();audio.pause();if(persist)await persist(before,structuredClone(draft),index);document.segments[index]=structuredClone(draft);dirty=false;session.modified=true;session.exported=false;
      toast(persist?'原文、译文和假名已保存':'修订已保留，请导出修订文件');if(move){modalCanClose=null;openDocumentEditor(document,index+1,persist,session);}return true;
    }catch(error){report(error);return false;}finally{button.disabled=false;}
  }
  async function commitBoundaries(next){
    resetClip();audio.pause();next=next.map((seg,id)=>({...seg,id}));validateTranscript({...document,segments:next});if(persist?.resegment)await persist.resegment(document.segments,next);document.segments=next;session.modified=true;session.exported=false;modalCanClose=null;openDocumentEditor(document,index,persist,session);toast('断句已更新，可直接试听');
  }
  on('#merge-editor-next','click',async()=>{try{if(dirty&&!await save())return;const next=structuredClone(document.segments);next.splice(index,2,mergeSentences(next[index],next[index+1],document.language));await commitBoundaries(next);}catch(e){report(e);}});
  on('#split-editor-sentence','click',async()=>{try{
    if(dirty&&!await save())return;const original=boundaryWords(document.segments[index],document.language),choices=splitChoices(original);if(!choices.length)throw Error('这一句没有可拆分的词语边界，请先更新词语或修正原文。');
    modalCanClose=null;openModal('拆分这一句',`<label for="split-position">拆分位置（词语之间）</label><select id="split-position">${choices.map(c=>`<option value="${c.cut}">${esc(c.left.slice(-30))} ／ ${esc(c.right.slice(0,30))}</option>`).join('')}</select><p class="note" id="split-preview"></p><label for="split-time">第二句开始时间（秒）</label><input type="number" id="split-time" step="0.001"><p class="note">选择断句的词语位置，再听音调整秒数。修改分界时间会校准附近的词语时间；缺少词语时间时使用估算值。原译文保留在第一句，请分别校对两句中文。</p>${persist?'<div class="split-listen"><button class="secondary" id="split-listen-whole">听整句</button><button class="secondary" id="split-listen-left">听前半句</button><button class="secondary" id="split-listen-right">听后半句</button><button class="secondary" id="split-use-position">用当前播放位置</button><button class="secondary" id="split-stop">暂停试听</button></div>':''}<label for="split-left-translation">第一句中文</label><textarea id="split-left-translation" maxlength="10000">${esc(original.translation||'')}</textarea><label for="split-right-translation">第二句中文</label><textarea id="split-right-translation" maxlength="10000"></textarea><div class="actions"><button class="secondary" id="cancel-split">返回校对</button><button class="primary" id="confirm-split">保存拆分</button></div>`);
    const previewRange=(start,end)=>{if(!Number.isFinite(start)||!Number.isFinite(end)||start<original.start||end>original.end||start>=end){toast('请把分界时间设在这一句的开始与结束之间。');return;}persist?.preview({start,end});};
    on('#split-listen-whole','click',()=>previewRange(original.start,original.end));on('#split-listen-left','click',()=>previewRange(original.start,Number($('#split-time').value)));on('#split-listen-right','click',()=>previewRange(Number($('#split-time').value),original.end));on('#split-stop','click',()=>{resetClip();audio.pause();});
    on('#split-use-position','click',()=>{const t=audio.currentTime;if(t<=original.start||t>=original.end){toast('先听到希望断句的位置，再点这个按钮。');return;}const c=choices.reduce((a,b)=>Math.abs(a.time-t)<Math.abs(b.time-t)?a:b);$('#split-position').value=String(c.cut);update();$('#split-time').value=t.toFixed(3);splitDirty=true;audio.pause();});
    let splitDirty=false;for(const id of ['#split-left-translation','#split-right-translation','#split-time'])on(id,'input',()=>splitDirty=true);
    const update=()=>{resetClip();audio.pause();const c=choices.find(c=>c.cut===Number($('#split-position').value));$('#split-time').value=c.time.toFixed(3);$('#split-preview').textContent=c.left+' ／ '+c.right;};
    const suggestions=suggestSentences([original],document.language),preferredTime=suggestions.length>1?suggestions[0].end:(original.start+original.end)/2;
    $('#split-position').value=String(choices.reduce((a,b)=>Math.abs(a.time-preferredTime)<Math.abs(b.time-preferredTime)?a:b).cut);update();on('#split-position','change',()=>{update();splitDirty=true;});
    modalCanClose=()=>{if(splitDirty&&!confirm('拆句的修改尚未保存，确定返回吗？'))return false;openDocumentEditor(document,index,persist,session);return false;};
    on('#cancel-split','click',()=>modalCanClose());
    on('#confirm-split','click',async()=>{try{const next=structuredClone(document.segments),pair=splitSentence(original,Number($('#split-position').value),Number($('#split-time').value),[$('#split-left-translation').value,$('#split-right-translation').value]);next.splice(index,1,...pair);await commitBoundaries(next);}catch(e){report(e);}});
  }catch(e){report(e);}});
  on('#editor-computer-translate','click',async()=>{if(dirty&&!await save())return;if(!modalCanClose())return;modalCanClose=null;translateScript(false,document);});
  on('#editor-listen','click',()=>persist?.preview(draft));on('#editor-stop','click',()=>{resetClip();audio.pause();});
  on('#auto-editor-segments','click',async()=>{if(dirty&&!await save())return;previewSentenceSuggestions(document,index,persist,session);});
  on('#editor-source','input',()=>dirty=true);on('#editor-translation','input',()=>dirty=true);
  on('#rebuild-editor-words','click',()=>{try{rebuild();dirty=true;toast('词语已更新，请检查假名后保存');}catch(error){report(error);}});
  on('#save-editor-sentence','click',()=>save());on('#editor-next','click',()=>save(true));
  on('#editor-previous','click',()=>{if(canDiscard()){modalCanClose=null;openDocumentEditor(document,index-1,persist,session);}});
  on('#editor-sentence','change',event=>{if(canDiscard()){modalCanClose=null;openDocumentEditor(document,Number(event.target.value),persist,session);}else event.target.value=String(index);});
  on('#export-editor-file','click',async()=>{if(dirty&&!await save())return;try{await saveTranscriptDocument(document,transcriptExportName(document));session.exported=true;}catch(error){report(error);}});fields();
}
const documentQuery=selector=>[...window.document.querySelectorAll(selector)];

function switchToOriginal(){
  const e=episode;cancelPractice();audio.pause();
  openModal('改为读取原文件',`<p class="note">请选择手机「文件」中已保留的同一段音频。确认后移除应用内副本，逐字稿、词卡和进度仍保留。完全关闭后需重新选择原文件。</p><label for="original-switch-file">已保留的原音频</label><input id="original-switch-file" type="file" accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.opus,.aac,.mp4,.webm"><label class="checkbox-line"><input id="confirm-original-switch" type="checkbox">我已保留原文件，同意移除应用副本</label><button class="primary full section-title" id="switch-confirm">确认切换</button>`);
  on('#switch-confirm','click',async()=>{try{
    if(!$('#confirm-original-switch').checked)throw Error('请先确认原文件已保留。');const file=$('#original-switch-file').files[0];if(!file)throw Error('请选择原音频。');
    const hash=await fingerprint(file),oldHash=e.fingerprint||await fingerprint(e.audio);if(file.size!==audioSize(e)||hash!==oldHash)throw Error('这不是原来的音频，请重新选择。');
    await saveProgress();e.storageMode='external';e.audioBytes=file.size;e.mime=file.type;e.fingerprint=hash;e.audio=null;await write('episodes',e);originalFiles.set(e.id,file);
    const oldURL=objectURL;objectURL=null;releaseAudio(audio,URL.revokeObjectURL,oldURL);closeModal();await openEpisode(e.id,e.progress);toast('已移除应用副本，改用原文件');
  }catch(error){report(error);}});
}
async function checkAudio(){
 const e=episode,file=audioFile(e);if(!file){reconnectAudio();return;}
 const serial=modalSerial,info=await wavInfo(file),mime=await audioMime(file,e.filename);if(episode?.id!==e.id||modalSerial!==serial)return;
 const lines=[`文件：${e.filename||e.title}`,`保存大小：${size(file.size)}`,`播放格式：${mime||'未识别'}`,`位置：${time(audio.currentTime)} / ${time(audio.duration||e.duration)}`];
 if(info){lines.push(`WAV 编码：${info.encoding}${info.extensible?'（扩展格式）':''}`);if(info.bits)lines.push(`位深：${info.bits} bit`);if(info.channels)lines.push(`声道：${info.channels}`);if(info.sampleRate)lines.push(`采样率：${info.sampleRate} Hz`);}
 lines.push(`播放器静音：${audio.muted?'是':'否'}`,`播放器音量：${Math.round(audio.volume*100)}%`,`播放错误：${audio.error?.code||'无'}`,`播放器代次：${audioGeneration}`,`加载状态：${audio.readyState}`,`音频会话：${navigator.audioSession?.state||'浏览器未提供'}`);
 const reportText=lines.join('\n');
 openModal('检查声音',`<p class="note">${lines.map(esc).join('<br>')}</p><p class="note">进度走但没有声音时，可先从头播放，再对比手机“文件”里的原音频。此检查只在本机读取格式信息。</p><button class="primary full" id="play-audio-from-start">从头播放</button><button class="secondary full section-title" id="recover-audio-sound">恢复声音 · 保留当前位置</button><button class="secondary full section-title" id="copy-audio-check">复制检查信息</button>`);
 on('#play-audio-from-start','click',()=>{closeModal();cancelPractice();clipEnd=null;current=-1;audio.currentTime=0;audio.muted=false;audio.volume=1;updatePlayback();audio.play().catch(reportPlayback);});
 on('#recover-audio-sound','click',()=>{closeModal();recoverSound();});
 on('#copy-audio-check','click',async()=>{try{await navigator.clipboard.writeText(reportText);toast('检查信息已复制');}catch{toast('复制未成功，可直接查看上方检查信息');}});
}
async function audioMenu(){openModal('管理音频',`<div class="stack">${episode.storageMode!=='external'?'<button class="secondary full" id="switch-original">改为读取原文件，移除应用副本</button>':'<button class="secondary full" id="connect-original">重新选择原音频</button>'}${!phone?`<button class="secondary full" id="edit-transcript" ${episode.segments?.length?'':'disabled'}>人工校对原文、译文与假名</button><button class="secondary full" id="undo-transcript" ${episode.transcriptUndo?'':'disabled'}>撤销上一次校对</button>`:''}<button class="secondary full" id="replace-script">${episode.segments?.length?'替换逐字稿':'导入逐字稿'}</button>${backend?'<button class="secondary full" id="retranscribe">在这台电脑重新转写</button>':''}<button class="secondary full" id="export-script" ${episode.segments?.length?'':'disabled'}>导出逐字稿与时间轴</button><button class="secondary full" id="check-audio">检查声音</button><button class="secondary full" id="export-audio">导出原音频</button><button class="secondary full" id="extract-words" ${episode.segments?.length?'':'disabled'}>提取生词</button><button class="secondary full" id="add-bookmark">在当前位置加书签</button><button class="secondary full" id="show-bookmarks">书签（${episode.bookmarks?.length||0}）</button><button class="danger full" id="delete-audio">移除这段音频</button></div>`);on('#edit-transcript','click',()=>editEpisodeSentence(Math.max(0,current)));on('#undo-transcript','click',undoTranscript);on('#switch-original','click',switchToOriginal);on('#connect-original','click',()=>reconnectAudio());on('#retranscribe','click',()=>computerTranscription(episode));on('#replace-script','click',()=>{closeModal();importScript(episode.id);});on('#export-script','click',()=>exportTranscript(episode));on('#check-audio','click',()=>checkAudio().catch(report));on('#export-audio','click',()=>{const file=audioFile(episode);if(file)download(file,episode.filename||episode.title+'.mp3');else reconnectAudio();});on('#extract-words','click',extractWords);on('#add-bookmark','click',async()=>{episode.bookmarks||=[];episode.bookmarks.push({time:audio.currentTime,text:episode.segments?.[Math.max(0,current)]?.text||time(audio.currentTime)});await write('episodes',episode);toast('已加书签');audioMenu();});on('#show-bookmarks','click',()=>{openModal('书签',episode.bookmarks?.length?`<div class="stack">${episode.bookmarks.map((b,i)=>`<button class="secondary" data-bookmark="${i}">${time(b.time)} · ${esc(b.text)}</button>`).join('')}</div>`:'<p class="note">播放时点击“加书签”，就能标记一个位置。</p>');document.querySelectorAll('[data-bookmark]').forEach(b=>b.onclick=()=>{closeModal();if(!audioFile(episode)){reconnectAudio();return;}current=-1;audio.currentTime=episode.bookmarks[Number(b.dataset.bookmark)].time;updatePlayback();});});on('#delete-audio','click',()=>{openModal('删除这段音频？','<p class="note">会移除应用中的记录、逐字稿和对应词卡；手机「文件」中的原音频不会被删除。建议先导出备份。</p><div class="actions"><button class="secondary" id="cancel-delete">保留</button><button class="danger" id="confirm-delete">确认删除</button></div>');on('#cancel-delete','click',closeModal);on('#confirm-delete','click',async()=>{const id=episode.id;cancelPractice();originalFiles.delete(id);audio.pause();episode=null;const oldURL=objectURL;objectURL=null;releaseAudio(audio,URL.revokeObjectURL,oldURL);await remove('episodes',id);for(const c of await all('cards'))if(c.episodeId===id)await remove('cards',c.id);$('.player-dock')?.remove();closeModal();navigate('library');});});}


async function extractWords(){
  cancelPractice();audio.pause();const existing=await all('cards'),candidates=[],seen=new Set();
  for(const [si,seg] of (episode.segments||[]).entries())for(const [wi,w] of (seg.words||[]).entries()){
    const term=(w.lemma||w.text).trim();
    if(!term||w.selectable===false||!/[\p{L}\p{N}]/u.test(term)||seen.has(term)||existing.some(c=>c.episodeId===episode.id&&(c.lemma||c.text)===term))continue;
    seen.add(term);candidates.push({si,wi,w,seg,term});
  }
  openModal('提取生词',`<p class="note">按完整词语选择，日语动词优先记录词典原形。${episode.language==='ja'?'电脑新转写使用词典分词；旧逐字稿使用手机分词。':''}</p><div class="actions"><button class="chip" id="select-words">全选</button><button class="chip" id="clear-words">清空</button></div><div class="word-candidates">${candidates.length?candidates.map((c,i)=>`<label class="candidate"><input type="checkbox" data-candidate="${i}"><span lang="${episode.language}"><strong>${esc(c.term)}</strong><small>${esc(c.w.reading||'')}</small></span></label>`).join(''):'<p class="note">这里的词语已经保存，或暂无可提取的词。</p>'}</div><button class="primary full" id="save-candidates" ${candidates.length?'':'disabled'}>保存所选词卡</button>`);
  on('#select-words','click',()=>document.querySelectorAll('[data-candidate]').forEach(el=>el.checked=true));
  on('#clear-words','click',()=>document.querySelectorAll('[data-candidate]').forEach(el=>el.checked=false));
  on('#save-candidates','click',async()=>{try{
    const selected=[...document.querySelectorAll('[data-candidate]:checked')].map(el=>candidates[Number(el.dataset.candidate)]);
    if(!selected.length)throw Error('请先选择要记住的词。');
    const cards=selected.map(c=>({id:crypto.randomUUID(),episodeId:episode.id,language:episode.language,text:c.w.text.trim(),lemma:c.term,reading:c.w.reading||'',context:c.seg.text,start:c.w.start,end:c.w.end,note:'',due:Date.now(),level:0}));
    await saveBatch([],cards,[]);closeModal();toast(`已保存 ${cards.length} 张词卡`);
  }catch(err){report(err);}});
}
async function exportDictionary(subset){
  const cards=Array.isArray(subset)?subset:await all('cards'),text=dictionaryText(cards,'all');
  openModal('导出到词典',`<p class="note">去重后 ${text?text.split('\n').length:0} 个词语，一行一个词。动词优先使用词典原形，不包含读音、释义或时间轴。</p><label for="dictionary-text">可直接复制到其他词典</label><textarea id="dictionary-text" rows="10" readonly spellcheck="false">${esc(text)}</textarea><div class="actions"><button class="primary" id="copy-dictionary" ${text?'':'disabled'}>复制全部单词</button><button class="secondary" id="download-dictionary" ${text?'':'disabled'}>保存 TXT</button></div>`);
  on('#copy-dictionary','click',async()=>{const field=$('#dictionary-text');try{await navigator.clipboard.writeText(field.value);toast('已复制，一行一个日语单词');}catch{field.focus();field.select();field.setSelectionRange(0,field.value.length);toast('请在选中的文字上长按，选择“复制”');}});
  on('#download-dictionary','click',()=>download(new Blob([$('#dictionary-text').value],{type:'text/plain;charset=utf-8'}),'生词.txt'));
}
function miniPlayer(){
  $('.mini-player')?.remove();if(!episode||!audioFile(episode)||view==='player'||immersive)return;
  const mini=document.createElement('div');mini.className='mini-player';mini.innerHTML=`<button id="mini-open"><span class="mini-cover folder-cover" aria-hidden="true">${folderCover(folders.find(f=>f.id===episode.collectionId))}</span><strong>${esc(episode.title)}</strong><small>${esc(folderName(episode))}</small></button><button id="mini-play" aria-label="${audio.paused?'播放':'暂停'}">${audio.paused?'▶':'Ⅱ'}</button>`;document.body.append(mini);
  on('#mini-open','click',()=>openEpisode(episode.id).catch(report));on('#mini-play','click',togglePlay);
}

async function renderCards(){
 view='cards';setNav();$('.player-dock')?.remove();
 const allCards=await all('cards'),collection=await all('episodes'),categories=cardCategories(allCards);
 if(cardCategoryFilter.startsWith('c:')&&!categories.includes(decodeURIComponent(cardCategoryFilter.slice(2))))cardCategoryFilter='';
 if(cardFolderFilter&&cardFolderFilter!=='unfiled'&&!folders.some(f=>f.id===cardFolderFilter))cardFolderFilter='';
 const cards=selectedCards(allCards,collection,{language:filter,category:cardCategoryFilter,folder:cardFolderFilter}).sort((a,b)=>a.due-b.due),due=cards.filter(c=>c.due<=Date.now()),sources=new Map(collection.map(e=>[e.id,e]));
 main.innerHTML=`<section class="intro"><h1>我的词卡</h1><p>${allCards.length?`${cards.length} 张词卡 · ${due.length} 张待复习`:'在逐字稿里点一个词，把它留下来。'}</p></section><div class="filters">${[['','全部'],...Object.entries(LANG)].map(([c,n])=>`<button class="chip ${filter===c?'active':''}" data-filter="${c}">${n}</button>`).join('')}</div>
 <div class="card-filters"><div><label for="card-category-filter">词卡分类</label><select id="card-category-filter"><option value="">全部分类</option><option value="unfiled" ${cardCategoryFilter==='unfiled'?'selected':''}>未分类</option>${categories.map(name=>{const value='c:'+encodeURIComponent(name);return `<option value="${esc(value)}" ${cardCategoryFilter===value?'selected':''}>${esc(name)}</option>`;}).join('')}</select></div><div><label for="card-folder-filter">音频文件夹</label><select id="card-folder-filter"><option value="">全部文件夹</option><option value="unfiled" ${cardFolderFilter==='unfiled'?'selected':''}>未分组音频</option>${folders.map(f=>`<option value="${esc(f.id)}" ${cardFolderFilter===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select></div></div>
 <div class="actions">${due.length?'<button class="primary" id="start-review">开始复习</button>':''}<button class="secondary" id="dictionary-export" ${cards.length?'':'disabled'}>导出到词典</button></div>
 <div class="stack section-title">${cards.length?cards.map(c=>`<article class="card"><div class="card-meta"><small>${LANG[c.language]} · ${esc(c.category||'未分类')}</small><small>${esc(sources.get(c.episodeId)?.title||'原音频已删除')}</small></div><div class="card-word">${esc(c.lemma||c.text)} ${c.reading?`<small>${esc(c.reading)}</small>`:''}</div><p>${esc(c.note||'暂无备注')}</p><p class="card-context">${esc(c.context)}</p><div class="actions"><button class="secondary" data-card-listen="${c.id}">听原句</button><button class="secondary" data-card-edit="${c.id}">编辑</button></div></article>`).join(''):`<div class="empty"><div class="empty-icon" aria-hidden="true">▤</div><h2>${allCards.length?'这个分类还没有词卡':'还没有词卡'}</h2><p>${allCards.length?'换个分类，或在编辑词卡时填写分类名称。':'打开一段有逐字稿的音频，点想记住的词。'}</p><button class="primary" id="cards-library">查看音频</button></div>`}</div>`;
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderCards().catch(report);});
 on('#card-category-filter','change',event=>{cardCategoryFilter=event.target.value;renderCards().catch(report);});
 on('#card-folder-filter','change',event=>{cardFolderFilter=event.target.value;renderCards().catch(report);});
 on('#dictionary-export','click',()=>exportDictionary(cards));on('#cards-library','click',()=>navigate('library'));on('#start-review','click',()=>reviewCards(due));
 document.querySelectorAll('[data-card-listen]').forEach(b=>b.onclick=()=>listenCard(cards.find(c=>c.id===b.dataset.cardListen)).catch(report));
 document.querySelectorAll('[data-card-edit]').forEach(b=>b.onclick=()=>editCard(cards.find(c=>c.id===b.dataset.cardEdit)).catch(report));
}
async function listenCard(card){
 const e=await read('episodes',card.episodeId);if(!e){toast('原音频已被删除');return;}
 const sentence=cardSentence(card,e.segments);if(!sentence){toast('找不到原句时间轴，请先重新导入或校对逐字稿');return;}
 await openEpisode(e.id,sentence.start);
 if(!audioFile(e)){await reconnectAudio(e,{start:sentence.start,end:sentence.end});return;}
 playSentenceClip(sentence);
}
async function editCard(card){
 const cards=await all('cards');
 openModal('编辑词卡',`<h2>${esc(card.text)}</h2><label for="edit-note">我的释义或备注</label><textarea id="edit-note" rows="3">${esc(card.note)}</textarea>${categoryField(cards,card.category||'','edit-category')}<div class="actions"><button class="primary" id="update-card">保存</button><button class="danger" id="delete-card">删除词卡</button></div>`);
 on('#update-card','click',async()=>{try{await write('cards',{...card,note:$('#edit-note').value.trim(),category:cardCategory($('#edit-category').value)});closeModal();await renderCards();}catch(e){report(e);}});
 on('#delete-card','click',async()=>{try{await remove('cards',card.id);closeModal();await renderCards();}catch(e){report(e);}});
}
function reviewCards(cards,index=0){if(index>=cards.length){closeModal();toast('本次复习完成');renderCards();return;}const c=cards[index];openModal(`复习 ${index+1} / ${cards.length}`,`<div class="card-word">${esc(c.lemma||c.text)}</div><p class="card-context">${esc(c.context)}</p><button class="secondary full" id="reveal-card">显示我的备注</button><div id="card-answer" hidden><p>${esc(c.note||'尚未填写备注')}</p><div class="actions"><button class="secondary" id="review-again">还不熟</button><button class="primary" id="review-known">记住了</button></div></div>`);on('#reveal-card','click',()=>{$('#card-answer').hidden=false;$('#reveal-card').hidden=true;});for(const [selector,known] of [['#review-again',false],['#review-known',true]])on(selector,'click',async()=>{c.level=known?Math.min(5,(c.level||0)+1):0;c.due=Date.now()+(known?[1,1,3,7,14,30][c.level]*86400000:600000);await write('cards',c);reviewCards(cards,index+1);});}
async function renderSettings(){view='settings';setNav();$('.player-dock')?.remove();const estimate=await navigator.storage?.estimate?.()||{},persisted=await navigator.storage?.persisted?.()||false,episodes=await all('episodes'),total=episodes.reduce((n,e)=>n+(e.audio?.size||0),0);main.innerHTML=`<section class="intro"><h1>设置</h1><p>阅读习惯和本机资料。</p></section><div class="settings-grid"><section class="panel"><h2>外观</h2><label for="appearance">日间与夜间</label><select id="appearance">${[['system','跟随系统'],['light','日间模式'],['dark','夜间模式']].map(([v,n])=>`<option value="${v}" ${prefs.appearance===v?'selected':''}>${n}</option>`).join('')}</select><label>色系</label><div class="palette-grid">${Object.entries(palettes).map(([id,p])=>`<button data-palette="${id}" class="palette ${prefs.palette===id?'selected':''}" aria-pressed="${prefs.palette===id}"><span style="background:${p.light[5]}"></span>${p.name}</button>`).join('')}</div></section><section class="panel"><h2>日语排版</h2><label for="font">正文字体</label><select id="font"><option value="gothic" ${prefs.font==='gothic'?'selected':''}>黑体</option><option value="mincho" ${prefs.font==='mincho'?'selected':''}>明朝体</option></select><label for="imm-font">沉浸字体</label><select id="imm-font"><option value="gothic" ${prefs.immFont==='gothic'?'selected':''}>黑体</option><option value="mincho" ${prefs.immFont==='mincho'?'selected':''}>明朝体</option></select><p class="source" lang="ja"><ruby>今日<rt>きょう</rt></ruby>も、<ruby>少<rt>すこ</rt></ruby>しずつ。</p></section><section class="panel"><h2>本机保存</h2><p>${episodes.length} 段音频 · 应用副本 ${size(total)}</p><p class="note">${episodes.filter(e=>e.storageMode==='external').length} 段直接读取原文件，不占用副本空间。</p><div class="storage-track"><span style="width:${Math.min(100,estimate.quota?(estimate.usage||0)/estimate.quota*100:0)}%"></span></div><p class="note">${persisted?'已获得长期保存权限。':'浏览器资料可能被系统清理。重要音频请同时保存在手机“文件”中，并定期导出备份。'}</p><div class="stack"><button class="secondary full" id="persist-storage">申请长期保存</button><button class="primary full" id="export-backup">导出学习资料与副本备份</button><button class="secondary full" id="import-backup">恢复备份</button></div></section><section class="panel"><h2>在手机上安装</h2><p class="note">在 Safari 中打开网页，点击分享按钮，选择“添加到主屏幕”，然后从主屏幕打开听页。</p><div class="install-note">${'serviceWorker'in navigator&&window.isSecureContext?'界面与学习资料可离线使用。原文件模式需要重新选择音频；应用副本可以直接播放。':'当前地址不支持完整离线安装，请使用 HTTPS 网页。'}</div></section><section class="panel"><h2>电脑转写</h2><p class="note">电脑本机处理音频，生成逐字稿、时间轴和中文译文。导出的文件和原音频一起导入手机，之后不需要电脑在线。</p><button class="primary full" id="computer-transcribe" ${backend?'':'disabled'}>${backend?'打开电脑转写':'请在电脑启动本地转写工具'}</button>${backend?'<button class="secondary full section-title" id="settings-export-location">逐字稿保存位置</button><button class="secondary full section-title" id="translate-script">重新翻译已有逐字稿</button><button class="secondary full section-title" id="repair-readings">重新分析旧逐字稿的日语假名</button><button class="secondary full section-title" id="podcast-import">导入播客 RSS / 音频链接</button>':''}</section></div>`;on('#appearance','change',async e=>{prefs.appearance=e.target.value;await savePrefs();});document.querySelectorAll('[data-palette]').forEach(b=>b.onclick=async()=>{prefs.palette=b.dataset.palette;await savePrefs();renderSettings();});on('#font','change',async e=>{prefs.font=e.target.value;await savePrefs();});on('#imm-font','change',async e=>{prefs.immFont=e.target.value;await savePrefs();});on('#persist-storage','click',async()=>{const granted=await navigator.storage?.persist?.();toast(granted?'已获得长期保存权限':'系统暂未授予长期保存权限，请保留备份');renderSettings();});on('#export-backup','click',exportBackup);on('#import-backup','click',importBackup);on('#computer-transcribe','click',()=>computerTranscription());on('#settings-export-location','click',()=>exportLocation());on('#podcast-import','click',podcastImport);on('#translate-script','click',()=>translateScript(false));on('#repair-readings','click',()=>translateScript(true));}
async function exportBackup(){try{const episodes=await all('episodes'),cards=await all('cards');let offset=0;const entries=episodes.map(e=>{const{audio,transcriptUndo,...meta}=e;const bytes=audio?.size||0;const entry={...meta,offset,bytes,mime:audio?.type||e.mime||'audio/mpeg'};offset+=bytes;return entry;});const json=new TextEncoder().encode(JSON.stringify({format:'tingye-backup-v2',episodes:entries,cards,folders,playbackLists:validatePlaybackLists(playbackLists.filter(state=>!state.scope||folders.some(f=>f.id===state.scope)).map(state=>({...state,ids:state.ids.filter(id=>episodes.some(e=>e.id===id)),excluded:state.excluded.filter(id=>episodes.some(e=>e.id===id))}))),preferences:prefs})),header=new Uint8Array(12);header.set(new TextEncoder().encode('TINGYE01'),0);new DataView(header.buffer).setUint32(8,json.length,true);download(new Blob([header,json,...episodes.filter(e=>e.audio).map(e=>e.audio)],{type:'application/octet-stream'}),`听页备份-${new Date().toISOString().slice(0,10)}.tyb`);toast('备份包含学习资料和应用副本；原文件音频请自行保留');}catch(e){report(e);}}
function importBackup(){openModal('恢复备份','<input id="backup-file" type="file" accept=".tyb"><p class="note">恢复时会添加备份里的音频和词卡，不会覆盖现有资料。</p><button class="primary full" id="restore-backup">恢复到本机</button>');on('#restore-backup','click',async()=>{const b=$('#restore-backup');b.disabled=true;try{const file=$('#backup-file').files[0];if(!file||file.size<12)throw Error('请选择听页备份文件。');const header=await file.slice(0,12).arrayBuffer();if(new TextDecoder().decode(header.slice(0,8))!=='TINGYE01')throw Error('备份格式不正确。');const length=new DataView(header).getUint32(8,true);if(length>30*1048576||12+length>file.size)throw Error('备份文件不完整。');const meta=JSON.parse(await file.slice(12,12+length).text());validateBackup(meta,file.size-12-length);const idMap=new Map(),episodes=[];for(const item of meta.episodes){if(!LANG[item.language]||!Number.isSafeInteger(item.offset)||!Number.isSafeInteger(item.bytes)||item.offset<0||item.bytes<(item.storageMode==='external'?0:1)||item.bytes>350*1048576||12+length+item.offset+item.bytes>file.size)throw Error('备份中的音频不完整。');validateTranscript({format:'tingye-transcript-v1',version:1,language:item.language,duration:item.duration,segments:item.segments||[]});const id=crypto.randomUUID();idMap.set(item.id,id);const {transcriptUndo,...restoredItem}=item;episodes.push({...restoredItem,id,audio:item.storageMode==='external'?null:file.slice(12+length+item.offset,12+length+item.offset+item.bytes,item.mime||'audio/mpeg')});}const cards=meta.cards.filter(c=>idMap.has(c.episodeId)).map(c=>({...c,id:crypto.randomUUID(),episodeId:idMap.get(c.episodeId)}));const restored=restoreFolders(meta.folders||[],episodes,()=>crypto.randomUUID()),updatedFolders=[...folders,...restored.folders];validateFolders(updatedFolders);const restoredPrefs=validatePreferences(meta.preferences),folderMap=new Map((meta.folders||[]).map((f,i)=>[f.id,restored.folders[i].id])),restoredLists=restorePlaybackLists(playbackLists.filter(state=>!state.scope||folders.some(f=>f.id===state.scope)),meta.playbackLists||[],idMap,folderMap);await saveBatch(restored.episodes,cards,[{id:'preferences',value:restoredPrefs},{id:'audio-folders',value:updatedFolders},{id:'playback-lists',value:restoredLists}]);folders=updatedFolders;playbackLists=restoredLists;prefs=restoredPrefs;applyPrefs();closeModal();navigate('library');toast(`已恢复 ${episodes.length} 段音频`);}catch(e){report(e);b.disabled=false;}});}
async function computerTranscription(existing){
  if(!backend){toast('请在电脑启动本地转写工具。');return;}if(backendVersion<4){openModal('电脑工具需要更新','<p class="note">请先导出旧电脑任务结果，再重启电脑工具启用新的上下文翻译。</p>');return;}
  if(existing?.id&&!audioFile(existing)){await reconnectAudio(existing);return;}
  const requestedAudio=existing;
  const savedJob=(await read('settings','transcription-job'))?.value;
  const pending=(!existing||(existing.id&&savedJob?.episodeId===existing.id))?savedJob:null;
  if(pending?.episodeId)existing=await read('episodes',pending.episodeId);
  openModal('电脑转写',`${pending?'<p class="note">继续查看上一次转写任务。</p>':existing?`<div class="file-meta">${esc(existing.title)}</div>`:'<label for="asr-audio">临时处理的音频</label><input id="asr-audio" type="file" accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg">'}${pending?'':`<label for="asr-language">音频语言</label><select id="asr-language">${Object.entries(LANG).map(([c,n])=>`<option value="${c}" ${(existing?.language||(backendVersion>=7?'ja':'en'))===c?'selected':''}>${n}</option>`).join('')}</select><p class="note">${backendVersion>=7?'日语使用 MOSS，优先 GPU 加速；英语和法语沿用原模型。':''}处理后清理临时音频。高质量翻译结合前后文，首次需下载约 2.5 GB 免费模型；本机已准备好的模型可离线使用。</p><label class="checkbox-line"><input id="asr-translate" type="checkbox" checked>同时生成中文译文</label><label for="asr-engine">翻译方式</label><select id="asr-engine"><option value="quality">高质量 · 结合对话上下文</option><option value="fast">快速 · 小模型逐句翻译</option></select><label for="asr-glossary">人名、店名或术语（可选）</label><textarea id="asr-glossary" maxlength="5000" rows="2" placeholder="一行一条，例如：みどり = みどり咖啡馆"></textarea><button class="primary full" id="start-asr">开始本机处理</button>`}<button class="secondary full section-title" id="asr-export-location">逐字稿保存位置</button><div id="asr-result"></div><button class="secondary full section-title" id="new-asr" ${pending?'':'hidden'}>开始新的转写</button>`);
  on('#asr-export-location','click',()=>exportLocation(()=>computerTranscription(requestedAudio)));
  const serial=modalSerial;
  const alive=()=>modal.open&&modalSerial===serial&&!!$('#asr-result');
  on('#new-asr','click',async()=>{await remove('settings','transcription-job');await computerTranscription(requestedAudio);});
  async function poll(id){
    if(!alive())return;
    try{
      const r=await fetch(new URL(`api/jobs/${id}`,BASE)),job=await r.json();
      if(!alive())return;
      if(!r.ok)throw Error(job.detail||'读取任务失败。');
      $('#asr-result').innerHTML=`<div class="job"><strong>${esc(job.message)}</strong><progress max="100" value="${job.progress||0}"></progress><p class="note">${job.progress||0}%</p></div>`;
      if(job.state==='done'){
        $('#new-asr').hidden=false;
        $('#asr-result').innerHTML=`<div class="job"><strong>${esc(job.message)}</strong>${job.result.translation_warning?'<p class="note">翻译未完成；逐字稿仍可导出。可稍后使用“补译逐字稿”。</p>':''}<p class="note">${job.result.segments.length} 个句段 · 音频 ${time(job.result.duration)}</p><button class="primary full" id="download-asr">导出逐字稿与时间轴</button><button class="secondary full section-title" id="edit-generated-document">人工校对原文、译文与假名</button>${existing?.id?'<button class="secondary full section-title" id="attach-asr">用于当前音频</button>':''}</div>`;
        on('#edit-generated-document','click',()=>openDocumentEditor(job.result));on('#download-asr','click',()=>saveTranscriptDocument(job.result,transcriptExportName(job.result)).catch(report));
        on('#attach-asr','click',async()=>{try{await attachTranscript(existing,job.result);closeModal();await openEpisode(existing.id);}catch(e){report(e);}});
        return;
      }
      if(job.state==='error')throw Error(`${job.message}：${job.detail||''}`);
      jobTimer=setTimeout(()=>poll(id),1500);
    }catch(e){if(alive()){$('#new-asr').hidden=false;$('#asr-result').innerHTML=`<p class="note">${esc(e.message)}</p>`;report(e);}}
  }
  if(pending?.id){await poll(pending.id);return;}
  on('#start-asr','click',async()=>{
    const button=$('#start-asr');button.disabled=true;
    try{
      const file=existing?audioFile(existing)&&new File([audioFile(existing)],existing.filename,{type:audioFile(existing).type}):$('#asr-audio').files[0];
      if(!file)throw Error(existing?'请先连接原音频，再开始电脑转写。':'请选择音频文件。');if(file.size>350*1048576)throw Error('音频不能超过 350 MB。');
      const form=new FormData();form.append('audio',file);form.append('language',$('#asr-language').value);form.append('translate',String($('#asr-translate').checked));form.append('translation_engine',$('#asr-engine').value);form.append('glossary',$('#asr-glossary').value);
      $('#asr-result').innerHTML='<p class="note">正在提交给本机转写工具…</p>';
      const response=await fetch(new URL('api/jobs',BASE),{method:'POST',body:form}),result=await response.json();
      if(!response.ok)throw Error(result.detail||'任务未能启动。');
      await write('settings',{id:'transcription-job',value:{id:result.id,episodeId:existing?.id||null}});
      if(alive()){button.hidden=true;await poll(result.id);}
    }catch(e){if(alive()){report(e);button.disabled=false;}}
  });
}

function translateScript(readings=false,prepared=null){
  const targetId=prepared?episode?.id:null;
  if(!readings&&backendVersion<4){openModal('电脑工具需要更新','<p class="note">请先导出旧任务结果，再重启电脑工具启用高质量翻译。</p>');return;}
  openModal(readings?'修正已有日语假名':'补译逐字稿','<label for="translate-file">已有的逐字稿文件</label><input id="translate-file" type="file" accept=".json,application/json"><p class="note">只在本机生成中文译文，保留原来的逐字稿和时间轴。完成后导出，再导入手机中对应的音频。</p><button class="primary full section-title" id="start-translation">开始中文翻译</button><div id="translation-result"></div>');
  if(readings){if(backendVersion<3){openModal('电脑工具需要更新','<p class="note">请先导出旧电脑任务结果，再关闭旧工具并重新启动，启用新的假名分析。</p>');return;}$('#start-translation').textContent='重新分析日语假名';$('#translate-file').nextElementSibling.textContent='使用本机日语词典和上下文规则重新分析，汉字与词尾分别标注。保留原文、译文和句子时间轴，也保留已标记的人工读音修正。无需再次处理音频。';}
  if(!readings){$('#translate-file').nextElementSibling.textContent='重新生成中文译文，保留原文、时间轴和人工假名。高质量翻译结合前后文；不会自动覆盖人工修改的译文。';$('#start-translation').insertAdjacentHTML('beforebegin','<label for="translation-engine">翻译方式</label><select id="translation-engine"><option value="quality">高质量 · 结合上下文</option><option value="fast">快速 · 小模型</option></select><label for="translation-glossary">人名、店名或术语（可选）</label><textarea id="translation-glossary" maxlength="5000" rows="2" placeholder="一行一条：原文 = 中文译法"></textarea><label class="checkbox-line"><input id="translation-overwrite" type="checkbox">同时更新人工修改的中文译文</label>');}
  if(prepared){$('#translate-file').hidden=true;$('#translate-file').previousElementSibling.textContent=prepared.title||'当前音频逐字稿';}
  const serial=modalSerial,alive=()=>modal.open&&serial===modalSerial&&!!$('#translation-result');
  async function poll(id){
    if(!alive())return;
    try{const response=await fetch(new URL(`api/jobs/${id}`,BASE)),job=await response.json();if(!alive())return;if(!response.ok)throw Error(job.detail||'读取失败');
      $('#translation-result').innerHTML=`<p class="note">${esc(job.message)} · ${job.progress||0}%</p>`;
      if(job.state==='done'){
        if(!readings&&job.result.translation_warning)throw Error('中文翻译未完成，请检查模型下载与本机工具后重试。');
        $('#translation-result').innerHTML=`<button class="primary full section-title" id="save-translated-script">${readings?'导出假名修订逐字稿':'导出含中文译文的逐字稿'}</button><button class="secondary full section-title" id="edit-processed-document">人工校对</button>${targetId?'<button class="primary full section-title" id="apply-translated-document">应用译文到当前音频</button>':''}`;on('#apply-translated-document','click',async()=>{try{const e=await read('episodes',targetId);if(!e||e.language!==prepared.language||e.segments.length!==prepared.segments.length||e.segments.some((s,i)=>s.text!==prepared.segments[i].text||s.start!==prepared.segments[i].start||s.end!==prepared.segments[i].end))throw Error('原文或断句已修改，请导出译文后重新核对，不会覆盖当前逐字稿。');e.segments=e.segments.map((s,i)=>s.translationEdited&&s.translation!==prepared.segments[i].translation?s:{...s,translation:job.result.segments[i].translation,translationEdited:job.result.segments[i].translationEdited});await write('episodes',e);prefs.translation=true;await savePrefs();if(episode?.id===targetId)episode=e;closeModal();if(immersive)renderImmersiveSentence();else if(view==='player')renderPlayer();toast('中文译文已应用，原文和假名保留');}catch(error){report(error);}});on('#edit-processed-document','click',()=>openDocumentEditor(job.result));
        on('#save-translated-script','click',()=>saveTranscriptDocument(job.result,transcriptExportName(job.result)).catch(report));$('#start-translation').disabled=false;return;
      }
      if(job.state==='error')throw Error(job.message);jobTimer=setTimeout(()=>poll(id),1500);
    }catch(error){if(alive()){report(error);$('#start-translation').disabled=false;$('#translation-result').innerHTML=`<p class="note">${esc(error.message)}</p>`;}}
  }
  on('#start-translation','click',async()=>{const button=$('#start-translation');button.disabled=true;try{
    const file=prepared?new File([JSON.stringify(prepared)],'当前逐字稿.json',{type:'application/json'}):$('#translate-file').files[0];if(!file)throw Error('请选择逐字稿。');if(file.size>30*1048576)throw Error('逐字稿文件过大。');validateTranscript(JSON.parse(await file.text()));
    const body=new FormData();body.append('transcript',file);if(!readings){body.append('translation_engine',$('#translation-engine').value);body.append('glossary',$('#translation-glossary').value);body.append('overwrite',String($('#translation-overwrite').checked));}const response=await fetch(new URL(readings?'api/readings':'api/translate',BASE),{method:'POST',body}),job=await response.json();if(!response.ok)throw Error(job.detail||'任务未能启动');if(alive())await poll(job.id);
  }catch(error){if(alive()){report(error);button.disabled=false;}}});
}
function podcastImport(){
  openModal('导入播客','<label for="podcast-url">播客 RSS 或直接音频链接</label><input id="podcast-url" type="url" placeholder="https://…"><button class="primary full section-title" id="load-podcast">读取单集</button><div id="podcast-results"></div>');
  const serial=modalSerial;
  on('#load-podcast','click',async()=>{
    const b=$('#load-podcast');b.disabled=true;
    try{
      const url=$('#podcast-url').value.trim(),r=await fetch(new URL(`api/podcast?url=${encodeURIComponent(url)}`,BASE)),data=await r.json();
      if(modalSerial!==serial)return;
      if(!r.ok)throw Error(data.detail||'读取失败');if(!data.episodes.length)throw Error('没有找到可导入的音频。');
      $('#podcast-results').innerHTML=`<div class="stack section-title">${data.episodes.map((e,i)=>`<button class="secondary" data-podcast="${i}">${esc(e.title)}</button>`).join('')}</div><label for="podcast-lang">音频语言</label><select id="podcast-lang">${Object.entries(LANG).map(([c,n])=>`<option value="${c}">${n}</option>`).join('')}</select>`;
      document.querySelectorAll('[data-podcast]').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        const language=$('#podcast-lang').value;
        try{
          const item=data.episodes[Number(button.dataset.podcast)],r=await fetch(new URL(`api/audio-fetch?url=${encodeURIComponent(item.url)}`,BASE));
          if(!r.ok)throw Error((await r.json()).detail||'无法导入音频');
          const blob=await r.blob();if(modalSerial!==serial)return;
          const ext=({'audio/wav':'.wav','audio/x-wav':'.wav','audio/mp4':'.m4a','audio/flac':'.flac','audio/ogg':'.ogg'})[blob.type]||'.mp3';
          const filename=item.title.slice(0,180).replace(/[\\/:*?"<>|]/g,'_')+ext;
          const staged={title:item.title,filename,audio:blob,language};
          openModal('播客音频已准备',`<p class="note">${esc(item.title)}</p><p class="note">先保存原音频，再生成逐字稿。将两个文件一起传到手机即可。</p><div class="stack"><button class="secondary full" id="save-podcast-audio">保存原音频文件</button><button class="primary full" id="transcribe-podcast">生成逐字稿与时间轴</button></div>`);
          on('#save-podcast-audio','click',()=>download(blob,filename));
          on('#transcribe-podcast','click',()=>computerTranscription(staged));
        }catch(e){if(modalSerial===serial){report(e);button.disabled=false;}}
      });
    }catch(e){if(modalSerial===serial)report(e);}if(modalSerial===serial)b.disabled=false;
  });
}
async function navigate(target,{replaceRoute=false}={}){rememberLibrary();delete main.dataset.libraryPositionKey;resetClip();if(immersive)toggleImmersive();$('.player-dock')?.remove();view=target;setAppRoute(target,replaceRoute);if(target==='library')await renderLibrary();if(target==='cards')await renderCards();if(target==='settings')await renderSettings();miniPlayer();if(target!=='library')main.scrollTo(0,0);}
document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav).catch(report));
window.addEventListener('hashchange',()=>{const route=appRoute(location.hash);if(route.view==='player'){if(episode?.id!==route.id||view!=='player')openEpisode(route.id,undefined,{replaceRoute:true}).catch(report);}else if(view!==route.view)navigate(route.view,{replaceRoute:true}).catch(report);else{setAppRoute(route.hash,true);setNav();}});
const installedApp=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
bindHomeEdgeGuard(main,()=>installedApp()&&view==='library'&&!libraryFolder&&!immersive&&!modal.open);
window.addEventListener('pageshow',event=>{if(event.persisted){setNav();applyPrefs();window.scrollTo(0,0);}});
document.addEventListener('keydown',e=>{if(e.defaultPrevented||modal.open||document.activeElement?.closest('button,[role=button],a')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.code==='Space'&&episode){e.preventDefault();togglePlay();}if(e.key==='ArrowRight'&&episode)jump(Math.min(episode.segments.length-1,current+1),true);if(e.key==='ArrowLeft'&&episode)jump(Math.max(0,current-1),true);if(e.key==='Escape'&&immersive)toggleImmersive();if(e.key.toLowerCase()==='r'&&episode)jump(Math.max(0,current),true);});
applyPrefs();matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyPrefs);
try{if(['localhost','127.0.0.1'].includes(location.hostname)){const r=await fetch(new URL('api/status',BASE));if(r.ok){const status=await r.json();backend=status.available===true;backendVersion=status.version||1;}}}catch{}
if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register(new URL('sw.js',BASE),{scope:BASE.pathname}).catch(console.error);
if('mediaSession'in navigator){for(const [name,handler] of [['play',()=>togglePlay()],['pause',()=>{cancelPractice();audio.pause();}],['seekto',d=>{if(Number.isFinite(d.seekTime)&&episode&&audioFile(episode)){resetClip();current=-1;audio.currentTime=Math.min(episode?.duration||0,Math.max(0,d.seekTime));if(repetitionActive()&&!audio.paused&&episode.segments?.length)practice.start(Math.max(0,segmentAt(audio.currentTime)));updatePlayback();}}],['previoustrack',()=>episode&&switchEpisode(-1).catch(report)],['nexttrack',()=>episode&&switchEpisode(1).catch(report)]])try{navigator.mediaSession.setActionHandler(name,handler);}catch{}}
try{const context=document.modelContext;if(context?.registerTool){context.registerTool({name:'list_saved_audio',description:'List audio saved on the current device without returning audio bytes.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async input=>{if(Object.keys(input||{}).length)throw Error('No input properties accepted');return (await all('episodes')).map(e=>({id:e.id,title:e.title,language:e.language,duration:e.duration,progress:e.progress,hasTranscript:!!e.segments?.length}));}});context.registerTool({name:'seek_current_audio',description:'Seek the current audio without starting playback.',inputSchema:{type:'object',properties:{seconds:{type:'number',minimum:0}},required:['seconds'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{if(!episode||!audioFile(episode)||!Number.isFinite(input?.seconds)||input.seconds<0||input.seconds>episode.duration||Object.keys(input).some(k=>k!=='seconds'))throw Error('A connected audio and an in-range seconds value are required');resetClip();current=-1;audio.currentTime=input.seconds;if(repetitionActive()&&!audio.paused&&episode.segments?.length)practice.start(Math.max(0,segmentAt(audio.currentTime)));updatePlayback();await saveProgress();return{episodeId:episode.id,seconds:audio.currentTime};}});}}catch(e){console.warn('Optional browser integration unavailable',e);}
async function retirePhoneSpeech(){
 const key='retired-phone-speech-v1';if((await read('settings',key))?.value)return;
 await clearModelDownloads('tingye-local-japanese-speech-v1');await write('settings',{id:key,value:true});
}
retirePhoneSpeech().catch(error=>console.warn('旧转写模型尚未清理',error));
async function retireBrowserTranslation(){
 const key='retired-browser-translation-v1';if((await read('settings',key))?.value)return;
 await clearBrowserTranslation();await write('settings',{id:key,value:true});
}
retireBrowserTranslation().catch(error=>console.warn('旧翻译模型尚未清理',error));
const initial=appRoute(location.hash);if(initial.view==='player')await openEpisode(initial.id,undefined,{replaceRoute:true}).catch(()=>navigate('library',{replaceRoute:true}));else await navigate(initial.view,{replaceRoute:true});
