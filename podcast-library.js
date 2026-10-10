import {PODCASTS,podcastShow,podcastItems,podcastCacheKey,SUBSCRIPTIONS,podcastSubscriptions,validPodcastCache,fetchPodcastFeed} from './podcasts.js?v=2026.10.10.2';
import {downloadLabel} from './podcast-download-ui.js?v=2026.10.10.2';
import {heartIcon} from './favorites.js?v=2026.10.10.2';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Date(value).toLocaleDateString('zh-CN',{year:'numeric',month:'numeric',day:'numeric'}):'';
const duration=seconds=>seconds?Math.ceil(seconds/60)+' 分钟':'播客';
export const audioTabs=mode=>`<div class="audio-tabs" role="group" aria-label="音频来源">${[['local','我的音频'],['podcasts','播客'],['favorites','喜欢']].map(([id,label])=>`<button data-audio-tab="${id}" class="${mode===id?'selected':''}" aria-pressed="${mode===id}">${label}</button>`).join('')}</div>`;
export class PodcastLibrary{
 constructor({main,read,write,remove,coverHTML=()=>'<span aria-hidden="true">♫</span>',collection,openShow,back,play,enqueue,isActive,positions,report,toast,isFavorite=()=>false,favorite,downloadInfo=()=>null,download,cancelDownload,fetchFeed=fetchPodcastFeed,online=()=>navigator.onLine!==false}){
  Object.assign(this,{main,read,write,remove,coverHTML,collection,openShow,back,play,enqueue,isActive,positions,report,toast,isFavorite,favorite,downloadInfo,download,cancelDownload,fetchFeed,online});
  this.caches=new Map();this.inflight=new Map();this.errors=new Map();this.queries=new Map();this.sorts=new Map();this.limits=new Map();this.showId='';this.renderSerial=0;
 }
 async load(){this.subscriptions=podcastSubscriptions((await this.read('settings',SUBSCRIPTIONS))?.value);
  for(const show of PODCASTS)if(!this.caches.has(show.id)){const value=(await this.read('settings',podcastCacheKey(show.id)))?.value;if(validPodcastCache(value,show.id))this.caches.set(show.id,value);}
 }
 async render(showId=''){
  const serial=++this.renderSerial;this.showId=podcastShow(showId)?showId:'';await this.load();const records=await this.collection();
  if(serial!==this.renderSerial||!this.isActive(this.showId))return;
  this.records=records;const show=podcastShow(this.showId),cache=this.caches.get(this.showId);
  if(show){
   this.main.innerHTML=`<div class="folder-nav"><button id="podcast-back" aria-label="返回播客">‹</button><button id="podcast-subscribe" class="podcast-subscribe ${this.subscriptions.includes(show.id)?'subscribed':''}">${this.subscriptions.includes(show.id)?'已订阅':'订阅'}</button></div><header class="podcast-heading">${this.coverHTML(show.id,{alt:show.name+'封面'})}<div><h1>${esc(show.name)}</h1><small>日语 · ${esc(show.author)}</small></div></header><div class="podcast-refresh-row"><span id="podcast-refresh-status" role="status"></span><button id="podcast-refresh">↻ 刷新</button></div><div class="podcast-tools"><input id="podcast-search" type="search" placeholder="搜索单集" aria-label="搜索单集" value="${esc(this.queries.get(show.id)||'')}"><select id="podcast-sort" aria-label="播客排序"><option value="newest">最新在前</option><option value="oldest">最早在前</option></select></div><p class="podcast-list-count" id="podcast-list-count"></p><div class="podcast-episodes" id="podcast-episodes"></div><p class="podcast-storage-note">在线播放 · 不自动保存音频副本</p>`;
   this.main.querySelector('#podcast-sort').value=this.sorts.get(show.id)||'newest';
   this.main.querySelector('#podcast-back').onclick=this.back;
   this.main.querySelector('#podcast-subscribe').onclick=()=>this.subscription(show.id,!this.subscriptions.includes(show.id)).catch(this.report);
   this.main.querySelector('#podcast-refresh').onclick=()=>this.refresh(show.id,true);
   this.main.querySelector('#podcast-search').oninput=event=>{this.queries.set(show.id,event.target.value);this.limits.set(show.id,50);this.rows();};
   this.main.querySelector('#podcast-sort').onchange=event=>{this.sorts.set(show.id,event.target.value);this.limits.set(show.id,50);this.rows();};
   this.rows();this.status();
  }else{
   this.main.innerHTML=`${audioTabs('podcasts')}<section class="podcast-intro"><small>随时听，慢慢学。</small><h1>日语播客</h1><p>订阅喜欢的声音，新单集随时查看。</p></section><div class="podcast-shows">${[...PODCASTS].sort((a,b)=>Number(this.subscriptions.includes(b.id))-Number(this.subscriptions.includes(a.id))).map(program=>{const saved=this.caches.get(program.id),subscribed=this.subscriptions.includes(program.id);return `<article class="podcast-show"><button class="podcast-show-open" data-podcast-show="${program.id}">${this.coverHTML(program.id)}<span><strong>${esc(program.name)}</strong><small>${subscribed?'已订阅 · ':''}${saved?saved.episodes.length+' 集':'日语'}</small>${saved?`<span class="podcast-latest">${esc(saved.episodes[0]?.title)}</span>`:''}</span><span class="episode-chevron">›</span></button>${subscribed?'':`<button class="secondary podcast-follow" data-podcast-follow="${program.id}">＋ 订阅</button>`}</article>`;}).join('')}</div><p class="podcast-storage-note">默认在线播放，点单集旁的“下载”保存离线音频。离线时可听已下载的播客和本地音频。</p>`;
   this.main.querySelectorAll('[data-podcast-show]').forEach(b=>b.onclick=()=>this.openShow(b.dataset.podcastShow));
   this.main.querySelectorAll('[data-podcast-follow]').forEach(b=>b.onclick=()=>{b.disabled=true;this.subscription(b.dataset.podcastFollow,true,{open:true}).catch(this.report);});
  }
  this.main.dataset.libraryPositionKey='podcasts/'+this.showId;this.positions.restore(this.main,this.main.dataset.libraryPositionKey);
  if(show&&this.subscriptions.includes(show.id)&&(!cache||cache.episodes.some(e=>e.bytes===undefined)||Date.now()-cache.updated>30*60*1000))this.refresh(show.id);
 }
 rows(){
  const showId=this.showId,container=this.main.querySelector('#podcast-episodes');if(!container||!this.isActive(showId))return;
  const cache=this.caches.get(showId),items=podcastItems(cache,{query:this.queries.get(showId),sort:this.sorts.get(showId)}),limit=this.limits.get(showId)||50;
  const played=new Map((this.records||[]).filter(e=>e.podcast?.showId===showId).map(e=>[e.podcast.guid,e]));
  this.main.querySelector('#podcast-list-count').textContent=cache?`${items.length} 集${this.queries.get(showId)?'匹配搜索':''}`:'';
  container.innerHTML=items.length?items.slice(0,limit).map(item=>{const record=played.get(item.guid);return `<div class="podcast-episode"><button class="podcast-episode-open" data-podcast-play="${item.id}" data-episode="${item.id}" aria-label="播放 ${esc(item.title)}"><span class="podcast-episode-title">${esc(item.title)}</span><small>${date(item.published)} · ${duration(record?.duration||item.duration)}${record?.progress>0?' · 已听 '+Math.floor(record.progress/60)+':'+String(Math.floor(record.progress)%60).padStart(2,'0'):''}</small><span class="podcast-description">${esc(item.description.replace(/\s+/g,' '))}</span>${record?.progress>0?`<span class="progress-line"><span style="width:${Math.min(100,record.progress/Math.max(record.duration,1)*100)}%"></span></span>`:''}</button><div class="podcast-episode-actions"><button class="episode-like ${this.isFavorite(record?.id||item.id)?'liked':''}" data-podcast-favorite="${item.id}" aria-label="${this.isFavorite(record?.id||item.id)?'取消喜欢':'喜欢'} ${esc(item.title)}" aria-pressed="${this.isFavorite(record?.id||item.id)}">${heartIcon}</button><button class="podcast-queue-add" data-podcast-queue="${item.id}" aria-label="加入播放列表 ${esc(item.title)}">＋</button><button class="podcast-download" data-podcast-download="${item.id}" data-download-id="${record?.id||item.id}" data-download-title="${esc(item.title)}" aria-label="${downloadLabel(this.downloadInfo(record?.id||item.id))} ${esc(item.title)}">${downloadLabel(this.downloadInfo(record?.id||item.id))}</button></div></div>`;}).join('')+(items.length>limit?'<button class="secondary podcast-more" id="podcast-more">显示更多单集</button>':''):`<div class="empty"><p>${cache?'没有匹配的单集':this.subscriptions.includes(showId)?'正在读取节目列表；连接未完成时可点刷新重试。':'点击订阅，即可读取节目单集。'}</p></div>`;
  this.main.querySelectorAll('[data-podcast-play],[data-podcast-queue]').forEach(button=>button.onclick=async()=>{
   const item=cache.episodes.find(e=>e.id===(button.dataset.podcastPlay||button.dataset.podcastQueue));if(!item)return;
   button.disabled=true;try{if(button.dataset.podcastPlay)await this.play(showId,item);else{await this.enqueue(showId,item);this.toast('已加入播放列表');}}
   catch(error){this.report(error);}finally{if(button.isConnected)button.disabled=false;}
  });
  this.main.querySelectorAll('[data-podcast-favorite]').forEach(button=>button.onclick=async()=>{
   const item=cache.episodes.find(e=>e.id===button.dataset.podcastFavorite);if(!item)return;
   const record=played.get(item.guid),liked=!this.isFavorite(record?.id||item.id);button.disabled=true;
   try{await this.favorite(showId,item,liked);button.classList.toggle('liked',liked);button.setAttribute('aria-pressed',String(liked));button.setAttribute('aria-label',(liked?'取消喜欢 ':'喜欢 ')+item.title);}
   catch(error){this.report(error);}finally{if(button.isConnected)button.disabled=false;}
  });
  this.main.querySelectorAll('[data-podcast-download]').forEach(button=>button.onclick=async()=>{
   const item=cache.episodes.find(e=>e.id===button.dataset.podcastDownload);if(!item)return;const id=button.dataset.downloadId,info=this.downloadInfo(id);
   if(info&&['queued','downloading','cancelling'].includes(info.status)){this.cancelDownload(id);return;}if(info?.status==='ready'){this.toast('这一集已经下载，无需重复保存');return;}
   try{await this.download(showId,item);}catch(error){this.report(error);}
  });
  const more=this.main.querySelector('#podcast-more');if(more)more.onclick=()=>{const top=this.main.scrollTop;this.limits.set(showId,limit+50);this.rows();this.main.scrollTop=top;};
 }
 status(){
  if(!this.showId||!this.isActive(this.showId))return;
  const el=this.main.querySelector('#podcast-refresh-status'),button=this.main.querySelector('#podcast-refresh');if(!el)return;
  const cache=this.caches.get(this.showId),busy=this.inflight.has(this.showId);
  el.textContent=busy?'正在更新单集…':this.errors.get(this.showId)||(cache?'上次更新 '+date(cache.updated):'尚未读取节目列表');
  button.disabled=busy||!this.subscriptions.includes(this.showId);
 }
 async subscription(showId,subscribe,{open=false}={}){
  const fresh=podcastSubscriptions((await this.read('settings',SUBSCRIPTIONS))?.value);
  this.subscriptions=subscribe?[...new Set([...fresh,showId])]:fresh.filter(id=>id!==showId);
  await this.write('settings',{id:SUBSCRIPTIONS,value:this.subscriptions});
  if(!subscribe){this.inflight.get(showId)?.controller.abort();await this.remove('settings',podcastCacheKey(showId));this.caches.delete(showId);this.errors.delete(showId);this.toast('已取消订阅，收听进度仍保留');}
  if(open)this.openShow(showId);else if(this.isActive(this.showId)){this.positions.remember(this.main,this.main.dataset.libraryPositionKey);await this.render(this.showId);}
 }
 async refresh(showId,manual=false){
  if(this.inflight.has(showId)||!this.subscriptions.includes(showId))return;
  if(!this.online()){this.errors.set(showId,'当前离线，保留上次的节目列表');this.status();return;}
  const controller=new AbortController(),request={controller};this.inflight.set(showId,request);this.errors.delete(showId);this.status();
  const timer=setTimeout(()=>controller.abort(),25000);
  try{
   const value=await this.fetchFeed(showId,{signal:controller.signal});
   const fresh=podcastSubscriptions((await this.read('settings',SUBSCRIPTIONS))?.value);if(!fresh.includes(showId))return;
   await this.write('settings',{id:podcastCacheKey(showId),value});this.caches.set(showId,value);
   if(this.isActive(showId)){this.positions.remember(this.main,this.main.dataset.libraryPositionKey);this.rows();this.positions.restore(this.main,this.main.dataset.libraryPositionKey);}
   if(manual)this.toast('节目列表已更新');
  }catch(error){if((await this.read('settings',SUBSCRIPTIONS))?.value?.includes(showId))this.errors.set(showId,(this.caches.has(showId)?'刷新未完成，上次列表仍可查看':'连接未完成，请点刷新重试')+(navigator.onLine===false?' · 当前离线':''));}
  finally{clearTimeout(timer);if(this.inflight.get(showId)===request)this.inflight.delete(showId);this.status();}
 }
}
