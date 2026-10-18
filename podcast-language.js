import {podcastShow} from './podcasts.js?v=2026.10.18.1';

export const PODCAST_LANGUAGE='podcast-language-v1',FAVORITE_LANGUAGE='favorite-language-v1';
export const podcastLanguages=Object.freeze({ja:'日语',en:'英语',fr:'法语'});
export const validPodcastLanguage=value=>Object.hasOwn(podcastLanguages,value);
export const showLanguage=show=>validPodcastLanguage(show?.language)?show.language:'ja';
export function episodeLanguage(episode){
 const show=episode?.podcast?.showId&&podcastShow(episode.podcast.showId);
 return show?showLanguage(show):validPodcastLanguage(episode?.language)?episode.language:'';
}
export const languageEpisodes=(episodes,language)=>validPodcastLanguage(language)?episodes.filter(e=>episodeLanguage(e)===language):episodes;
export const languageShows=(shows,language)=>shows.filter(show=>showLanguage(show)===language);
export function languageTabs(language,{all=false,context='播客语言'}={}){
 const choices=[...(all?[['','全部']]:[]),...Object.entries(podcastLanguages)];
 return `<div class="podcast-language-tabs" role="group" aria-label="${context}">${choices.map(([code,name])=>`<button type="button" data-podcast-language="${code}" aria-pressed="${language===code}" class="${language===code?'selected':''}">${name}</button>`).join('')}</div>`;
}
