// Group old character-level timestamps into readable words without a network request.
export function lexicalWords(segment, language) {
  const original = segment.words || [];
  if (language !== 'ja' || original.some(w => w.lemma || w.readingEdited || w.rubyParts)) return original;
  if (!globalThis.Intl?.Segmenter) return original;
  const source = original.map(w => w.text).join('');
  const spans = []; let position = 0;
  for (const w of original) { spans.push({...w, a:position, b:position+w.text.length}); position+=w.text.length; }
  const boundaryTime = (p, end) => {
    const w = spans.find(w => end ? p>w.a && p<=w.b : p>=w.a && p<w.b);
    return w ? w.start+(w.end-w.start)*(p-w.a)/Math.max(1,w.b-w.a) : end?segment.end:segment.start;
  };
  return [...new Intl.Segmenter('ja',{granularity:'word'}).segment(source)].map(part => {
    const matches=spans.filter(w=>w.a>=part.index && w.b<=part.index+part.segment.length);
    return {text:part.segment,start:boundaryTime(part.index,false),end:boundaryTime(part.index+part.segment.length,true),
      reading:matches.map(w=>w.reading||'').join(''),lemma:part.segment.trim(),selectable:part.isWordLike===true};
  });
}
export function dictionaryText(cards,language='ja') {
  return [...new Set(cards.filter(c=>language==='all'?['en','fr','ja'].includes(c.language):c.language===language)
    .filter(c=>c.language!=='ja'||/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(c.lemma||c.text||''))
    .map(c=>(c.lemma||c.text||'').trim().normalize('NFC'))
    .filter(s=>s && /[\p{L}\p{N}]/u.test(s) && !/[\r\n]/.test(s)))].join('\n');
}
