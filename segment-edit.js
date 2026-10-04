const join=(a,b,language)=>a.trimEnd()+(language==='ja'?'':' ')+b.trimStart();
export function splitChoices(segment){
 if((segment.words||[]).map(w=>w.text).join('').trim()!==segment.text.trim())return [];
 return (segment.words||[]).slice(0,-1).map((w,i)=>({cut:i+1,left:segment.words.slice(0,i+1).map(w=>w.text).join('').trim(),right:segment.words.slice(i+1).map(w=>w.text).join('').trim(),time:(w.end+segment.words[i+1].start)/2})).filter(c=>c.left&&c.right);
}
export function splitSentence(segment,cut,time,translations){
 if(!Number.isInteger(cut)||cut<1||cut>=segment.words.length)throw Error('请选择词语之间的拆分位置。');
 const left=structuredClone(segment),right=structuredClone(segment);
 if(!Number.isFinite(time)||time<=segment.start||time>=segment.end)throw Error('拆分时间应在这一句的开始与结束之间。');
 left.words=left.words.slice(0,cut);right.words=right.words.slice(cut);left.text=left.words.map(w=>w.text).join('').trim();right.text=right.words.map(w=>w.text).join('').trim();
 if(!left.text||!right.text)throw Error('拆分后的两句都需要有文字。');
 left.end=time;right.start=time;
 // A hand-set boundary can correct estimated ASR word times. Keep other words intact.
 for(const w of left.words){if(w.start>time||w.end>time){w.start=Math.min(w.start,time);w.end=Math.min(w.end,time);w.timingEstimated=true;}}
 for(const w of right.words){if(w.start<time||w.end<time){w.start=Math.max(w.start,time);w.end=Math.max(w.end,time);w.timingEstimated=true;}}
 [left,right].forEach((s,i)=>{s.translation=translations[i];s.translationEdited=translations[i]!== (i===0?segment.translation||'':'');s.translationPending=!s.translationEdited;s.boundaryEdited=true;s.editedAt=Date.now();});
 return [left,right];
}
export function mergeSentences(left,right,language){
 if([left,right].some(s=>(s.words||[]).map(w=>w.text).join('').trim()!==s.text.trim()))throw Error('词语与原文不一致，请先按修改后的原文更新词语，再合句。');
 const result=structuredClone(left);result.end=right.end;result.text=join(left.text,right.text,language);result.words.push(...structuredClone(right.words));
 if(language!=='ja'&&!/\s$/.test(left.words.at(-1)?.text||'')&&!/^\s/.test(right.words[0]?.text||''))result.words.splice(left.words.length,0,{text:' ',start:right.start,end:right.start,selectable:false});
 result.translation=[left.translation,right.translation].filter(Boolean).join(' ');result.translationEdited=false;result.translationPending=true;result.boundaryEdited=true;result.editedAt=Date.now();return result;
}
export function resegmentCards(cards,episodeId,before,after){
 return cards.filter(c=>c.episodeId===episodeId).map(c=>{
  if(!before.some(s=>s.text===c.context&&c.start>=s.start-.2&&c.end<=s.end+.3))return c;
  const target=after.find(s=>s.words.some(w=>w.text.trim()===c.text&&Math.abs(w.start-c.start)<.15&&Math.abs(w.end-c.end)<.15));
  return target?{...c,context:target.text}:c;
 });
}
