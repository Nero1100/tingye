// Shared controls follow the player's existing stroke icon style.
export function practiceIcon(name){
 const paths={previous:'M18 5 8 12l10 7M5 5v14',next:'m6 5 10 7-10 7M19 5v14',settings:'M4 7h16M4 17h16M8 4v6M16 14v6',play:'m9 5 11 7-11 7V5',pause:'M8 5v14M16 5v14',stop:'M6 6h12v12H6z',mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',headphones:'M4 14v-2a8 8 0 0 1 16 0v2M4 13h3v8H4zM17 13h3v8h-3z',compare:'M4 7h16l-4-4m4 4-4 4M20 17H4l4-4m-4 4 4 4',cover:'M3 3l18 18M10 5a12 12 0 0 1 11 7 17 17 0 0 1-3 4M14 19a12 12 0 0 1-11-7 17 17 0 0 1 3-4',close:'m6 6 12 12M6 18 18 6'};
 return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.play}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
export function practiceAction(id,label,icon,primary=false){return `<button id="${id}" class="practice-action${primary?' practice-primary':''}"><span class="practice-action-icon">${practiceIcon(icon)}</span><span class="practice-action-label">${label}</span></button>`;}
export function setPracticeAction(button,label,icon){
 const text=button.querySelector('.practice-action-label');if(text.textContent!==label)text.textContent=label;
 if(button.dataset.icon!==icon){button.querySelector('.practice-action-icon').innerHTML=practiceIcon(icon);button.dataset.icon=icon;}
}
export function practiceDisplay(attribute,kanaId){return `<div class="practice-display-row"><div class="practice-segments" role="group" aria-label="显示内容"><button ${attribute}="both">原文＋译文</button><button ${attribute}="source">只看原文</button><button ${attribute}="translation">只看译文</button></div><button id="${kanaId}" class="practice-kana" lang="ja" aria-label="显示假名" aria-pressed="true" title="隐藏假名">あ</button></div>`;}
export function kanaState(button,enabled){button.setAttribute('aria-pressed',String(enabled));button.title=enabled?'隐藏假名':'显示假名';}
export function bindKanaHint(button,toast,signal){
 let timer,suppress=false;const cancel=()=>clearTimeout(timer);
 button.addEventListener('pointerdown',()=>{suppress=false;timer=setTimeout(()=>{suppress=true;toast?.(button.title);},550);},{signal});
 for(const name of ['pointerup','pointercancel','pointerleave'])button.addEventListener(name,cancel,{signal});
 button.addEventListener('click',event=>{if(suppress){suppress=false;event.preventDefault();event.stopImmediatePropagation();}},{signal});signal.addEventListener('abort',cancel,{once:true});
}
