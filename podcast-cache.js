// Shared with the classic service worker. Opaque audio stays opaque to JavaScript.
(()=>{
 const NAME='tingye-podcast-audio-v1',validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
 function url(id,base){if(!validId(id))throw Error('播客单集编号不正确。');return new URL('offline-media/'+id,base).href;}
 function idFromURL(value,base){const parsed=new URL(value),scope=new URL(base),prefix=scope.pathname+'offline-media/';if(parsed.origin!==scope.origin||!parsed.pathname.startsWith(prefix))return null;const id=parsed.pathname.slice(prefix.length);return validId(id)?id:null;}
 function byteRange(value,size){
  const match=/^bytes=(\d*)-(\d*)$/.exec(value||'');if(!match||!size||!match[1]&&!match[2])return null;
  const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]?match[2]?Math.min(size-1,Number(match[2])):size-1:size-1;
  return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<size&&end>=start?{start,end}:null;
 }
 async function response(request,base,cache){
  const id=idFromURL(request.url,base);if(!id)return new Response('',{status:404});
  const saved=await cache.match(url(id,base));if(!saved)return new Response('下载不存在，请联网后重新下载。',{status:404});
  // A full opaque response may only be passed to a no-cors media request.
  if(saved.type==='opaque')return request.mode==='no-cors'?saved:new Response('',{status:400});
  const header=request.headers.get('Range');if(!header)return saved;
  const blob=await saved.blob(),range=byteRange(header,blob.size);
  if(!range)return new Response('',{status:416,headers:{'Content-Range':'bytes */'+blob.size}});
  return new Response(blob.slice(range.start,range.end+1),{status:206,headers:{'Content-Type':blob.type||'audio/mpeg','Content-Length':String(range.end-range.start+1),'Content-Range':`bytes ${range.start}-${range.end}/${blob.size}`,'Accept-Ranges':'bytes'}});
 }
 globalThis.TingyePodcastCache=Object.freeze({NAME,url,idFromURL,byteRange,response});
})();
