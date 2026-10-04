import {moveEpisode} from './playlist.js';
export function validateFolders(value=[]){
 if(!Array.isArray(value)||value.length>100)throw Error('最多创建 100 个文件夹。');
 const ids=new Set();
 for(const f of value){
  if(!f||typeof f.id!=='string'||!f.id||f.id.length>100||ids.has(f.id)||typeof f.name!=='string'||!f.name.trim()||f.name.length>80||!Number.isFinite(f.created)||
    (f.cover!==undefined&&(typeof f.cover!=='string'||f.cover.length>200000||f.cover!==''&&!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(f.cover))))throw Error('文件夹名称或封面格式不正确。');
  ids.add(f.id);
 }return value;
}
export function folderEpisodes(episodes,id){return id?episodes.filter(e=>id==='unfiled'?!e.collectionId:e.collectionId===id):episodes;}
export function moveInFolder(episodes,folderId,id,offset){
 const subset=folderEpisodes(episodes,folderId).map(e=>e.id),moved=moveEpisode(subset,id,offset),members=new Set(subset);let index=0;
 return episodes.map(e=>members.has(e.id)?moved[index++]:e.id);
}
export function folderMembership(episodes,folderId,selectedIds){
 const selected=new Set(selectedIds);
 return episodes.filter(e=>selected.has(e.id)&&e.collectionId!==folderId||!selected.has(e.id)&&e.collectionId===folderId)
  .map(e=>({...e,collectionId:selected.has(e.id)?folderId:''}));
}
export function restoreFolders(folders,episodes,makeId){
 validateFolders(folders);const mapping=new Map(folders.map(f=>[f.id,makeId()]));
 return {folders:folders.map(f=>({...f,id:mapping.get(f.id)})),episodes:episodes.map(e=>({...e,collectionId:mapping.get(e.collectionId)||''}))};
}
export async function makeFolderCover(file){
 if(file.size>20*1048576)throw Error('图片不能超过 20 MB。');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('无法读取图片，请选择 JPG、PNG 或 WebP 图片。'));image.src=url;});
  const canvas=document.createElement('canvas');canvas.width=canvas.height=384;
  const side=Math.min(image.naturalWidth,image.naturalHeight);if(!side)throw Error('图片内容为空。');
  canvas.getContext('2d').drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,384,384);
  const cover=canvas.toDataURL('image/jpeg',.8);
  return cover.length<=200000?cover:canvas.toDataURL('image/jpeg',.6);
 }finally{URL.revokeObjectURL(url);}
}
