const incidentRepo=require('../incidents/repository');
const resourceRepo=require('../resources/repository');
function overview(){const incidents=incidentRepo.list();const bookings=resourceRepo.bookings();const now=Date.now();let atRisk=0,breached=0;for(const i of incidents){if(['Resolved','Closed'].includes(i.status))continue;const elapsed=(now-new Date(i.createdAt).getTime())/3600000;const ratio=elapsed/(i.slaHours||24);if(ratio>=1)breached++;else if(ratio>=0.75)atRisk++;}const open=incidents.filter(i=>!['Resolved','Closed'].includes(i.status)).length;const resolvedToday=incidents.filter(i=>i.resolvedAt&&new Date(i.resolvedAt).toDateString()===new Date().toDateString()).length;const utilization=bookings.length?Math.min(100,Math.round((bookings.filter(b=>new Date(b.end_time)>new Date()).length/bookings.length)*100)):0;const health=Math.max(0,Math.min(100,100-(breached*10)-(atRisk*3)));return{openIncidents:open,slaAtRisk:atRisk,breached,escalated:incidentRepo.escalatedOpenIds().length,resolvedToday,roomUtilization:utilization,campusHealth:health};}
function activity(){return incidentRepo.list().slice(0,12).map(i=>({type:'incident',id:i.id,title:i.title,status:i.status,department:i.department,at:i.updatedAt}));}
function departmentLoad(){const counts={};incidentRepo.list().forEach(i=>{if(!['Resolved','Closed'].includes(i.status))counts[i.department]=(counts[i.department]||0)+1;});const max=Math.max(1,...Object.values(counts));return Object.entries(counts).map(([department,count])=>({department,count,percent:Math.round(count/max*100)}));}
function trends(days=14){
  days=Math.min(Math.max(days,2),60);
  const DAY=86400000,startOfToday=new Date().setHours(0,0,0,0);
  const buckets=Array.from({length:days},(_,k)=>({date:new Date(startOfToday-(days-1-k)*DAY).toISOString().slice(0,10),created:0,resolved:0}));
  const at=iso=>{if(!iso)return null;const d=Math.floor((new Date(iso).setHours(0,0,0,0)-(startOfToday-(days-1)*DAY))/DAY);return d>=0&&d<days?buckets[d]:null;};
  const all=incidentRepo.list();
  for(const i of all){const c=at(i.createdAt);if(c)c.created++;const r=at(i.resolvedAt);if(r)r.resolved++;}
  const tally=f=>{const m={};for(const i of all){const k=f(i);if(k)m[k]=(m[k]||0)+1;}return Object.entries(m).map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);};
  const DONE=['Resolved','Closed'];
  const resolved=all.filter(i=>i.resolvedAt&&DONE.includes(i.status));
  const avgHours=resolved.length?resolved.reduce((a,i)=>a+(new Date(i.resolvedAt)-new Date(i.createdAt))/3600000,0)/resolved.length:null;
  return {days:buckets,byStatus:tally(i=>i.status),byCategory:tally(i=>i.subCategory||i.category),bySeverity:tally(i=>i.severity),avgResolutionHours:avgHours==null?null:Number(avgHours.toFixed(1))};
}
module.exports={overview,activity,departmentLoad,trends};
