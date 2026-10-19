export const JLPT_LIBRARY='jlpt-library-v1';
export const JLPT_TYPES=['課題理解','ポイント理解','概要理解','発話表現','即時応答','統合理解','其他'];
const finite=n=>Number.isFinite(n)&&n>=0&&n<=86400;
const text=(s,max)=>typeof s==='string'&&s.length<=max;
export function jlptPreferences(value={}){return {rate:[.6,.75,1,1.25,1.5,2].includes(Number(value.rate))?Number(value.rate):1,repeats:[0,1,2,3,5,10].includes(Number(value.repeats))?Number(value.repeats):2,gap:[0,.5,1,2,3,5,10].includes(Number(value.gap))?Number(value.gap):2,reading:value.reading===true,translation:value.translation===true,mask:value.mask!==false,questionLoop:value.questionLoop===true};}
export function validateJLPTLibrary(value=[]){
 if(!Array.isArray(value)||value.length>1000)throw Error('JLPT 练习资料不正确。');
 const episodes=new Set();
 for(const item of value){
  if(!item||!text(item.episodeId,100)||!item.episodeId||episodes.has(item.episodeId)||!/^N[1-5]$/.test(item.level)||!text(item.label,200)||!finite(item.duration)||!item.duration||!Array.isArray(item.questions)||!item.questions.length||item.questions.length>200)throw Error('JLPT 材料或题目信息不正确。');
  episodes.add(item.episodeId);let end=-1;const ids=new Set();
  for(const q of item.questions){if(!q||!text(q.id,100)||!q.id||ids.has(q.id)||!text(q.label,100)||!q.label.trim()||!JLPT_TYPES.includes(q.type)||!finite(q.start)||!finite(q.end)||q.end-q.start<.1||q.start<end-.001||q.end>item.duration+.1)throw Error('题目时间不能重叠，结束位置必须晚于开始位置。');ids.add(q.id);end=q.end;}
  if(item.progress&&(!ids.has(item.progress.questionId)||!['blind','detail','review'].includes(item.progress.stage)||!finite(item.progress.time)))throw Error('JLPT 练习位置不正确。');
  if(item.difficult!==undefined&&(!Array.isArray(item.difficult)||item.difficult.length>20000||item.difficult.some(s=>!s||!finite(s.time)||!text(s.text,10000))))throw Error('JLPT 难句记录不正确。');
  if(item.mastered!==undefined&&(!Array.isArray(item.mastered)||item.mastered.length>200||item.mastered.some(id=>!ids.has(id))))throw Error('JLPT 掌握记录不正确。');
  if(item.prefs!==undefined&&(!item.prefs||typeof item.prefs!=='object'||Array.isArray(item.prefs)))throw Error('JLPT 精听设置不正确。');
 }
 return value;
}
export function createJLPTUnit(episode,level='N2'){
 const duration=episode.duration||Math.max(0,...(episode.segments||[]).map(s=>s.end));
 if(episode.language!=='ja'||!duration||!episode.segments?.length)throw Error('请先为日语音频准备逐字稿和时间轴。');
 const q={id:crypto.randomUUID(),label:'第 1 题',type:'其他',start:0,end:duration};
 const value={episodeId:episode.id,level,label:episode.title,duration,questions:[q],progress:{questionId:q.id,stage:'blind',time:0},difficult:[],mastered:[],prefs:jlptPreferences()};validateJLPTLibrary([value]);return value;
}
export function questionSentences(segments,question){return segments.map((segment,index)=>({...segment,index,clipStart:Math.max(segment.start,question.start),clipEnd:Math.min(segment.end,question.end)})).filter(s=>s.clipEnd-s.clipStart>.025);}
export function difficultSentence(item,sentence){return (item.difficult||[]).some(s=>Math.abs(s.time-sentence.start)<.15);}
export function changeDifficult(item,sentence){const saved=difficultSentence(item,sentence);return {...item,difficult:saved?(item.difficult||[]).filter(s=>Math.abs(s.time-sentence.start)>=.15):[...(item.difficult||[]),{time:sentence.start,text:sentence.text}]};}
export function restoreJLPTLibrary(existing,incoming,idMap){validateJLPTLibrary(existing);validateJLPTLibrary(incoming||[]);const restored=(incoming||[]).filter(s=>idMap.has(s.episodeId)).map(s=>({...s,episodeId:idMap.get(s.episodeId)}));return validateJLPTLibrary([...existing.filter(s=>!restored.some(r=>r.episodeId===s.episodeId)),...restored]);}
export function putJLPTUnit(items,value){return items.some(u=>u.episodeId===value.episodeId)?items.map(u=>u.episodeId===value.episodeId?value:u):[...items,value];}
export function parseJLPTTime(value){const parts=String(value).trim().split(':');if(parts.length>3||parts.some(p=>!/^\d+(\.\d+)?$/.test(p)))throw Error('请输入秒数或 分:秒，例如 1:25。');const seconds=parts.reduce((n,p)=>n*60+Number(p),0);if(!finite(seconds))throw Error('时间超出范围。');return seconds;}

