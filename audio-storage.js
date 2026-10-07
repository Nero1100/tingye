import {audioMime} from './audio-media.js?v=2026.10.06.4';
const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');
export async function audioContentHash(blob){return hex(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));}
export function canReuseAudioCopy(episode,file,contentHash){
 return episode.storageMode==='copy'&&episode.audioCopyVersion===1&&episode.audio?.size===file.size&&episode.audioCopyHash===contentHash;
}
// Materialize selected audio bytes so the stored blob does not rely on a file picker.
export async function withAudioCopy(episode,file,hash=episode.fingerprint){
 if(!file?.size)throw Error('请选择一个非空音频文件。');
 if(file.size>350*1048576)throw Error('每段音频不能超过 350 MB。');
 const expected=episode.audio?.size||episode.audioBytes||0;
 if(expected&&file.size!==expected||episode.fingerprint&&hash!==episode.fingerprint)throw Error('这不是原来的音频，请重新选择。');
 const bytes=await file.arrayBuffer(),raw=new Blob([bytes]);
 const mime=await audioMime(raw,file.name||episode.filename)||file.type||episode.mime||'';
 const audio=new Blob([raw],{type:mime});
 if(audio.size!==file.size)throw Error('音频未完整读取，请重新选择。');
 const audioCopyHash=hex(await crypto.subtle.digest('SHA-256',bytes));
 return {...episode,storageMode:'copy',audio,audioBytes:audio.size,mime,audioCopyVersion:1,audioCopyHash,...(hash?{fingerprint:hash}:{})};
}

// Read back the committed record before reporting that a copy has been saved.
export async function saveAudioCopy(episode,file,hash,{write,read,fingerprint}){
 const updated=await withAudioCopy(episode,file,hash);
 await write('episodes',updated);
 const saved=await read('episodes',episode.id);
 if(saved?.storageMode!=='copy'||!saved.audio||saved.audio.size!==file.size||await fingerprint(saved.audio)!==hash||await audioContentHash(saved.audio)!==updated.audioCopyHash)throw Error('未能确认音频已保存，请重新选择并保存。');
 return saved;
}
