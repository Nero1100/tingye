export const FAVORITES='favorite-episodes-v1',FAVORITES_SCOPE='favorites';
export function validateFavorites(value=[]){
 if(!Array.isArray(value)||value.length>5000||new Set(value).size!==value.length||value.some(id=>typeof id!=='string'||!id||id.length>100))throw Error('喜欢的音频资料不正确。');
 return value;
}
export function changeFavorite(ids,id,liked){
 validateFavorites(ids);
 return validateFavorites(liked?ids.includes(id)?[...ids]:[id,...ids]:ids.filter(item=>item!==id));
}
export function favoriteEpisodes(episodes,ids){
 const byId=new Map(episodes.map(e=>[e.id,e]));return ids.map(id=>byId.get(id)).filter(Boolean);
}
export function restoreFavorites(existing,incoming,idMap){
 return validateFavorites([...new Set([...validateFavorites(existing),...validateFavorites(incoming).map(id=>idMap.get(id)).filter(Boolean)])]);
}
export const heartIcon='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.4 4.9a5.4 5.4 0 0 0-7.7 0L12 5.6l-.7-.7a5.4 5.4 0 0 0-7.7 7.7L12 21l8.4-8.4a5.4 5.4 0 0 0 0-7.7Z"/></svg>';
