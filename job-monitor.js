const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=seconds=>`${Math.floor(Math.max(0,seconds||0)/60)}:${String(Math.floor(Math.max(0,seconds||0)%60)).padStart(2,'0')}`;
export const terminalJob=state=>['done','error','cancelled'].includes(state);
export function jobProgress(job){
 const audio=job.audio_total?`已识别 ${clock(job.audio_completed)} / ${clock(job.audio_total)} 音频`:'';
 const sentences=job.sentences_total?`已翻译 ${job.sentences_completed||0} / ${job.sentences_total} 句`:'';
 return `<div class="job-phase"><strong>${esc(job.message||'等待处理')}</strong><progress max="100" ${job.progress_indeterminate?'':`value="${job.progress||0}"`}></progress><p class="note">${job.progress||0}%${job.progress_indeterminate?' · 当前步骤正在运行':''}${job.elapsed?` · 已用时 ${clock(job.elapsed)}`:''}</p>${audio||sentences?`<p class="note">${esc(job.state==='translating'?sentences:audio)}</p>`:''}</div>`;
}
export function mountJobMonitor(modal,resultId,canCancel,onCancel){
 const result=modal.querySelector('#'+resultId),head=modal.querySelector('.dialog-head'),options=document.createElement('div');
 options.className='job-options';
 while(head.nextSibling&&head.nextSibling!==result)options.append(head.nextSibling);
 head.after(options);head.after(result);
 const control=document.createElement('div');control.className='job-control';control.hidden=true;
 control.innerHTML=`<button class="secondary" ${canCancel?'':'hidden'}>取消处理</button><span class="note">${canCancel?'取消后保留已完成的稿件。':'重启新版电脑工具后，可中途取消。'}</span>`;
 result.after(control);const button=control.querySelector('button');
 button.onclick=async()=>{button.disabled=true;button.textContent='取消中…';try{await onCancel();}catch(error){button.disabled=false;button.textContent='重试取消';control.querySelector('span').textContent=error.message;}};
 modal.classList.add('processing-dialog');
 return {
  start(){options.hidden=true;control.hidden=false;button.disabled=false;button.textContent='取消处理';modal.scrollTop=0;},
  finish(){control.hidden=true;},
  retry(){options.hidden=false;control.hidden=true;},
  cancelling(){options.hidden=true;control.hidden=false;button.disabled=true;button.textContent='取消中…';control.querySelector('span').textContent='正在停止当前步骤，已完成的稿件保留。';},
  upload(percent,label='音频'){result.innerHTML=`<div class="job"><strong>正在提交${esc(label)}给电脑工具</strong><progress max="100" ${percent===null?'':`value="${percent}"`}></progress><p class="note">${percent===null?'正在上传…':percent===100?'上传完成，正在准备任务…':`上传 ${percent}%`}</p></div>`;}
 };
}
