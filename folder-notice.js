export const FOLDER_NOTICE_DURATION=8000;
export function folderNoticeRemaining(snapshot,now=Date.now()){
 if(!snapshot?.folder||snapshot.noticeDismissed||!Number.isFinite(snapshot.deletedAt)||!Number.isFinite(now))return 0;
 const age=now-snapshot.deletedAt;return age>=0&&age<FOLDER_NOTICE_DURATION?FOLDER_NOTICE_DURATION-age:0;
}
// A notice owns its node and timer; an old callback cannot dismiss a newer deletion.
export function bindFolderNotice(node,snapshot,{dismiss=()=>{},report=()=>{},now=()=>Date.now(),schedule=(fn,ms)=>setTimeout(fn,ms),clear=id=>clearTimeout(id)}={}){
 if(!node)return ()=>{};
 const events=new AbortController();let timer;
 const hide=()=>{clear(timer);events.abort();node.remove();};
 const remaining=folderNoticeRemaining(snapshot,now());if(!remaining){hide();return ()=>{};}
 timer=schedule(hide,remaining);
 node.querySelector('[data-dismiss-folder-notice]')?.addEventListener('click',()=>{hide();Promise.resolve(dismiss(snapshot.token)).catch(report);},{signal:events.signal});
 return ()=>{clear(timer);events.abort();};
}
