export class ListPosition {
 constructor(){this.positions=new Map();}
 remember(scroller,key){
  if(!key)return;
  const edge=scroller.getBoundingClientRect().top;
  const row=[...scroller.querySelectorAll('[data-episode]')].find(el=>el.getBoundingClientRect().bottom>edge);
  this.positions.set(key,{top:scroller.scrollTop,id:row?.dataset.episode,offset:row?row.getBoundingClientRect().top-edge:0});
 }
 restore(scroller,key){
  const saved=this.positions.get(key);scroller.scrollTop=saved?.top||0;
  if(!saved?.id)return;
  const row=[...scroller.querySelectorAll('[data-episode]')].find(el=>el.dataset.episode===saved.id);
  if(row)scroller.scrollTop+=row.getBoundingClientRect().top-scroller.getBoundingClientRect().top-saved.offset;
 }
}
