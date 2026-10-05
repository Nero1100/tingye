import {validateTranscript} from './validate.js';
import {transcriptName} from './transcript-batch.js';
const encoder=new TextEncoder();
export const MAX_PART_BYTES=192000,MAX_PARTS=170;
export async function sha256(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function publicTranscript(input){
 validateTranscript(input);
 // Explicit allowlist prevents audio bytes, local paths, cards and account data from leaving the device.
 const out={format:input.format,version:1,title:String(input.title||'').slice(0,500),language:input.language,duration:input.duration,
  audio:{filename:String(input.audio?.filename||'').split(/[\\/]/).pop().slice(0,500)},segments:input.segments.map(s=>{
   const result={start:s.start,end:s.end,text:s.text,translation:s.translation||'',words:s.words.map(w=>{
    const next={text:w.text,start:w.start,end:w.end};
    for(const k of ['reading','lemma','pos','selectable','readingEdited','timingEstimated'])if(w[k]!==undefined)next[k]=w[k];
    if(w.rubyParts)next.rubyParts=w.rubyParts.map(p=>({text:p.text,reading:p.reading}));return next;
   })};
   for(const k of ['textEdited','translationEdited','translationPending','timingEstimated'])if(s[k]!==undefined)result[k]=s[k];return result;
  })};validateTranscript(out);return out;
}
export function splitPayload(payload){
 const parts=[];let part='',bytes=0;
 for(const character of payload){const length=encoder.encode(character).length;if(bytes+length>MAX_PART_BYTES){parts.push(part);part='';bytes=0;}part+=character;bytes+=length;}
 if(part)parts.push(part);if(!parts.length||parts.length>MAX_PARTS)throw Error('逐字稿过大，暂不能同步。');return parts;
}
export async function packageTranscript(document){const safe=publicTranscript(document),payload=JSON.stringify(safe);return {document:safe,parts:splitPayload(payload),hash:await sha256(payload),bytes:encoder.encode(payload).length,matchKey:transcriptName(safe.audio.filename)};}
export function validateManifest(data,id){
 if(!data||typeof id!=='string'||!/^t-[a-f0-9]{64}$/.test(id)||typeof data.revision!=='string'||!/^r-[a-f0-9]{32}$/.test(data.revision)||!/^([a-f0-9]{64})$/.test(data.hash)||!Number.isInteger(data.parts)||data.parts<1||data.parts>MAX_PARTS||!Number.isInteger(data.bytes)||data.bytes<1||data.bytes>30*1048576||!['ja','en','fr'].includes(data.language)||typeof data.filename!=='string'||data.filename.length>500||typeof data.title!=='string'||data.title.length>500||!Number.isFinite(data.duration)||data.duration<0||data.duration>86400||data.matchKey!==transcriptName(data.filename))throw Error('云端逐字稿索引不完整，原稿保留。');
 return {...data,id};
}
export async function unpackTranscript(manifest,parts){
 validateManifest(manifest,manifest.id);if(parts.length!==manifest.parts||parts.some(p=>typeof p!=='string'||encoder.encode(p).length>MAX_PART_BYTES))throw Error('逐字稿尚未下载完整，原稿保留。');
 const payload=parts.join('');if(encoder.encode(payload).length!==manifest.bytes||await sha256(payload)!==manifest.hash)throw Error('逐字稿校验未通过，原稿保留。');
 const document=publicTranscript(JSON.parse(payload));if(document.audio.filename!==manifest.filename||document.language!==manifest.language||document.duration!==manifest.duration)throw Error('逐字稿与云端索引不同，原稿保留。');return document;
}
export function matchingEpisode(manifest,episodes,scope){
 const bound=episodes.filter(e=>e.cloudTranscript?.scope===scope&&e.cloudTranscript.id===manifest.id);
 if(bound.length===1)return {episode:bound[0],bound:true};if(bound.length>1)return {reason:'多个音频关联了同一份逐字稿，请重新关联。'};
 const matches=episodes.filter(e=>!e.cloudTranscript&&e.language===manifest.language&&transcriptName(e.filename)===manifest.matchKey);
 if(matches.length!==1)return {reason:matches.length?'有多个同名音频，请选择对应音频。':'请先导入对应音频。'};
 const e=matches[0];if(e.duration&&Math.abs(e.duration-manifest.duration)>Math.max(2,manifest.duration*.005))return {reason:'音频时长不同，请核对后手动关联。'};
 // Existing local corrections are never silently replaced on first contact.
 return {episode:e,needsConfirmation:!!e.segments?.length};
}
