import {editedSentence} from './transcript-edit.js?v=2026.10.04.15';
import {splitSentence} from './segment-edit.js?v=2026.10.04.15';
const closers='"\'”’」』）)»';
const abbreviations=new Set(['mr.','mrs.','ms.','dr.','prof.','sr.','jr.','st.','vs.','etc.','e.g.','i.e.','m.','mme.','mlle.','p.ex.']);
function endsSentence(text){
 const value=text.trimEnd().replace(/["'”’」』）)»]+$/u,'').trimEnd();
 if(/[。！？!?]$/u.test(value))return true;
 const token=value.split(/\s+/u).at(-1).toLowerCase();
 return value.endsWith('.')&&!abbreviations.has(token)&&! /^(?:[a-z]\.){1,4}$/u.test(token);
}
export function boundaryWords(segment,language){
 const words=segment.words||[];
 if(words.length>1&&words.map(w=>w.text).join('').trim()===segment.text.trim())return structuredClone(segment);
 // Old files sometimes provide just one timestamp for a whole paragraph.
 return editedSentence({...segment,words:[]},segment.text,segment.translation||'',language);
}
export function suggestSentences(segments,language){
 const result=[];
 for(const source of segments){
  const prepared=boundaryWords(source,language),words=prepared.words;
  let cuts=[],start=0,content='';
  for(let i=0;i<words.length;i++){
   const w=words[i];
   if(i>start&&w.text.trim()&&! [...w.text.trim()].every(c=>closers.includes(c))){
    const gap=w.start-words[i-1].end;
    const long=w.end-words[start].start>14||content.length>(language==='ja'?64:200);
    if(endsSentence(content)||gap>=.65||long){cuts.push(i);start=i;content='';}
   }
   content+=w.text;
  }
  let remaining=prepared,offset=0,parts=[];
  for(const cut of cuts){
   const local=cut-offset,a=remaining.words[local-1],b=remaining.words[local];
   const t=(a.end+b.start)/2;
   if(t<=remaining.start||t>=remaining.end)continue;
   const pair=splitSentence(remaining,local,t,[parts.length?'':source.translation||'','']);
   parts.push(pair[0]);remaining=pair[1];offset=cut;
  }
  parts.push(remaining);result.push(...parts);
 }
 return result.map((s,id)=>({...s,id}));
}
