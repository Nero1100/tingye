import {validateTranscript} from './validate.js';
import {replacementTranscript} from './transcript-edit.js';

export function transcriptName(name){
  return String(name||'').split(/[\\/]/).pop().normalize('NFC').replace(/\.json$/i,'').replace(/\.tingye$/i,'').replace(/\.(mp3|m4a|wav|flac|ogg|opus|aac|aif|aiff|mp4|webm)$/i,'').toLocaleLowerCase('en-US');
}
export function transcriptExportName(data){
  const base=String(data.audio?.filename||data.title||'逐字稿').split(/[\\/]/).pop().replace(/\.(mp3|m4a|wav|flac|ogg|opus|aac|aif|aiff|mp4|webm)$/i,'');
  return base+'.json';
}
export function transcriptFingerprint(e){
  return JSON.stringify([e.filename||e.audio?.name||'',e.audio?.size||e.audioBytes||0,e.language,e.segments||[]]);
}
export function applyTranscriptPatch(latest,patch){
  if(!latest||transcriptFingerprint(latest)!==patch.expected)throw Error('音频或逐字稿已改变，请重新读取文件夹。');
  const next={...latest,language:patch.language,segments:patch.segments,duration:latest.duration||patch.duration||0};
  delete next.transcriptUndo;
  return next;
}
export async function planTranscriptImports(selected,episodes){
  const files=Array.from(selected).filter(f=>/\.json$/i.test(f.name));
  if(!files.length)throw Error('没有找到 JSON 逐字稿文件。');
  if(files.length>1000||files.reduce((n,f)=>n+f.size,0)>200*1048576)throw Error('这一批文件过多，请分批导入。');
  const byAudio=new Map(),byScript=new Map();
  for(const e of episodes){const key=transcriptName(e.filename||e.audio?.name);if(key)byAudio.set(key,[...(byAudio.get(key)||[]),e]);}
  for(const f of files){const key=transcriptName(f.name);byScript.set(key,(byScript.get(key)||0)+1);}
  const rows=[];
  for(const file of files){
    const row={name:file.webkitRelativePath||file.name,status:'skipped'};rows.push(row);
    const key=transcriptName(file.name),matches=byAudio.get(key)||[];
    if(byScript.get(key)>1){row.reason='逐字稿重名，请只保留一份';continue;}
    if(matches.length!==1){row.reason=matches.length?'有多个同名音频，请单独替换':'没有同名音频';continue;}
    const e=matches[0];row.title=e.title;
    try{
      if(file.size>30*1048576)throw Error('文件超过 30 MB');
      const data=validateTranscript(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));
      if(!data.segments.length)throw Error('逐字稿没有句子');
      if(data.audio?.filename&&transcriptName(data.audio.filename)!==key)throw Error('稿内记录的音频名不同');
      replacementTranscript(e,data);
      Object.assign(row,{status:'ready',episodeId:e.id,data,expected:transcriptFingerprint(e),oldCount:e.segments?.length||0});
    }catch(error){row.reason=error instanceof SyntaxError?'JSON 格式不正确':error.message;}
  }
  return rows;
}
export function phoneInterface(userAgent,maxTouchPoints=0){
  return /Android|iPhone|iPad|iPod/i.test(userAgent)||/Macintosh/i.test(userAgent)&&maxTouchPoints>1;
}
