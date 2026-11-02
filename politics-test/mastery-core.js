(function(root){
'use strict';
const DAYS=[1,3,7,14,30,60],LABELS={unlearned:'未学习',weak:'不熟',hazy:'模糊',familiar:'熟悉'};
function dueAt(start,days){const d=new Date(start);d.setHours(0,0,0,0);return d.getTime()+days*86400000;}
function validPasses(m){return (m.reviewPasses||[]).filter(p=>p&&DAYS.includes(p.day)&&Number.isFinite(p.ts)&&p.ts>=dueAt(m.cycleStart,p.day)&&p.cycleStart===m.cycleStart);}
// Old scheduling can skip overdue checkpoints; stage alone is never pass evidence.
function evidence(m,history=[],id){
 if(!m||m.phase==='learning')return {passes:[],known:true,source:'current'};
 if(Array.isArray(m.reviewPasses))return {passes:validPasses(m),known:m.evidenceComplete!==false,source:'recorded'};
 if(m.phase==='review'&&m.stage===0)return {passes:[],known:true,source:'initial'};
 if(!Number.isFinite(m.cycleStart)||!['review','mastered'].includes(m.phase))return {passes:[],known:false,source:'legacy'};
 const events=history.filter(h=>String(h.id)===String(id)&&Number.isFinite(h.ts)).sort((a,b)=>a.ts-b.ts);
 const anchor=events.filter(h=>h.correct===true&&h.ts<=m.cycleStart&&m.cycleStart-h.ts<=1000).at(-1);
 if(!anchor)return {passes:[],known:false,source:'legacy'};
 let stage=0,phase='review';const passes=[];
 for(const h of events){
  if(h.ts<=m.cycleStart)continue;
  if(h.correct!==true)return {passes:[],known:false,source:'legacy'};
  if(phase==='mastered'||h.ts<dueAt(m.cycleStart,DAYS[stage]))continue;
  passes.push({day:DAYS[stage],ts:h.ts,cycleStart:m.cycleStart});stage++;
  while(stage<DAYS.length&&dueAt(m.cycleStart,DAYS[stage])<=h.ts)stage++;
  if(stage>=DAYS.length)phase='mastered';
 }
 if(phase!==m.phase||stage!==m.stage)return {passes:[],known:false,source:'legacy'};
 return {passes,known:true,source:'history'};
}
function describe(m,history=[],id,now=Date.now()){
 if(!m)return {key:'unlearned',label:LABELS.unlearned,passedDay:0,days:[],known:true,due:false,overdue:false,nextDay:null,dueTs:null};
 const e=evidence(m,history,id),days=[...new Set(e.passes.map(p=>p.day))].sort((a,b)=>a-b),passedDay=m.phase==='learning'?0:Math.max(0,...days);
 const key=passedDay>=14?'familiar':passedDay>=3?'hazy':'weak',validDue=m.phase==='review'&&Number.isFinite(m.dueTs)&&m.dueTs>0;
 return {key,label:LABELS[key],passedDay,days,known:e.known,source:e.source,due:!!(validDue&&m.dueTs<=now),overdue:!!(validDue&&m.dueTs<new Date(now).setHours(0,0,0,0)),nextDay:m.phase==='review'&&Number.isInteger(m.stage)?DAYS[m.stage]??null:null,dueTs:validDue?m.dueTs:null,phase:m.phase};
}
function summarize(questions,memory={},history=[],now=Date.now()){
 const counts={unlearned:0,weak:0,hazy:0,familiar:0,due:0,unknown:0};
 for(const q of questions){const d=describe(memory?.[q.id],history,q.id,now);counts[d.key]++;if(d.due)counts.due++;if(!d.known)counts.unknown++;}
 const entered=questions.length-counts.unlearned;const percentages={};for(const key of ['weak','hazy','familiar'])percentages[key]=entered?Math.round(counts[key]/entered*100):0;
 return {counts,entered,total:questions.length,percentages};
}
function forecast(questions,memory={},now=Date.now()){
 const day=86400000,offset=8*3600000,today=Math.floor((now+offset)/day)*day-offset,tomorrow=today+day,end=tomorrow+day,seen=new Set(),tomorrowIds=[],dueIds=[];
 for(const q of questions){const id=String(q.id);if(seen.has(id))continue;seen.add(id);const m=memory?.[q.id];if(!m||m.phase!=='review'||!Number.isFinite(m.dueTs)||m.dueTs<=0||m.stage>=DAYS.length)continue;
 if(m.dueTs<=now)dueIds.push(q.id);if(m.dueTs>=tomorrow&&m.dueTs<end)tomorrowIds.push(q.id);}
 return {tomorrowIds,dueIds,tomorrowCount:tomorrowIds.length,dueCount:dueIds.length,tomorrowStart:tomorrow,tomorrowEnd:end};
}
const api={forecast,DAYS,LABELS,evidence,describe,summarize,dueAt};root.QuizMastery=api;
})(typeof window==='undefined'?globalThis:window);