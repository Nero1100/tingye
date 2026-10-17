import {PODCASTS,feedURL,mediaURL,fetchPodcastText,parsePodcastFeed} from './podcasts.js?v=2026.10.17.4';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const languageNames={ja:'日语',en:'英语',fr:'法语'};
const channelText=(channel,name)=>([...channel.children].find(el=>el.localName===name)?.textContent||'').trim();
export async function inspectPodcastLink(value,{fetcher=fetch,signal,shows=PODCASTS}={}){
 let address=feedURL(String(value).trim()),apple=null;
 if(!address)throw Error('请粘贴 HTTPS 的 Apple Podcasts 节目链接或 RSS 地址。');
 const url=new URL(address);
 if(url.hostname==='podcasts.apple.com'){
  const id=url.pathname.match(/\/id(\d+)(?:\/|$)/)?.[1];if(!id)throw Error('请从 Apple Podcasts 的节目主页复制分享链接。');
  const text=await fetchPodcastText('https://itunes.apple.com/lookup?id='+id+'&entity=podcast',{fetcher,signal});
  let data;try{data=JSON.parse(text);}catch{throw Error('暂时无法读取 Apple Podcasts 的节目资料。');}
  apple=data.results?.find(item=>item.kind==='podcast'&&feedURL(item.feedUrl));
  if(!apple)throw Error('这个节目没有提供可用的公开 RSS 订阅源。');
  address=feedURL(apple.feedUrl);
 }
 const xml=await fetchPodcastText(address,{fetcher,signal});
 if(/<!DOCTYPE/i.test(xml))throw Error('RSS 格式不支持。');
 const doc=new DOMParser().parseFromString(xml,'application/xml'),channel=doc.querySelector('rss > channel');
 if(doc.querySelector('parsererror')||!channel)throw Error('这个地址不是 RSS。请使用 Apple Podcasts 节目分享链接或 RSS 订阅源。');
 const name=(channelText(channel,'title')||apple?.collectionName||'').slice(0,200);
 if(!name)throw Error('RSS 中没有节目名称，暂时无法添加。');
 const image=[...channel.children].filter(el=>el.localName==='image'),cover=mediaURL(image.find(el=>el.hasAttribute('href'))?.getAttribute('href')||image.find(el=>el.querySelector('url'))?.querySelector('url')?.textContent?.trim()||apple?.artworkUrl600||'');
 const code=channelText(channel,'language').toLowerCase().split(/[-_]/)[0],language=Object.hasOwn(languageNames,code)?code:'ja';
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(address));
 const existing=shows.find(show=>feedURL(show.feed)===address);
 const show=existing||{id:'rss-'+[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,32),name,author:(channelText(channel,'author')||apple?.artistName||'').slice(0,200),feed:address,cover,language};
 const cache=await parsePodcastFeed(xml,show.id,{shows:existing?shows:[...shows,show]});
 return {show,cache,xml,existing:!!existing};
}
export function showAddPodcast(ctx){
 ctx.open('添加播客',`<p class="note">粘贴 Apple Podcasts 的节目分享链接，或 RSS 订阅源。</p><label for="podcast-link">节目链接 / RSS</label><input id="podcast-link" type="url" maxlength="2000" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…"><button class="secondary full section-title" id="read-podcast-link">读取节目</button><p id="podcast-add-status" class="note" role="status"></p><div id="podcast-add-preview"></div><details class="podcast-link-help"><summary>链接从哪里找？</summary><p class="note">Apple「播客」App：打开节目主页，点「⋯ → 共享 → 复制链接」。RSS 通常在节目官网的「RSS / Subscribe」入口。</p></details><p class="note">只添加节目列表，音频仍按需播放或下载。</p>`);
 const current=ctx.current(),input=ctx.modal.querySelector('#podcast-link'),readButton=ctx.modal.querySelector('#read-podcast-link'),status=ctx.modal.querySelector('#podcast-add-status'),preview=ctx.modal.querySelector('#podcast-add-preview');
 let pending=null,request=null,serial=0,busy=false;
 ctx.modal.addEventListener('close',()=>request?.abort(),{once:true});
 input.addEventListener('input',()=>{serial++;request?.abort();pending=null;preview.innerHTML='';status.textContent='';readButton.disabled=false;busy=false;});
 async function read(){
  if(busy)return;const attempt=++serial;request?.abort();request=new AbortController();const controller=request;
  busy=true;readButton.disabled=true;preview.innerHTML='';status.classList.remove('error');status.textContent='正在读取节目资料…';
  const timer=setTimeout(()=>controller.abort(),25000);
  try{
   const result=await inspectPodcastLink(input.value,{signal:controller.signal});if(!current()||attempt!==serial)return;pending=result;
   const show=result.show,subscribed=(await ctx.subscriptions()).includes(show.id);if(!current()||attempt!==serial)return;
   status.textContent='已找到 '+result.cache.episodes.length+' 集';
   preview.innerHTML=`<section class="podcast-add-preview"><div class="podcast-add-heading">${show.cover?`<img src="${esc(show.cover)}" alt="节目封面" referrerpolicy="no-referrer" loading="lazy">`:'<span aria-hidden="true">♫</span>'}<div><strong>${esc(show.name)}</strong><small>${esc(show.author)}</small></div></div>${result.existing?'':`<label for="added-podcast-language">音频语言</label><select id="added-podcast-language">${Object.entries(languageNames).map(([code,name])=>`<option value="${code}" ${code===show.language?'selected':''}>${name}</option>`).join('')}</select>`}<button class="primary full" id="confirm-podcast-add">${subscribed?'已添加 · 打开节目':'添加并订阅'}</button></section>`;
   preview.querySelector('#confirm-podcast-add').onclick=async event=>{
    event.target.disabled=true;readButton.disabled=true;input.disabled=true;status.textContent='正在保存节目…';
    try{
     const candidate={...pending,show:{...pending.show,language:preview.querySelector('#added-podcast-language')?.value||pending.show.language||'ja'}};
     const id=await ctx.save(candidate);if(!current())return;ctx.close();await ctx.openShow(id);ctx.toast(subscribed?'已打开节目':'播客已添加');
    }catch(error){if(current()){status.textContent=error.message;status.classList.add('error');event.target.disabled=false;readButton.disabled=false;input.disabled=false;}}
   };
  }catch(error){if(current()&&attempt===serial){pending=null;status.classList.add('error');status.textContent=error.name==='AbortError'?'读取超时，请稍后重试。':error instanceof TypeError?'无法读取节目源，请检查网络；部分 RSS 不允许网页直接读取。':error.message;}}
  finally{clearTimeout(timer);if(current()&&attempt===serial){busy=false;readButton.disabled=false;}}
 }
 readButton.onclick=read;input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();read();}});
}
