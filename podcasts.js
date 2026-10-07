// RSS metadata is kept locally. Audio always goes straight to the media element.
export const PODCASTS=Object.freeze([
 {id:'shun',name:'Japanese with Shun',author:'Shun',feed:'https://feeds.redcircle.com/e8ab057c-683d-4375-a197-2dcc42d4f851',cover:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/8a/8e/3e/8a8e3e9f-6810-1658-a4aa-a16bcef05960/mza_7363683509923378665.jpg/600x600bb.jpg'},
 {id:'noriko',name:'Learn Japanese with Noriko',author:'Noriko',feed:'https://anchor.fm/s/1380f800/podcast/rss',cover:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts124/v4/f3/8b/3f/f38b3fa6-249f-6f29-89b9-4bf767736265/mza_16587768291611260861.jpg/600x600bb.jpg'}
]);
export const podcastShow=id=>PODCASTS.find(show=>show.id===id);
export const podcastScope=id=>podcastShow(id)?'podcast/'+id:'';
export const isPodcastScope=scope=>PODCASTS.some(show=>podcastScope(show.id)===scope);
export const podcastCacheKey=id=>'podcast-feed/'+id;
export const SUBSCRIPTIONS='podcast-subscriptions-v1';
export function podcastSubscriptions(value){return Array.isArray(value)?[...new Set(value.filter(id=>!!podcastShow(id)))]:[];}
export function mediaURL(value){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&url.hostname!=='localhost'&&!url.hostname.endsWith('.local')?url.href:'';}catch{return '';}
}
export function streamURL(episode){return episode?.storageMode==='stream'&&podcastShow(episode.podcast?.showId)?mediaURL(episode.podcast.url):'';}
export function podcastDuration(value){
 const parts=String(value||'').trim().split(':');if(parts.length>3||parts.some(p=>!/^\d+(\.\d+)?$/.test(p)))return 0;
 const seconds=parts.reduce((total,p)=>total*60+Number(p),0);return Number.isFinite(seconds)&&seconds<=86400?seconds:0;
}
export async function podcastEpisodeId(showId,guid){
 if(!podcastShow(showId)||typeof guid!=='string'||!guid||guid.length>2000)throw Error('播客单集资料不完整。');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(podcastShow(showId).feed+'\n'+guid));
 return 'podcast-'+showId+'-'+[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,32);
}
export function plainDescription(value){
 const document=new DOMParser().parseFromString(String(value||'').slice(0,20000),'text/html');
 document.querySelectorAll('script,style').forEach(el=>el.remove());
 document.querySelectorAll('br,p,div,li').forEach(el=>el.append(document.createTextNode('\n')));
 return (document.body.textContent||'').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim().slice(0,2500);
}
export async function parsePodcastFeed(xml,showId){
 if(!podcastShow(showId)||typeof xml!=='string'||xml.length>8*1048576||/<!DOCTYPE/i.test(xml))throw Error('节目列表格式不正确。');
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.querySelector('parsererror')||!doc.querySelector('rss > channel'))throw Error('暂时无法读取这个节目的列表。');
 const text=(node,name)=>([...node.children].find(el=>el.localName===name)?.textContent||'').trim();
 const seen=new Set(),episodes=[];
 for(const item of [...doc.querySelectorAll('channel > item')].slice(0,2000)){
  const enclosure=[...item.children].find(el=>el.localName==='enclosure'),url=mediaURL(enclosure?.getAttribute('url')),guid=text(item,'guid')||url;
  if(!url||!guid||guid.length>2000||seen.has(guid))continue;seen.add(guid);
  const published=Date.parse(text(item,'pubDate'));
  episodes.push({id:await podcastEpisodeId(showId,guid),guid,url,title:(text(item,'title')||'未命名单集').slice(0,500),
   description:plainDescription(text(item,'description')||text(item,'summary')),published:Number.isFinite(published)?published:0,
   duration:podcastDuration(text(item,'duration')),mime:(enclosure.getAttribute('type')||'audio/mpeg').slice(0,100)});
 }
 if(!episodes.length)throw Error('这个节目暂时没有可播放的单集。');
 return {format:'tingye-podcast-feed-v1',showId,updated:Date.now(),episodes:episodes.sort((a,b)=>b.published-a.published)};
}
export function validPodcastCache(value,showId){
 return value?.format==='tingye-podcast-feed-v1'&&value.showId===showId&&podcastShow(showId)&&Number.isFinite(value.updated)&&
  Array.isArray(value.episodes)&&value.episodes.length<=2000&&value.episodes.every(e=>e&&typeof e.id==='string'&&e.id.length<=100&&
   typeof e.guid==='string'&&!!e.guid&&e.guid.length<=2000&&!!mediaURL(e.url)&&typeof e.title==='string'&&e.title.length<=500&&
   typeof e.description==='string'&&e.description.length<=2500&&Number.isFinite(e.published)&&Number.isFinite(e.duration)&&e.duration>=0&&e.duration<=86400&&typeof e.mime==='string'&&e.mime.length<=100);
}
export async function fetchPodcastFeed(showId,{fetcher=fetch,signal}={}){
 const show=podcastShow(showId);if(!show)throw Error('请选择一个节目。');
 const response=await fetcher(show.feed,{credentials:'omit',cache:'no-cache',signal});
 if(!response.ok)throw Error('节目列表暂时无法连接，请稍后刷新。');
 if(Number(response.headers.get('Content-Length'))>8*1048576)throw Error('节目列表过大，请稍后重试。');
 let xml='';
 if(response.body?.getReader){const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8*1048576)throw Error('节目列表过大，请稍后重试。');xml+=decoder.decode(value,{stream:true});}xml+=decoder.decode();}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
 }else xml=await response.text();
 return parsePodcastFeed(xml,showId);
}
export function podcastRecord(showId,item,{id=item.id,order=0,created=Date.now()}={}){
 const show=podcastShow(showId);if(!show||!mediaURL(item.url))throw Error('这集暂时无法播放。');
 return {id,title:item.title,filename:item.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,480)+'.mp3',language:'ja',
  order,created,duration:item.duration,progress:0,segments:[],bookmarks:[],collectionId:'',folder:show.name,
  storageMode:'stream',audio:null,audioBytes:0,mime:item.mime,podcast:{showId,guid:item.guid,url:item.url,published:item.published,description:item.description}};
}
export function podcastItems(cache,{query='',sort='newest'}={}){
 const needle=query.trim().toLocaleLowerCase();return [...(cache?.episodes||[])].filter(e=>!needle||e.title.toLocaleLowerCase().includes(needle)||e.description.toLocaleLowerCase().includes(needle))
  .sort((a,b)=>sort==='oldest'?a.published-b.published:b.published-a.published);
}
