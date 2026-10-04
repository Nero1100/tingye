import {prepareReadings} from './furigana.js';
import {validateTranscript} from './validate.js?v=2026.10.03.21';
export function replacementTranscript(episode,data){
  validateTranscript(data);
  const bytes=episode.audio?.size||episode.audioBytes||0;
  if(data.audio?.bytes&&bytes&&data.audio.bytes!==bytes)throw Error('音频大小与逐字稿记录不同，请选择对应的逐字稿。');
  if(episode.duration&&data.segments.some(s=>s.end>episode.duration+2))throw Error('时间轴超过音频长度，请选择对应的音频。');
  const result={...episode,language:data.language,segments:structuredClone(data.segments),duration:episode.duration||data.duration||0};
  delete result.transcriptUndo;
  return result;
}
function tokens(text,language){
  if(Intl.Segmenter)return [...new Intl.Segmenter(language,{granularity:'word'}).segment(text)].map(p=>({text:p.segment,selectable:p.isWordLike===true}));
  return (text.match(/\s+|[\p{L}\p{N}’']+|[^\p{L}\p{N}\s]/gu)||[]).map(text=>({text,selectable:/[\p{L}\p{N}]/u.test(text)}));
}
export function editedSentence(segment,text,translation,language){
  if(!text.trim())throw Error('原文不能为空。');if(text.length>10000||translation.length>10000)throw Error('单句文字过长，请缩短后再保存。');
  const draft=structuredClone(segment);draft.translation=translation;
  if(text===segment.text&&(segment.words||[]).map(w=>w.text).join('').trim()===text.trim())return draft;
  const old=segment.words||[],next=tokens(text,language);let left=0,right=0;
  while(left<old.length&&left<next.length&&old[left].text===next[left].text)left++;
  while(right<old.length-left&&right<next.length-left&&old[old.length-1-right].text===next[next.length-1-right].text)right++;
  const a=left?old[left-1].end:segment.start,b=right?old[old.length-right].start:segment.end;
  const middle=next.slice(left,next.length-right),length=middle.reduce((n,w)=>n+w.text.length,0)||1;
  let position=0;
  draft.words=next.map((part,i)=>{
    if(i<left)return {...structuredClone(old[i]),text:part.text};
    if(i>=next.length-right)return {...structuredClone(old[old.length-(next.length-i)]),text:part.text};
    const matches=old.filter(w=>w.text===part.text),matching=matches.length===1?matches[0]:null,start=a+(Math.max(a,b)-a)*position/length;position+=part.text.length;
    const end=a+(Math.max(a,b)-a)*position/length;
    return {...(matching?structuredClone(matching):{}),...part,start,end,reading:matching?.reading||'',lemma:matching?.lemma||part.text.trim(),timingEstimated:true};
  });
  draft.text=text;draft.textEdited=true;draft.timingEstimated=true;
  return prepareReadings(draft,language);
}
export function changedCards(cards,episodeId,before,after){
  return cards.filter(c=>c.episodeId===episodeId&&c.context===before.text&&c.start>=before.start-.2&&c.end<=before.end+.3).map(c=>{
    const match=after.words.find(w=>w.text.trim()===c.text&&Math.abs(w.start-c.start)<.15&&Math.abs(w.end-c.end)<.15);
    return match?{...c,reading:match.reading||'',context:after.text}:c;
  });
}
