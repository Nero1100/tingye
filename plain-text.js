import {transcriptExportName} from './transcript-batch.js';

export function plainTranscriptText(document){
  const lines=(document.segments||[]).map(segment=>String(segment.text||'').trim()).filter(Boolean);
  if(!lines.length)throw Error('逐字稿没有可导出的原文。');
  return lines.join('\n\n')+'\n';
}

export function plainTranscriptName(document){
  return transcriptExportName(document).replace(/\.json$/i,'.txt');
}
