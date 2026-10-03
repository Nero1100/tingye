export function cardCategory(value=''){
 if(typeof value!=='string'||value.trim().length>60)throw Error('分类名称最多 60 个字。');
 return value.trim();
}
export function cardCategories(cards){
 return [...new Set(cards.map(c=>cardCategory(c.category||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
}
export function selectedCards(cards,episodes,{language='',category='',folder=''}={}){
 const sources=new Map(episodes.map(e=>[e.id,e]));
 return cards.filter(c=>{
  if(language&&c.language!==language)return false;
  const name=cardCategory(c.category||'');
  if(category==='unfiled'&&name||category.startsWith('c:')&&name!==decodeURIComponent(category.slice(2)))return false;
  const source=sources.get(c.episodeId);
  if(folder&&(folder==='unfiled'?source?.collectionId:source?.collectionId!==folder))return false;
  return true;
 });
}
export function cardSentence(card,segments=[]){
 if(!Number.isFinite(card?.start)||!Number.isFinite(card?.end))return null;
 const midpoint=(card.start+card.end)/2;
 const timed=segments.filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start&&midpoint>=s.start&&midpoint<s.end);
 // Prefer the current time axis, so edited and split sentences remain playable.
 return timed.find(s=>s.text===card.context)||timed[0]||segments.find(s=>s.text===card.context&&s.end>s.start&&card.start>=s.start-.2&&card.end<=s.end+.3)||null;
}
