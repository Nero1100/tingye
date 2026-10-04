// Keep recognized text reviewable even when the model misses timestamp tokens.
// Estimated boundaries are never presented as measured alignment.
export function speechTimeline(result,duration){
 if(!Number.isFinite(duration)||duration<=0)throw Error('音频时长无效，原稿保留。');
 const full=typeof result?.text==='string'?result.text.trim():'';
 if(!full)throw Error('没有识别出日语，请检查音频。');
 let rows=(Array.isArray(result.chunks)?result.chunks:[]).filter(c=>typeof c?.text==='string'&&c.text.trim()).map(c=>({text:c.text.trim(),timestamp:Array.isArray(c.timestamp)?[c.timestamp[0]??null,c.timestamp[1]??null]:[null,null]}));
 const fallback=()=>{
  return [{text:full,start:0,end:duration,segmentTimingEstimated:true,transcriptionWarning:'模型没有返回可靠时间轴，已保留识别文字并估算时间。请试听并调整断句。'}];
 };
 if(!rows.length||rows.map(c=>c.text).join('').replace(/\s/gu,'')!==full.replace(/\s/gu,''))return fallback();
 let estimated=rows.map(()=>false);
 const times=rows.flatMap((c,i)=>c.timestamp.map(v=>{
  if(v==null){estimated[i]=true;return null;}
  if(!Number.isFinite(v)||v<-.15||v>duration+1)return NaN;
  const time=Math.max(0,Math.min(duration,v));if(time!==v)estimated[i]=true;return time;
 }));
 if(times.some(Number.isNaN)||times.every(v=>v===null))return fallback();
 if(times[0]===null)times[0]=0;
 if(times.at(-1)===null)times[times.length-1]=duration;
 for(let i=0;i<rows.length;i++){
  const a=i*2,b=a+1;
  if(times[a]===null&&i&&times[a-1]!==null)times[a]=times[a-1];
  if(times[b]===null&&i<rows.length-1&&times[b+1]!==null)times[b]=times[b+1];
 }
 // Missing boundaries interpolate only within surrounding model anchors.
 for(let i=0;i<times.length;i++)if(times[i]===null){
  const from=i-1;let to=i;while(times[to]===null)to++;
  if(times[to]<times[from])return fallback();
  for(let j=i;j<to;j++)times[j]=times[from]+(times[to]-times[from])*(j-from)/(to-from);
  i=to-1;
 }
 for(let i=0;i<rows.length;i++){
  const a=i*2,b=a+1;if(times[b]<=times[a])return fallback();
  if(i&&times[a]<times[a-1]){
   const overlap=times[a-1]-times[a],boundary=(times[a-1]+times[a])/2;
   if(overlap>2||boundary<=times[a-2]||boundary>=times[b])return fallback();
   times[a-1]=times[a]=boundary;estimated[i-1]=estimated[i]=true;
  }
 }
 return rows.map((c,i)=>({text:c.text,start:times[i*2],end:times[i*2+1],segmentTimingEstimated:estimated[i],...(estimated[i]?{transcriptionWarning:'部分时间戳缺失或重叠，已补齐或调整；请试听校对。'}:{})}));
}
