// XHR exposes actual upload progress; the model's progress comes from the server.
export function submitLocalForm(url,body,{signal,onProgress}={}){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest(),abort=()=>xhr.abort();
  const finish=(fn,value)=>{signal?.removeEventListener('abort',abort);fn(value);};
  xhr.open('POST',url);xhr.responseType='json';
  xhr.upload.onprogress=event=>onProgress?.(event.lengthComputable?Math.round(event.loaded/event.total*100):null);
  xhr.onload=()=>{const data=xhr.response;if(xhr.status>=200&&xhr.status<300)finish(resolve,data);else finish(reject,Error(data?.detail||'任务未能提交，请重试。'));};
  xhr.onerror=()=>finish(reject,Error('无法连接电脑工具，请检查工具是否仍在运行。'));
  xhr.onabort=()=>finish(reject,new DOMException('已取消提交','AbortError'));
  if(signal?.aborted){finish(reject,new DOMException('已取消提交','AbortError'));return;}
  signal?.addEventListener('abort',abort,{once:true});xhr.send(body);
 });
}
