import {packageTranscript,sha256} from './cloud-transcript.js';

// Draft metadata stays on this device, never in a shared transcript.
export async function markTranscriptDraft(episode,document,scope){
 const packet=await packageTranscript(document),link=episode.cloudTranscript;
 if(link?.scope===scope&&link.hash===packet.hash){const next={...episode};delete next.transcriptDraft;return next;}
 const id=link?.scope===scope?link.id:'t-'+await sha256(document.language+'\n'+packet.matchKey);
 const previous=episode.transcriptDraft;
 return {...episode,transcriptDraft:{scope,id,hash:packet.hash,
  baseHash:previous?.scope===scope&&previous.id===id?previous.baseHash:link?.scope===scope?link.hash:null,changedAt:Date.now()}};
}
export function draftBlocksUpdate(episode,hash){return !!episode.transcriptDraft&&episode.transcriptDraft.hash!==hash;}
export function acknowledgeTranscriptDraft(episode,link){
 const draft=episode.transcriptDraft;
 if(!draft||draft.scope!==link.scope||draft.id!==link.id)return episode;
 const next={...episode,cloudTranscript:{...link}};
 if(draft.hash===link.hash)delete next.transcriptDraft;
 else next.transcriptDraft={...draft,baseHash:link.hash};
 return next;
}
