const types={wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',aac:'audio/aac',flac:'audio/flac',ogg:'audio/ogg',opus:'audio/ogg',webm:'audio/webm'};
const ascii=(bytes,start,length)=>String.fromCharCode(...bytes.subarray(start,start+length));
export async function audioMime(blob,filename=''){
 const bytes=new Uint8Array(await blob.slice(0,64).arrayBuffer());
 if(['RIFF','RF64'].includes(ascii(bytes,0,4))&&ascii(bytes,8,4)==='WAVE')return types.wav;
 if(ascii(bytes,0,4)==='fLaC')return types.flac;
 if(ascii(bytes,0,4)==='OggS')return types.ogg;
 if(ascii(bytes,4,4)==='ftyp')return types.m4a;
 if(ascii(bytes,0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224&&(bytes[1]&6)!==0)return types.mp3;
 if(bytes[0]===255&&(bytes[1]&246)===240)return types.aac;
 if(bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163)return types.webm;
 return types[filename.split('.').pop().toLowerCase()]||blob.type||'';
}
export function resumePosition(position,duration,{explicit=false}={}){
 const value=Math.max(0,Number.isFinite(position)?position:0);
 if(!Number.isFinite(duration)||duration<=0)return value;
 // A finished recording should replay, while explicit seeks keep their requested position.
 if(!explicit&&value>=duration-Math.min(.25,duration*.05))return 0;
 return Math.min(value,Math.max(0,duration-.01));
}
export function playbackError(error,mediaError){
 if(error?.name==='NotAllowedError')return '手机阻止了播放，请再点一次播放按钮。';
 if(error?.name==='AbortError')return '';
 if(mediaError?.code===3||mediaError?.code===4||error?.name==='NotSupportedError')return '这段音频无法解码。请打开管理音频中的“检查声音”，查看实际编码。';
 if(mediaError?.code===2)return '音频读取失败，请重新打开这段音频；仍失败时可重新选择原文件补存。';
 return error?.message||'播放未成功，请重新打开这段音频。';
}
// Read the WAV header only. No audio or diagnostic information leaves the device.
export async function wavInfo(blob){
 const bytes=new Uint8Array(await blob.slice(0,1048576).arrayBuffer());
 if(!['RIFF','RF64'].includes(ascii(bytes,0,4))||ascii(bytes,8,4)!=='WAVE')return null;
 const view=new DataView(bytes.buffer);let offset=12;
 while(offset+8<=bytes.length){
  const kind=ascii(bytes,offset,4),length=view.getUint32(offset+4,true),start=offset+8;
  if(kind==='fmt '&&length>=16&&start+16<=bytes.length){
   let code=view.getUint16(start,true);const extensible=code===65534;
   if(extensible&&length>=40&&start+40<=bytes.length)code=view.getUint16(start+24,true);
   return {encoding:({1:'PCM 整数',3:'IEEE 浮点',6:'A-law',7:'μ-law',17:'IMA ADPCM'})[code]||`编码 ${code}`,extensible,channels:view.getUint16(start+2,true),sampleRate:view.getUint32(start+4,true),bits:view.getUint16(start+14,true)};
  }
  const next=start+length+(length%2);if(next<=offset||next>bytes.length)break;offset=next;
 }
 return {encoding:'无法读取编码信息'};
}