// Own only playback boundaries and repetition. Study state never rewrites audio records.
export class JLPTSession{
 constructor({audio,unit,segments,changed=()=>{},persist=()=>{},report=()=>{},schedule=(fn,ms)=>setTimeout(fn,ms),clear=id=>clearTimeout(id)}){
  Object.assign(this,{audio,unit,segments,changed,persist,report,schedule,clear});this.prefs=jlptPreferences(unit.prefs);this.closed=false;this.enabled=false;this.waiting=false;this.timer=null;this.generation=0;this.lists=new Map();
  const saved=unit.progress;this.questionIndex=Math.max(0,unit.questions.findIndex(q=>q.id===saved?.questionId));this.stage=saved?.stage||'blind';this.index=0;this.selectTime(saved?.time||this.question().start);this.round=0;this.revealed=false;
 }
 question(){return this.unit.questions[this.questionIndex];}
 sentences(){const q=this.question();if(!this.lists.has(q.id))this.lists.set(q.id,questionSentences(this.segments,q));return this.lists.get(q.id);}
 current(){return this.sentences()[this.index];}
 selectTime(t){const items=this.sentences();let index=items.findIndex(s=>t>=s.clipStart-.01&&t<s.clipEnd);if(index<0)index=items.findIndex(s=>s.clipStart>=t);this.index=index<0?Math.max(0,items.length-1):index;}
 range(){const q=this.question(),s=this.current();return this.stage==='detail'&&s?{start:s.clipStart,end:s.clipEnd}:{start:q.start,end:q.end};}
 remember(){this.unit={...this.unit,prefs:{...this.prefs},progress:{questionId:this.question().id,stage:this.stage,time:this.stage==='detail'?this.current()?.start??this.question().start:Math.max(this.question().start,Math.min(this.question().end,this.audio.currentTime||this.question().start))}};this.persist(this.unit);}
 stop(){this.enabled=false;this.waiting=false;this.generation++;this.clear(this.timer);this.timer=null;this.audio.pause();}
 select(questionIndex,stage=this.stage){this.stop();this.round=0;this.questionIndex=Math.max(0,Math.min(this.unit.questions.length-1,questionIndex));this.stage=stage;this.index=0;this.revealed=false;this.audio.currentTime=this.range().start;this.remember();this.changed();}
 setStage(stage){if(!['blind','detail','review'].includes(stage))return;this.stop();this.round=0;this.stage=stage;this.revealed=false;this.audio.currentTime=this.range().start;this.remember();this.changed();}
 move(index){this.stop();this.round=0;this.index=Math.max(0,Math.min(this.sentences().length-1,index));this.revealed=false;this.audio.currentTime=this.range().start;this.remember();this.changed();}
 async toggle(){if(this.waiting||!this.audio.paused){this.stop();this.remember();this.changed();return;}await this.play();}
 async play(){
  if(this.closed)return;this.stop();const range=this.range();if(range.end<=range.start)throw Error('这一题还没有可播放的时间范围。');
  this.round=0;this.enabled=true;const generation=this.generation;this.audio.playbackRate=this.stage==='detail'?this.prefs.rate:1;this.audio.currentTime=range.start+.005;this.changed();
  try{await this.audio.play();}catch(error){if(this.closed||generation!==this.generation)return;this.stop();this.changed();this.report(error);}
 }
 tick(force=false){
  if(this.closed||!this.enabled||this.waiting||this.audio.paused&&!force)return;
  const range=this.range();if(!force&&this.audio.currentTime<range.end-.025)return;
  this.round++;this.waiting=true;this.audio.pause();this.remember();
  const again=this.stage==='detail'?(this.prefs.repeats===0||this.round<this.prefs.repeats):this.prefs.questionLoop;
  if(!again){this.enabled=false;this.waiting=false;this.changed();return;}
  const generation=this.generation;this.changed();this.timer=this.schedule(async()=>{
   if(this.closed||generation!==this.generation)return;this.waiting=false;this.audio.currentTime=range.start+.005;this.changed();try{await this.audio.play();}catch(error){if(this.closed||generation!==this.generation)return;this.stop();this.changed();this.report(error);}
  },this.prefs.gap*1000);
 }
 configure(patch){this.stop();this.prefs=jlptPreferences({...this.prefs,...patch});this.remember();this.changed();}
 close(){if(this.closed)return;this.stop();this.remember();this.closed=true;}
}
