// Context-aware lookup ranges. Transcript words and their timestamps remain unchanged.
const LEARNING_EXPRESSIONS = [
  'ということ','というのは','というと','という',
  'について','によって','にとって','に対して','として',
  'かもしれない','なければならない','ことができる',
  'それでは','それでも','それから','ところが','ところで',
  'そのため','けれども','たとえば'
].sort((a,b)=>b.length-a.length);

function lexicalToken(word) {
  return !!word && /[\p{L}\p{N}]/u.test(word.text || '');
}
function wordSpans(segment) {
  let offset=0;
  return (segment.words||[]).map((word,index)=>{
    const start=offset;offset+=(word.text||'').length;
    return {word,index,start,end:offset};
  });
}
export function learningRanges(segment,language='ja') {
  if(language!=='ja')return [];
  const spans=wordSpans(segment),source=spans.map(s=>s.word.text).join('');
  const phrases=[...LEARNING_EXPRESSIONS,'すると'],ranges=[];
  for(const phrase of phrases) {
    let cursor=0,at;
    while((at=source.indexOf(phrase,cursor))>=0) {
      cursor=at+1;
      const first=spans.find(s=>s.start===at),last=spans.find(s=>s.end===at+phrase.length);
      if(!first||!last||!spans.slice(first.index,last.index+1).every(s=>lexicalToken(s.word)))continue;
      if(phrase==='すると') {
        const before=source.slice(0,at);
        if(!/^[\s「『（(]*$/u.test(before)&&!/[。！？!?\n][\s「『（(]*$/u.test(before))continue;
      }
      ranges.push({first:first.index,last:last.index,text:phrase,automatic:true});
    }
  }
  return ranges.sort((a,b)=>b.text.length-a.text.length||a.first-b.first);
}
export function initialWordSelection(segment,index,language='ja') {
  if(!Number.isInteger(index)||!lexicalToken(segment.words?.[index]))throw Error('无效的词语位置。');
  return learningRanges(segment,language).find(r=>r.first<=index&&r.last>=index)
    ||{first:index,last:index,text:segment.words[index].text,automatic:false};
}
export function selectedWord(segment,range,language='ja') {
  const words=segment.words||[];
  if(!Number.isInteger(range.first)||!Number.isInteger(range.last)||range.first<0||range.last<range.first||range.last>=words.length)throw Error('无效的选词范围。');
  const selected=words.slice(range.first,range.last+1);
  if(!selected.every(lexicalToken)||selected.length>1&&selected.some(w=>/[。！？!?、,;；\n\r]/u.test(w.text)))throw Error('选词范围不能跨过标点。');
  const text=selected.map(w=>w.text).join('').trim();
  if(!text||text.length>512)throw Error('选词范围过长。');
  let reading=selected.length===1?(selected[0].reading||''):'';
  if(language==='ja'&&/[\p{Script=Han}]/u.test(text)) {
    const readings=selected.map(w=>{
      if(w.readingEdited&&Array.isArray(w.rubyParts)) {
        if(w.rubyParts.some(p=>/[\p{Script=Han}]/u.test(p.text)&&!p.reading))return null;
        return w.rubyParts.map(p=>p.reading||p.text).join('');
      }
      if(w.reading)return w.reading;
      return /[\p{Script=Han}]/u.test(w.text)?null:w.text;
    });
    if(readings.every(r=>r!==null))reading=readings.join('').replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
  }
  if(reading.length>512)throw Error('选词范围过长。');
  return {
    text,lemma:selected.length===1?(selected[0].lemma||text):text,reading,
    start:selected[0].start,end:selected[selected.length-1].end,
    first:range.first,last:range.last
  };
}
export function adjustWordSelection(segment,range,side,delta) {
  if(!['first','last'].includes(side)||![1,-1].includes(delta))throw Error('无效的范围调整。');
  const next={...range,[side]:range[side]+delta,automatic:false};
  try {selectedWord(segment,next,'ja');return next;}catch{return range;}
}

export function learningCandidates(segment,language='ja') {
  const words=segment.words||[],ranges=learningRanges(segment,language),result=[];
  for(let index=0;index<words.length;index++) {
    const range=ranges.find(r=>r.first===index);
    if(range) {
      result.push({...selectedWord(segment,range,language),selectable:true});
      index=range.last;
    }else if(lexicalToken(words[index])&&words[index].selectable!==false) {
      result.push({...selectedWord(segment,{first:index,last:index},language),selectable:true});
    }
  }
  return result;
}
