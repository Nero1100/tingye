export const RECORDING_PREFIX='shadow-recording/',RECORDING_LIMIT=50*1048576;
export class ShadowRecordings{
 constructor({all,read,write,remove}){Object.assign(this,{all,read,write,remove});this.saving=Promise.resolve();}
 async list(){return (await this.all('settings')).filter(row=>row.id.startsWith(RECORDING_PREFIX)&&row.value?.blob instanceof Blob).map(row=>({...row.value,id:row.id})).sort((a,b)=>b.savedAt-a.savedAt);}
 key(episodeId,start,kind){return RECORDING_PREFIX+encodeURIComponent(episodeId)+'/'+(kind==='full'?'full':Math.round(start*1000));}
 mutate(action){const pending=this.saving.then(action,action);this.saving=pending.catch(()=>{});return pending;}
 save(episode,recording){
  const action=async()=>{
   if(!(recording?.blob instanceof Blob)||!recording.blob.size)throw Error('没有可以保留的录音。');
   const id=this.key(episode.id,recording.sentence.start,recording.kind),list=await this.list(),size=list.filter(row=>row.id!==id).reduce((sum,row)=>sum+row.blob.size,0)+recording.blob.size;
   if(size>RECORDING_LIMIT)throw Error('保留录音已达到 50 MB，请先在跟读录音管理里清理。');
   const value={episodeId:episode.id,title:episode.title,language:episode.language,text:recording.sentence.text,start:recording.sentence.start,end:recording.sentence.end,duration:recording.duration,kind:recording.kind==='full'?'full':'sentence',blob:recording.blob,savedAt:Date.now()};
   await this.write('settings',{id,value});return {...value,id};
  };
  return this.mutate(action);
 }
 delete(id){if(typeof id!=='string'||!id.startsWith(RECORDING_PREFIX))throw Error('录音记录不正确。');return this.mutate(()=>this.remove('settings',id));}
 clear(){return this.mutate(async()=>{for(const item of await this.list())await this.remove('settings',item.id);});}
}
