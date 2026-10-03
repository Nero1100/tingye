export const hasKanji=text=>/[\p{Script=Han}々〆ヵヶ]/u.test(text);
export const hiragana=text=>String(text||'').replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
export function splitRuby(text,reading){
  const runs=String(text).match(/[\p{Script=Han}々〆ヵヶ]+|[^\p{Script=Han}々〆ヵヶ]+/gu)||[];
  const kana=hiragana(reading).trim();
  if(!kana)return runs.map(text=>({text,reading:''}));
  const memo=new Map();
  function align(index,position){
    if(index===runs.length)return position===kana.length?[]:null;
    const key=`${index}:${position}`;if(memo.has(key))return memo.get(key);
    const run=runs[index];let result=null;
    if(!hasKanji(run)){
      const literal=hiragana(run).trim();
      if(kana.startsWith(literal,position)){const rest=align(index+1,position+literal.length);if(rest)result=[{text:run,reading:''},...rest];}
    }else for(let end=position+1;end<=kana.length;end++){
      const rest=align(index+1,end);if(rest){result=[{text:run,reading:kana.slice(position,end)},...rest];break;}
    }
    memo.set(key,result);return result;
  }
  // Mixed alphabet/kanji and unusual readings may be inseparable: keep a whole-word ruby.
  return align(0,0)||[{text,reading:kana}];
}
export function rubyParts(word){
  return Array.isArray(word.rubyParts)&&word.rubyParts.map(p=>p.text).join('')===word.text?
    word.rubyParts:splitRuby(word.text,word.reading||'');
}
export function setRubyReading(word,index,value){
  if(value.length>512||value&&!/^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+$/u.test(value))throw Error('请填写假名，或留空取消标注。');
  const parts=rubyParts(word).map(p=>({...p}));
  if(!parts[index])throw Error('这处标注已改变，请重新打开编辑。');
  parts[index].reading=hiragana(value).replace(/\s/g,'');word.rubyParts=parts;word.readingEdited=true;
  word.reading=parts.some(p=>hasKanji(p.text)&&!p.reading)?'':parts.map(p=>p.reading||hiragana(p.text)).join('').trim();
  return word;
}
export function prepareReadings(segment,language){
  if(language!=='ja')return segment;
  let before='';
  const words=(segment.words||[]).map(original=>{
    const word={...original};
    if(!word.readingEdited&&word.text.trim()==='人'&&/(?:女|男)の\s*$/.test(before)){
      word.reading='ひと';delete word.rubyParts;word.readingSource='context';
    }
    word.rubyParts=rubyParts(word);before+=word.text;return word;
  });
  return {...segment,words};
}
