const sizes=[[1,'标准'],[1.15,'舒适'],[1.3,'大']];
const fonts=[['mincho','明朝'],['gothic','黑体']];
const colors=[['ink','墨'],['vermilion','朱'],['pine','松'],['blue','靛'],['ochre','芥']];
function choices(key,label,values,prefs){
 return `<div class="reading-segments" role="radiogroup" aria-label="${label}">${values.map(([value,name])=>`<button type="button" role="radio" aria-checked="${prefs[key]===value}" tabindex="${prefs[key]===value?0:-1}" data-reading-pref="${key}" data-value="${value}">${name}</button>`).join('')}</div>`;
}
export function readingDisplayHTML(prefs,follow){
 return `<div class="reading-content"><h2 class="reading-section-title" id="reading-display-title">显示</h2>${[['sourceSize','原文字号'],['translationSize','中文字号']].map(([key,label])=>`<div class="reading-option-row reading-size-row"><span>${label}</span>${choices(key,label,sizes,prefs)}</div>`).join('')}<h3 class="reading-section-title">字色</h3>${[['sourceColor','原文'],['translationColor','译文']].map(([key,label])=>`<div class="reading-color-row"><span>${label}</span><div class="reading-colors" role="radiogroup" aria-label="${label}字色">${colors.map(([value,name])=>`<button type="button" role="radio" aria-label="${label}字色${name}" aria-checked="${prefs[key]===value}" tabindex="${prefs[key]===value?0:-1}" data-reading-pref="${key}" data-value="${value}"><i class="reading-swatch ${value}" aria-hidden="true"></i><small>${name}</small></button>`).join('')}</div></div>`).join('')}<h3 class="reading-section-title">日语字体</h3>${[['font','正文'],['immFont','沉浸']].map(([key,label])=>`<div class="reading-option-row reading-font-row"><span>${label}</span>${choices(key,`${label}日语字体`,fonts,prefs)}</div>`).join('')}<div class="reading-extras"><label class="reading-follow-control" for="reading-follow"><span>播放时跟随当前句</span><input id="reading-follow" type="checkbox" role="switch" ${follow?'checked':''}></label><div class="reading-actions"><button type="button" id="reader-practice">精听设置</button><button type="button" id="reader-manage">管理与校对</button></div></div></div>`;
}

// A non-modal popover lets the transcript and audio continue while adjusting it.
export function openReadingDisplay({anchor,prefs,follow,onPreference,onFollow,onPractice,onManage,onClose,report}){
 const menu=document.createElement('section'),controller=new AbortController(),events={signal:controller.signal};
 menu.id='reading-display';menu.className='reading-display';menu.setAttribute('popover','manual');menu.setAttribute('role','dialog');menu.setAttribute('aria-labelledby','reading-display-title');
 menu.innerHTML=readingDisplayHTML(prefs,follow);document.body.append(menu);
 anchor.setAttribute('aria-expanded','true');anchor.setAttribute('aria-controls',menu.id);
 let closed=false;
 function close(restoreFocus=false){
  if(closed)return;closed=true;controller.abort();anchor.setAttribute('aria-expanded','false');anchor.removeAttribute('aria-controls');
  if(menu.matches(':popover-open'))menu.hidePopover();menu.remove();onClose?.();
  if(restoreFocus&&anchor.isConnected)anchor.focus({preventScroll:true});
 }
 function position(){
  if(!anchor.isConnected){close();return;}
  const rect=anchor.getBoundingClientRect(),width=menu.getBoundingClientRect().width;
  const viewport=window.visualViewport,height=viewport?.height||innerHeight,viewportTop=viewport?.offsetTop||0;
  const top=Math.min(rect.bottom+12,viewportTop+height-100),left=Math.max(12,Math.min(rect.right-width,innerWidth-width-12));
  menu.style.left=`${left}px`;menu.style.top=`${Math.max(12,top)}px`;
  menu.style.setProperty('--reading-maxheight',`${Math.max(80,viewportTop+height-top-12)}px`);
  menu.style.setProperty('--reading-arrow',`${Math.max(24,Math.min(width-24,rect.left+rect.width/2-left))}px`);
 }
 function paint(key){
  for(const button of menu.querySelectorAll(`[data-reading-pref="${key}"]`)){
   const selected=String(prefs[key])===button.dataset.value;button.setAttribute('aria-checked',String(selected));button.tabIndex=selected?0:-1;
  }
 }
 for(const button of menu.querySelectorAll('[data-reading-pref]'))button.addEventListener('click',async()=>{
  const key=button.dataset.readingPref,value=key.endsWith('Size')?Number(button.dataset.value):button.dataset.value;
  const pending=onPreference(key,value);paint(key);
  try{await pending;}catch(error){report(error);}
 },events);
 menu.addEventListener('keydown',event=>{
  const button=event.target.closest('[role="radio"]');if(!button||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();
  const buttons=[...button.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]')],index=buttons.indexOf(button);
  const next=buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+buttons.length)%buttons.length];next.focus({preventScroll:true});next.click();
 },events);
 menu.querySelector('#reading-follow').addEventListener('change',event=>onFollow(event.target.checked),events);
 menu.querySelector('#reader-practice').addEventListener('click',()=>{close();onPractice();},events);
 menu.querySelector('#reader-manage').addEventListener('click',()=>{close();onManage();},events);
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!anchor.contains(event.target))close();},{...events,capture:true});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);}},{...events,capture:true});
 window.addEventListener('resize',position,events);window.visualViewport?.addEventListener('resize',position,events);
 menu.addEventListener('toggle',event=>{if(event.newState==='closed')close();},events);
 menu.showPopover();position();menu.querySelector('[role="radio"][aria-checked="true"]').focus({preventScroll:true});
 return {element:menu,close};
}
