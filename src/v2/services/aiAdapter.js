const aiService = require('../../services/aiService');
const repo = require('../incidents/repository');

async function triage(text){ return aiService.triageDescription(text); }

async function analyzeIncident(id){
  const incident=repo.get(id); if(!incident)return null;
  const result=await triage(`${incident.title}. ${incident.description}`);
  repo.addAIAnalysis(id,{...result,summary:`${result.category || 'Incident'}${result.subCategory?` / ${result.subCategory}`:''}`});
  return result;
}

function tokens(text='') {
  return new Set(String(text).toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(x=>x.length>2));
}
function similarity(a,b) {
  const A=tokens(`${a.title} ${a.description} ${a.location}`), B=tokens(`${b.title} ${b.description} ${b.location}`);
  if(!A.size || !B.size)return 0;
  let overlap=0; for(const x of A)if(B.has(x))overlap++;
  return overlap/(A.size+B.size-overlap);
}
function duplicates(id,limit=5) {
  const incident=repo.get(id); if(!incident)return null;
  return repo.list().filter(x=>x.id!==id && !['Closed','Rejected'].includes(x.status)).map(x=>({...x,similarity:Number(similarity(incident,x).toFixed(3))})).filter(x=>x.similarity>=0.25).sort((a,b)=>b.similarity-a.similarity).slice(0,Math.min(Number(limit)||5,10));
}
function recommendations(id) {
  const incident=repo.get(id); if(!incident)return null;
  const duplicateList=duplicates(id,3)||[];
  const severity=incident.severity||'Medium';
  const actions=[];
  if(duplicateList.length) actions.push({type:'duplicate-review',priority:'high',text:`Review ${duplicateList.length} similar open incident${duplicateList.length>1?'s':''} before dispatching another team.`});
  if(['High','Critical'].includes(severity)) actions.push({type:'sla',priority:'high',text:'Start the SLA clock immediately and assign an owner with escalation coverage.'});
  if(incident.category==='Security') actions.push({type:'security',priority:'high',text:'Notify Security and preserve incident evidence before closure.'});
  if(incident.category==='IT') actions.push({type:'it',priority:'medium',text:'Capture affected device/service details and attach diagnostic evidence.'});
  if(incident.status==='PendingApproval') actions.push({type:'approval',priority:'medium',text:'Complete the resolution checklist before requesting final approval.'});
  if(!actions.length) actions.push({type:'standard',priority:'low',text:'Confirm ownership, record the next action, and keep the incident timeline updated.'});
  return {incidentId:id,generatedBy:'CampusConnect AI orchestration',recommendations:actions,duplicates:duplicateList.map(x=>({id:x.id,title:x.title,status:x.status,similarity:x.similarity}))};
}
module.exports={triage,analyzeIncident,duplicates,recommendations};
