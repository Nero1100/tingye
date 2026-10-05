import {cloudConfig} from './cloud-config.js';
import {packageTranscript,sha256,unpackTranscript,validateManifest,matchingEpisode,publicTranscript} from './cloud-transcript.js';

export function syncMessage(error){
 const code=error?.code||'';
 if(code.includes('permission-denied'))return '账号没有这个共享书库的权限，请检查成员设置。';
 if(code.includes('resource-exhausted'))return '免费额度暂时不足，本机已保存，稍后继续同步。';
 if(code.includes('auth/invalid')||code.includes('auth/wrong')||code.includes('auth/user-not-found'))return '邮箱或密码不正确。';
 if(code.includes('auth/too-many'))return '尝试次数过多，请稍后登录。';
 if(code.includes('unavailable')||code.includes('network'))return '暂时无法连接，本机资料保留，联网后重试。';
 return error?.message||'同步尚未完成，本机资料保留。';
}
function connection(input){
 if(!input?.enabled)return null;
 const config=input.firebase,space=input.space;
 if(!config||typeof config.apiKey!=='string'||!config.apiKey.startsWith('AIza')||!/^[-a-z0-9]{4,63}$/.test(config.projectId||'')||!/^[-\w:]{5,200}$/.test(config.appId||'')||!/^[-\w]{8,80}$/.test(space||''))throw Error('同步连接信息不完整。');
 return {enabled:true,space,firebase:{apiKey:config.apiKey,projectId:config.projectId,appId:config.appId,
  authDomain:config.projectId+'.firebaseapp.com'}};
}
export class TranscriptSync {
 constructor({read,write,all,apply,canWrite,canApply,changed,notify}){
  Object.assign(this,{read,write,all,apply,canWrite,canApply,changed,notify});
  this.config=null;this.user=null;this.role='';this.items=[];this.pending=[];this.error='';this.running=false;this.generation=0;this.flushPromise=null;this.receivePromise=null;
 }
 get scope(){return this.config?this.config.firebase.projectId+':'+this.config.space:'';}
 get key(){return this.user?this.scope+':'+this.user.uid:'';}
 get ready(){return !!(this.user&&this.role);}
 update(){this.changed?.();}
 async start(){
  try{this.config=connection((await this.read('settings','sync-connection'))?.value||cloudConfig);if(!this.config){this.update();return;}
   this.sdk=await import('./firebase-vendor.js');const s=this.sdk;
   this.app=s.initializeApp(this.config.firebase,'tingye-transcript-sync');this.auth=s.getAuth(this.app);
   this.db=s.initializeFirestore(this.app,{experimentalAutoDetectLongPolling:true});
   this.authStop=s.onAuthStateChanged(this.auth,user=>this.authChanged(user));
   this.timer=setInterval(()=>{if(navigator.onLine&&document.visibilityState!=='hidden')this.refresh().catch(()=>{});},30000);
  }catch(error){this.error=syncMessage(error);this.update();}
 }
 async configure(input){const config=connection(input);if(!config)throw Error('请输入有效的同步连接信息。');await this.write('settings',{id:'sync-connection',value:config});return config;}
 async login(email,password){if(!this.auth)throw Error('请先完成同步连接设置。');await this.sdk.signInWithEmailAndPassword(this.auth,email.trim(),password);}
 async logout(){this.generation++;this.stop?.();this.stop=null;this.role='';this.user=null;this.items=[];this.pending=[];await this.sdk.signOut(this.auth);this.update();}
 async authChanged(user){
  const generation=++this.generation;this.stop?.();this.stop=null;this.user=user;this.role='';this.items=[];this.pending=[];this.error='';this.update();if(!user)return;
  try{
   const knownMember=(await this.read('settings','sync-member/'+this.key))?.value;
   if(generation!==this.generation)return;
   if(['editor','reader'].includes(knownMember?.role)){this.role=knownMember.role;this.pending=(await this.read('settings','sync-outbox/'+this.key))?.value||[];this.items=(await this.read('settings','sync-catalog/'+this.scope))?.value||[];this.update();}
   const member=await this.sdk.getDocFromServer(this.sdk.doc(this.db,'spaces',this.config.space,'members',user.uid));
   if(generation!==this.generation)return;
   const role=member.data()?.role;if(!member.exists()||!['editor','reader'].includes(role))throw Error('这个账号尚未获准访问共享书库。');
   this.role=role;await this.write('settings',{id:'sync-member/'+this.key,value:{role}});this.pending=(await this.read('settings','sync-outbox/'+this.key))?.value||[];
   const cached=(await this.read('settings','sync-catalog/'+this.scope))?.value||[];
   this.items=cached;this.update();
   this.stop=this.sdk.onSnapshot(this.sdk.collection(this.db,'spaces',this.config.space,'transcripts'),snapshot=>{
    if(generation!==this.generation)return;
    try{this.items=snapshot.docs.map(d=>{const v=d.data();return validateManifest({revision:v.revision,hash:v.hash,parts:v.parts,bytes:v.bytes,title:v.title,filename:v.filename,language:v.language,duration:v.duration,matchKey:v.matchKey},d.id);});
     this.write('settings',{id:'sync-catalog/'+this.scope,value:this.items}).catch(()=>{});this.error='';this.update();this.drain().catch(error=>{this.error=syncMessage(error);this.update();});
    }catch(error){this.error=syncMessage(error);this.update();}
   },error=>{if(generation===this.generation){this.error=syncMessage(error);this.update();}});
   await this.flush();
  }catch(error){if(generation===this.generation){if(error.code?.includes('permission-denied')||error.message?.includes('尚未获准'))this.role='';this.error=syncMessage(error);this.update();}}
 }
 async enqueue(document,{baseHash=null,id=null}={}){
  if(!this.ready||this.role!=='editor'||!this.canWrite())return {queued:false};
  const packet=await packageTranscript(document);if(!packet.matchKey)throw Error('逐字稿缺少原音频文件名，不能自动同步。');
  id=id||'t-'+await sha256(packet.document.language+'\n'+packet.matchKey);
  const existing=this.pending.find(p=>p.id===id),known=(await this.read('settings','sync-published/'+this.key+'/'+id))?.value;
  const entry={id,document:packet.document,hash:packet.hash,baseHash:existing?existing.baseHash:known?.hash??baseHash??null,created:Date.now()};
  this.pending=[...this.pending.filter(p=>p.id!==id),entry];await this.storePending();this.update();this.flush().catch(()=>{});return {queued:true,id};
 }
 async storePending(){await this.write('settings',{id:'sync-outbox/'+this.key,value:this.pending});}
 async flush(){if(this.flushPromise)return this.flushPromise;if(!this.ready||this.role!=='editor'||!this.canWrite()||!navigator.onLine)return;
  const generation=this.generation,key=this.key;
  this.flushPromise=(async()=>{
   this.running=true;this.update();
   for(const entry of [...this.pending]){
    if(generation!==this.generation||key!==this.key)break;
    try{await this.publish(entry,generation);if(generation!==this.generation)break;
     await this.write('settings',{id:'sync-published/'+key+'/'+entry.id,value:{hash:entry.hash}});
     this.pending=this.pending.filter(p=>p.id!==entry.id||p.hash!==entry.hash).map(p=>p.id===entry.id?{...p,baseHash:entry.hash}:p);await this.storePending();this.error='';this.notify?.('逐字稿已同步');
    }catch(error){if(generation===this.generation){this.error=syncMessage(error);this.update();}break;}
   }
  })().finally(()=>{this.running=false;this.flushPromise=null;this.update();});return this.flushPromise;
 }
 async publish(entry,generation){
  const s=this.sdk,packet=await packageTranscript(entry.document),ref=s.doc(this.db,'spaces',this.config.space,'transcripts',entry.id);
  const previous=await s.getDocFromServer(ref),prior=previous.data();
  if(prior?.hash===packet.hash)return;
  if(prior&&prior.hash!==entry.baseHash)throw Error('共享逐字稿已有另一份修订。请先获取最新稿后再保存；本机文件和待同步修订均保留。');
  const revision='r-'+packet.hash.slice(0,32);
  // Bound each commit below Firestore's 10 MiB request limit. The manifest stays unchanged until all parts exist.
  for(let offset=0;offset<packet.parts.length;offset+=20){
   if(generation!==this.generation)throw Error('账号已切换，本次同步已停止。');
   const batch=s.writeBatch(this.db);packet.parts.slice(offset,offset+20).forEach((payload,n)=>batch.set(s.doc(ref,'revisions',revision,'parts',String(offset+n)),{payload}));await batch.commit();
  }
  if(generation!==this.generation)throw Error('账号已切换，本次同步已停止。');
  await s.runTransaction(this.db,async transaction=>{
   const latest=await transaction.get(ref),value=latest.data();if(value?.hash===packet.hash)return;
   if((value?.hash||null)!==(prior?.hash||null))throw Error('云端逐字稿已改变，本机修订保留，请重新核对。');
   transaction.set(ref,{revision,hash:packet.hash,parts:packet.parts.length,bytes:packet.bytes,matchKey:packet.matchKey,
    title:packet.document.title,filename:packet.document.audio.filename,language:packet.document.language,duration:packet.document.duration,
    previousRevision:prior?.revision||'',previousParts:prior?.parts||0,updatedAt:s.serverTimestamp()});
  });
  // Keep the current and preceding complete version; don't accumulate every successful correction.
  if(prior?.previousRevision&&prior.previousRevision!==revision&&prior.previousRevision!==prior.revision){
   try{const cleanup=s.writeBatch(this.db);for(let n=0;n<prior.previousParts;n++)cleanup.delete(s.doc(ref,'revisions',prior.previousRevision,'parts',String(n)));await cleanup.commit();}catch(error){console.warn('旧版逐字稿稍后清理',error.code);}
  }
 }
 async load(item){
  const key='sync-received/'+this.scope+'/'+item.id,cached=(await this.read('settings',key))?.value;
  if(cached?.manifest?.hash===item.hash)return cached.document;
  const s=this.sdk,parts=[];
  for(let offset=0;offset<item.parts;offset+=4){const chunk=await Promise.all(Array.from({length:Math.min(4,item.parts-offset)},(_,n)=>s.getDoc(s.doc(this.db,'spaces',this.config.space,'transcripts',item.id,'revisions',item.revision,'parts',String(offset+n)))));for(const part of chunk){if(!part.exists())throw Error('云端逐字稿尚未完整，原稿保留。');parts.push(part.data().payload);}}
  const document=await unpackTranscript(item,parts);await this.write('settings',{id:key,value:{manifest:item,document}});return document;
 }
 async drain(){
  if(this.receivePromise)return this.receivePromise;if(!this.ready)return;
  const generation=this.generation,scope=this.scope;
  this.receivePromise=(async()=>{
   const episodes=await this.all('episodes');
   for(const item of [...this.items]){
    if(generation!==this.generation)return;
    const match=matchingEpisode(item,episodes,scope),e=match.episode;
    if(!e||match.needsConfirmation||e.cloudTranscript?.hash===item.hash||!this.canApply(e.id))continue;
    // A writer's pending local revision must never be overwritten by its own listener.
    if(this.pending.some(p=>p.id===item.id))continue;
    const document=await this.load(item);if(generation!==this.generation||!this.canApply(e.id))continue;
    await this.apply(e.id,document,{scope,id:item.id,hash:item.hash,revision:item.revision},{initial:!match.bound});this.update();
   }
  })().finally(()=>{this.receivePromise=null;});return this.receivePromise;
 }
 async associate(item,episodeId){
  if(!this.ready)throw Error('请先登录共享书库。');if(!this.canApply(episodeId,{manual:true}))throw Error('请暂停播放后再关联。');
  const generation=this.generation,scope=this.scope,document=await this.load(item);if(generation!==this.generation)throw Error('账号已切换，请重新关联。');
  if(!this.canApply(episodeId,{manual:true}))throw Error('音频正在播放，请暂停后再关联。');
  await this.apply(episodeId,document,{scope,id:item.id,hash:item.hash,revision:item.revision},{initial:true,confirmed:true});this.update();
 }
 async refresh(){if(this.user&&!this.stop){await this.authChanged(this.user);return;}if(!this.ready)return;await this.flush();await this.drain();}
}
