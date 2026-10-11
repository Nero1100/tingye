import {cardCategory,cardCategories} from './cards.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const optionValue=name=>'c:'+encodeURIComponent(name);
export function rememberedCategory(record){
 try{return cardCategory(record?.value||'');}catch{return '';}
}
export function categoryField(cards,value='',id='word-category'){
 const names=cardCategories([...cards,{category:value}]);
 return `<div class="category-picker"><label for="${id}-select">分类</label><select id="${id}-select"><option value="">未分类</option>${names.map(name=>`<option value="${esc(optionValue(name))}" ${name===value?'selected':''}>${esc(name)}</option>`).join('')}<option value="new">＋ 新建分类</option></select><input type="hidden" id="${id}" value="${esc(value)}"><div id="${id}-creation" class="category-creation" hidden><label for="${id}-new">新分类名称</label><input id="${id}-new" maxlength="60" placeholder="输入一次，以后直接选择"></div></div>`;
}
export function bindCategoryField(root,id='word-category'){
 const field=root.querySelector('#'+id),select=root.querySelector('#'+id+'-select'),creation=root.querySelector('#'+id+'-creation'),name=root.querySelector('#'+id+'-new');
 select.addEventListener('change',()=>{
  creation.hidden=select.value!=='new';
  field.value=select.value==='new'?name.value:select.value?decodeURIComponent(select.value.slice(2)):'';
  if(!creation.hidden)name.focus();
 });
 name.addEventListener('input',()=>{field.value=name.value;});
 function setValue(value){
  value=cardCategory(value);
  const encoded=optionValue(value);
  if(value&&![...select.options].some(option=>option.value===encoded)){
   const option=document.createElement('option');option.value=encoded;option.textContent=value;select.add(option,select.options.length-1);
  }
  select.value=value?encoded:'';field.value=value;creation.hidden=true;name.value='';
 }
 return {setValue,getValue(){
  const value=cardCategory(field.value);
  if(select.value==='new'&&!value){name.focus();throw Error('请输入新分类名称，或选择“未分类”。');}
  return value;
 }};
}
