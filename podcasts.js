// RSS metadata stays local. Audio streams unless the user downloads a single episode.
export const BUILTIN_PODCASTS=Object.freeze([
 {id:'shun',name:'Japanese with Shun',author:'Shun',feed:'https://feeds.redcircle.com/e8ab057c-683d-4375-a197-2dcc42d4f851',cover:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/8a/8e/3e/8a8e3e9f-6810-1658-a4aa-a16bcef05960/mza_7363683509923378665.jpg/600x600bb.jpg'},
 {id:'noriko',name:'Learn Japanese with Noriko',author:'Noriko',feed:'https://anchor.fm/s/1380f800/podcast/rss',cover:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts124/v4/f3/8b/3f/f38b3fa6-249f-6f29-89b9-4bf767736265/mza_16587768291611260861.jpg/600x600bb.jpg'},
 {id:'akane',name:'日本語の聴解のためのPodcast',author:'あかね的日本語教室',feed:'https://anchor.fm/s/1fe5323c/podcast/rss',cover:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/61/92/ae/6192ae10-3404-18e1-32cb-2eee25d8aaa5/mza_17247882827833302494.jpg/600x600bb.jpg',language:'ja'},
 {id:'rss-b694eeea6fc0ee311794408e031afdec',name:'Quebec French Podcast',author:'Intermediate French Lessons from Montreal',feed:'https://api.substack.com/feed/podcast/1605429.rss',browserFeed:'./feeds/quebec-french.xml',cover:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/7a/a0/80/7aa080a5-aae5-2230-6ba3-77091de95513/mza_6408642013420380159.jpg/600x600bb.jpg',language:'fr'}
]);
// Keep this array stable so the player, covers and downloader share one catalog.
export const PODCASTS=[...BUILTIN_PODCASTS];
export const CUSTOM_SHOWS='podcast-shows-v1';
export const podcastShow=(id,shows=PODCASTS)=>shows.find(show=>show.id===id);
export const podcastScope=(id,shows=PODCASTS)=>podcastShow(id,shows)?'podcast/'+id:'';
export const isPodcastScope=(scope,shows=PODCASTS)=>shows.some(show=>'podcast/'+show.id===scope);
export const podcastCacheKey=id=>'podcast-feed/'+id;
export const SUBSCRIPTIONS='podcast-subscriptions-v1';
export function podcastSubscriptions(value,shows=PODCASTS){return Array.isArray(value)?[...new Set(value.filter(id=>!!podcastShow(id,shows)))]:[];}
export function mediaURL(value){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&url.hostname!=='localhost'&&!url.hostname.endsWith('.local')?url.href:'';}catch{return '';}
}
export function feedURL(value){const address=mediaURL(value);if(!address)return '';const url=new URL(address);if(/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)||url.hostname.includes(':')||url.hostname.endsWith('.localhost'))return '';url.hash='';return url.href;}
export function validateCustomPodcasts(value=[]){
 if(!Array.isArray(value)||value.length>100)throw Error('最多添加 100 个播客节目。');
 const ids=new Set(),feeds=new Set();
 for(const show of value){
  if(!show||!/^rss-[a-f0-9]{32}$/.test(show.id)||ids.has(show.id)||typeof show.name!=='string'||!show.name.trim()||show.name.length>200||typeof show.author!=='string'||show.author.length>200||typeof show.feed!=='string'||show.feed.length>2000||!feedURL(show.feed)||feeds.has(feedURL(show.feed))||typeof show.cover!=='string'||show.cover.length>2000||show.cover&&!mediaURL(show.cover)||!['ja','en','fr'].includes(show.language))throw Error('播客节目资料不正确。');
  const builtin=BUILTIN_PODCASTS.find(item=>feedURL(item.feed)===feedURL(show.feed));
  if(builtin&&builtin.id!==show.id)throw Error('播客节目资料冲突，现有节目保留。');
  ids.add(show.id);feeds.add(feedURL(show.feed));
 }
 return value;
}
export function mergeCustomPodcasts(existing,incoming){
 validateCustomPodcasts(existing);validateCustomPodcasts(incoming);
 const merged=[...existing];
 for(const show of incoming){const byId=merged.find(saved=>saved.id===show.id),byFeed=merged.find(saved=>feedURL(saved.feed)===feedURL(show.feed));
  if(byId&&feedURL(byId.feed)!==feedURL(show.feed)||byFeed&&byFeed.id!==show.id)throw Error('播客节目资料冲突，现有节目保留。');
  if(!byId)merged.push(show);
 }
 return validateCustomPodcasts(merged);
}
const customOnly=shows=>shows.filter(show=>!BUILTIN_PODCASTS.some(item=>item.id===show.id));
export function podcastCatalog(incoming=[]){return [...BUILTIN_PODCASTS,...customOnly(mergeCustomPodcasts(customOnly(PODCASTS.filter(show=>show.id.startsWith('rss-'))),incoming))];}
export function setCustomPodcasts(value){const shows=customOnly(validateCustomPodcasts(value));PODCASTS.splice(0,PODCASTS.length,...BUILTIN_PODCASTS,...shows);return shows;}
export function streamURL(episode,shows=PODCASTS){return episode?.storageMode==='stream'&&podcastShow(episode.podcast?.showId,shows)?mediaURL(episode.podcast.url):'';}
export function podcastDuration(value){
 const parts=String(value||'').trim().split(':');if(parts.length>3||parts.some(p=>!/^\d+(\.\d+)?$/.test(p)))return 0;
 const seconds=parts.reduce((total,p)=>total*60+Number(p),0);return Number.isFinite(seconds)&&seconds<=86400?seconds:0;
}
export async function podcastEpisodeId(showId,guid,shows=PODCASTS){
 if(!podcastShow(showId,shows)||typeof guid!=='string'||!guid||guid.length>2000)throw Error('播客单集资料不完整。');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(podcastShow(showId,shows).feed+'\n'+guid));
 return 'podcast-'+showId+'-'+[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,32);
}
export function plainDescription(value){
 const document=new DOMParser().parseFromString(String(value||'').slice(0,20000),'text/html');
 document.querySelectorAll('script,style').forEach(el=>el.remove());
 document.querySelectorAll('br,p,div,li').forEach(el=>el.append(document.createTextNode('\n')));
 return (document.body.textContent||'').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim().slice(0,2500);
}
export async function parsePodcastFeed(xml,showId,{shows=PODCASTS}={}){
 if(!podcastShow(showId,shows)||typeof xml!=='string'||xml.length>8*1048576||/<!DOCTYPE/i.test(xml))throw Error('节目列表格式不正确。');
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.querySelector('parsererror')||!doc.querySelector('rss > channel'))throw Error('暂时无法读取这个节目的列表。');
 const text=(node,name)=>([...node.children].find(el=>el.localName===name)?.textContent||'').trim();
 const seen=new Set(),episodes=[];
 for(const item of [...doc.querySelectorAll('channel > item')].slice(0,2000)){
  const enclosure=[...item.children].find(el=>el.localName==='enclosure'),url=mediaURL(enclosure?.getAttribute('url')),guid=text(item,'guid')||url;
  if(!url||!guid||guid.length>2000||seen.has(guid))continue;seen.add(guid);
  const published=Date.parse(text(item,'pubDate'));
  episodes.push({id:await podcastEpisodeId(showId,guid,shows),guid,url,title:(text(item,'title')||'未命名单集').slice(0,500),
   description:plainDescription(text(item,'description')||text(item,'summary')),published:Number.isFinite(published)?published:0,
   duration:podcastDuration(text(item,'duration')),bytes:Math.max(0,Number(enclosure.getAttribute('length'))||0),mime:(enclosure.getAttribute('type')||'audio/mpeg').slice(0,100)});
 }
 if(!episodes.length)throw Error('这个节目暂时没有可播放的单集。');
 return {format:'tingye-podcast-feed-v1',showId,updated:Date.now(),episodes:episodes.sort((a,b)=>b.published-a.published)};
}
export function validPodcastCache(value,showId){
 return value?.format==='tingye-podcast-feed-v1'&&value.showId===showId&&podcastShow(showId)&&Number.isFinite(value.updated)&&
  Array.isArray(value.episodes)&&value.episodes.length<=2000&&value.episodes.every(e=>e&&typeof e.id==='string'&&e.id.length<=100&&
   typeof e.guid==='string'&&!!e.guid&&e.guid.length<=2000&&!!mediaURL(e.url)&&typeof e.title==='string'&&e.title.length<=500&&
   typeof e.description==='string'&&e.description.length<=2500&&Number.isFinite(e.published)&&Number.isFinite(e.duration)&&e.duration>=0&&e.duration<=86400&&(e.bytes===undefined||Number.isFinite(e.bytes)&&e.bytes>=0)&&typeof e.mime==='string'&&e.mime.length<=100);
}
export async function fetchPodcastText(address,{fetcher=fetch,signal}={}){
 if(!feedURL(address))throw Error('请使用 HTTPS 的节目链接或 RSS 地址。');
 // Some publishers omit CORS headers. Only explicitly curated public feeds use our metadata mirror.
 const curated=BUILTIN_PODCASTS.find(show=>feedURL(show.feed)===feedURL(address));
 const target=curated?.browserFeed?new URL(curated.browserFeed,import.meta.url).href:address;
 const response=await fetcher(target,{credentials:'omit',cache:'no-cache',signal});
 if(!response.ok)throw Error('节目列表暂时无法连接，请稍后刷新。');
 if(Number(response.headers.get('Content-Length'))>8*1048576)throw Error('节目列表过大，请稍后重试。');
 let xml='';
 if(response.body?.getReader){const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8*1048576)throw Error('节目列表过大，请稍后重试。');xml+=decoder.decode(value,{stream:true});}xml+=decoder.decode();}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
 }else xml=await response.text();
 return xml;
}
export async function fetchPodcastFeed(showId,{fetcher=fetch,signal,shows=PODCASTS}={}){
 const show=podcastShow(showId,shows);if(!show)throw Error('请选择一个节目。');
 const xml=await fetchPodcastText(show.feed,{fetcher,signal});
 return parsePodcastFeed(xml,showId,{shows});
}
export function podcastRecord(showId,item,{id=item.id,order=0,created=Date.now()}={}){
 const show=podcastShow(showId);if(!show||!mediaURL(item.url))throw Error('这集暂时无法播放。');
 return {id,title:item.title,filename:item.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,480)+'.mp3',language:show.language||'ja',
  order,created,duration:item.duration,progress:0,segments:[],bookmarks:[],collectionId:'',folder:show.name,
  storageMode:'stream',audio:null,audioBytes:0,mime:item.mime,podcast:{showId,guid:item.guid,url:item.url,bytes:item.bytes||0,published:item.published,description:item.description}};
}
export function podcastItems(cache,{query='',sort='newest'}={}){
 const needle=query.trim().toLocaleLowerCase();return [...(cache?.episodes||[])].filter(e=>!needle||e.title.toLocaleLowerCase().includes(needle)||e.description.toLocaleLowerCase().includes(needle))
  .sort((a,b)=>sort==='oldest'?a.published-b.published:b.published-a.published);
}
