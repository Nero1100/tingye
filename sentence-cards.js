export const bookmarkKey=b=>b.id?'id:'+encodeURIComponent(b.id):'position:'+encodeURIComponent(JSON.stringify([b.time,b.text]));

export function bookmarkedSentence(episode,bookmark){
  const segments=episode.segments||[];
  const atTime=segments.filter(s=>bookmark.time>=s.start-.01&&bookmark.time<s.end);
  return atTime.find(s=>s.text===bookmark.text)||atTime[0]||null;
}

export function sentenceBookmark(episode,segment){
  return (episode.bookmarks||[]).find(b=>bookmarkedSentence(episode,b)===segment);
}

export function sentenceCards(episodes){
  return episodes.flatMap(episode=>(episode.bookmarks||[]).map(bookmark=>{
    const sentence=bookmarkedSentence(episode,bookmark);
    return {kind:'sentence',id:episode.id+'/'+bookmarkKey(bookmark),bookmarkKey:bookmarkKey(bookmark),
      episodeId:episode.id,language:episode.language,text:sentence?.text||bookmark.text,
      context:sentence?.text||bookmark.text,translation:sentence?.translation||'',words:sentence?.words||[],
      start:sentence?.start??bookmark.time,end:sentence?.end??bookmark.end??bookmark.time,
      playable:!!sentence,note:bookmark.note||'',category:bookmark.category||'',
      due:bookmark.due??0,level:bookmark.level||0};
  }));
}

export function changeSentenceBookmark(bookmarks,key,patch){
  if(!bookmarks.some(b=>bookmarkKey(b)===key))throw Error('这张句卡已被移除，请重新打开句卡。');
  return patch===null?bookmarks.filter(b=>bookmarkKey(b)!==key):bookmarks.map(b=>bookmarkKey(b)===key?{...b,...patch}:b);
}
