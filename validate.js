const languages = ['en', 'fr', 'ja'];
const validTime = n => Number.isFinite(n) && n >= 0 && n <= 86400;
const text = (s, max) => typeof s === 'string' && s.length <= max;
export function validateTranscript(data) {
  if (!data || data.format !== 'tingye-transcript-v1' || data.version !== 1 ||
      !languages.includes(data.language) || !validTime(data.duration) ||
      !Array.isArray(data.segments) || data.segments.length > 20000)
    throw Error('请选择听页导出的逐字稿文件。');
  let end = -1, count = 0;
  for (const s of data.segments) {
    if (!validTime(s.start) || !validTime(s.end) || s.end < s.start ||
        s.start < end - .15 || s.end > data.duration + 2 || !text(s.text, 10000) ||
        !Array.isArray(s.words) || (s.translation !== undefined && !text(s.translation, 10000)))
      throw Error('逐字稿的句段格式不正确。');
    end = s.end;
    let wordEnd = s.start;
    for (const w of s.words) {
      if (++count > 120000 || !text(w.text, 512) || !validTime(w.start) ||
          !validTime(w.end) || w.end < w.start || w.start < wordEnd - .15 ||
          w.start < s.start - .2 || w.end > s.end + .3 ||
          (w.reading !== undefined && !text(w.reading, 512)) ||
          (w.lemma !== undefined && !text(w.lemma,512)) ||
          (w.pos !== undefined && !text(w.pos,100)) ||
          (w.selectable !== undefined && typeof w.selectable!=='boolean') ||
          (w.readingEdited !== undefined && typeof w.readingEdited!=='boolean') ||
          (w.rubyParts!==undefined&&(!Array.isArray(w.rubyParts)||w.rubyParts.length>512||
            w.rubyParts.some(p=>!p||!text(p.text,512)||!text(p.reading,512))||
            w.rubyParts.map(p=>p.text).join('')!==w.text)))
        throw Error('逐字稿包含无效的词语时间轴。');
      wordEnd = w.end;
    }
  }
  return data;
}
export function validatePreferences(value) {
  const p = value || {};
  return {font:p.font==='mincho'?'mincho':'gothic',immFont:p.immFont==='gothic'?'gothic':'mincho',
    reading:p.reading!==false,translation:p.translation!==false,
    rate:[.6,.75,1,1.25,1.5].includes(p.rate)?p.rate:1,loop:p.loop===true,pause:p.pause===true,
    repeats:[0,1,2,3,5,10].includes(p.repeats)?p.repeats:3,
    gap:[0,.5,1,2,3,5,10].includes(p.gap)?p.gap:2,
    mask:['none','source','translation','both'].includes(p.mask)?p.mask:'none',
    appearance:['system','light','dark'].includes(p.appearance)?p.appearance:'system',
    palette:['ocean','sage','sand','lilac','rose','graphite'].includes(p.palette)?p.palette:'ocean'};
}
export function validateBackup(meta, payloadBytes) {
  if (!['tingye-backup-v1','tingye-backup-v2'].includes(meta?.format) || !Array.isArray(meta.episodes) ||
      !Array.isArray(meta.cards) || meta.episodes.length > 1000 || meta.cards.length > 100000)
    throw Error('备份格式不正确。');
  let offset = 0;
  const ids = new Map();
  for (const e of meta.episodes) {
    if (meta.format==='tingye-backup-v1'&&e.storageMode==='external')
      throw Error('旧版备份不支持原文件记录。');
    if (!text(e.id,100) || ids.has(e.id) || !text(e.title,500) || !text(e.filename,500) ||
        !Number.isFinite(e.created) || !validTime(e.duration) || !validTime(e.progress) ||
        e.progress > e.duration + 2 || !Number.isSafeInteger(e.offset) || e.offset !== offset ||
        !Number.isSafeInteger(e.bytes) || e.bytes < (meta.format==='tingye-backup-v2'&&e.storageMode==='external'?0:1) || e.bytes > 350*1048576 ||
        e.offset + e.bytes > payloadBytes || !text(e.mime,100) ||
        !Array.isArray(e.bookmarks) || e.bookmarks.length > 10000 ||
        e.bookmarks.some(b => !validTime(b.time) || b.time > e.duration+2 || !text(b.text,10000)))
      throw Error('备份中的音频资料不完整。');
    if (meta.format==='tingye-backup-v2'&&e.storageMode==='external'&&
        (e.bytes!==0 || !Number.isSafeInteger(e.audioBytes) || e.audioBytes<1 || e.audioBytes>350*1048576 ||
         e.fingerprint!==undefined&&!/^[a-f0-9]{64}$/.test(e.fingerprint)))
      throw Error('备份中的原文件记录不正确。');
    ids.set(e.id,e); offset += e.bytes;
    validateTranscript({format:'tingye-transcript-v1',version:1,language:e.language,duration:e.duration,segments:e.segments});
  }
  for (const c of meta.cards) {
    const e = ids.get(c.episodeId);
    if (!e || !languages.includes(c.language) || !text(c.text,512) || !text(c.reading,512) ||
        !text(c.context,10000) || !text(c.note,5000) || !validTime(c.start) ||
        !validTime(c.end) || c.end<c.start || c.end>e.duration+2 ||
        !Number.isFinite(c.due) || !Number.isInteger(c.level) || c.level<0 || c.level>5 ||
        (c.lemma!==undefined&&!text(c.lemma,512)))
      throw Error('备份中的词卡格式不正确。');
  }
  if (offset !== payloadBytes) throw Error('备份音频大小不匹配。');
  return meta;
}
