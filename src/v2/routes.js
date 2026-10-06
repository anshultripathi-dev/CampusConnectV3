const express=require('express');
const incidents=require('./incidents/service');
const resources=require('./resources/service');
const dashboard=require('./dashboard/service');
const notifications=require('./notifications/service');
const ai=require('./services/aiAdapter');
const architecture=require('./architecture/routes');
const auth=require('./auth');
const audit=require('./audit');
const offlineAi=require('./ai');
const attachments=require('./attachments');
const bookingApproval=require('./resources/approval');
const bookingSeries=require('./resources/series');
const comments=require('./comments');
const users=require('./users');
const rateLimit=require('./rateLimit');
const passwordLimiter=rateLimit({max:8,message:'Too many password attempts. Please wait a few minutes.'});
const incidentRepo=require('./incidents/repository');
const router=express.Router();
router.use(auth.requireAuth);
function requireIncidentAccess(req,res,next){const access=incidents.canAccess(req.params.id,req.user);if(!access.exists)return res.status(404).json({error:'Incident not found'});if(!access.allowed)return res.status(403).json({error:'You do not have access to this incident'});next();}

const MANAGEMENT=['Supervisor','FacilitiesHead','SecurityHead','Admin'];
const isManagement=u=>MANAGEMENT.includes(u.role);
// Incidents the signed-in user may see (same scoping as GET /incidents).
function visibleIncidents(user,filters={}){
  const f={...filters};
  if(user.role==='Student') f.reporter=user.id;
  else if(['Maintenance','Security','IT'].includes(user.role)) f.department=user.department;
  const list=incidents.list(f);
  const counts=comments.counts(list.map(i=>i.id),user);
  return list.map(i=>({...i,commentCount:counts[i.id]||0}));
}
const asyncRoute=fn=>(req,res)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>res.status(e.status||500).json({error:e.status?e.message:'Internal error',...(e.conflicts?{conflicts:e.conflicts}:{}),...(e.conflictDates?{conflictDates:e.conflictDates}:{})}));

router.get('/dashboard/overview',(req,res)=>res.json({...dashboard.overview(),pendingBookings:bookingApproval.canApprove(req.user)?bookingApproval.pendingCount():0}));
router.get('/dashboard/activity',(req,res)=>res.json(dashboard.activity()));
router.get('/dashboard/departments',(req,res)=>res.json(dashboard.departmentLoad()));
router.get('/dashboard/trends',(req,res)=>{if(!isManagement(req.user)&&req.user.role==='Student')return res.status(403).json({error:'Staff access required'});res.json(dashboard.trends(Number(req.query.days)||14));});

router.post('/incidents',async(req,res)=>{try{const result=incidents.create({...req.body, reporter:req.user.id, actor:req.user.id});res.status(result.success?201:400).json(result);}catch(e){res.status(400).json({error:e.message});}});
router.get('/incidents',(req,res)=>res.json(visibleIncidents(req.user,req.query)));
router.get('/incidents/rank',(req,res)=>res.json(incidents.rank(req.query.strategy||'sla')));
router.get('/incidents/:id',requireIncidentAccess,(req,res)=>res.json(incidents.get(req.params.id,{role:req.user.role,department:req.user.department})));
router.get('/incidents/:id/history',requireIncidentAccess,(req,res)=>res.json(incidents.history(req.params.id)));
router.get('/incidents/:id/commands',requireIncidentAccess,(req,res)=>res.json(incidents.commandHistory(req.params.id)));
router.post('/incidents/:id/undo',requireIncidentAccess,(req,res)=>{if(!auth.canCommand(req.user.role,'undo'))return res.status(403).json({error:`Role ${req.user.role} cannot undo commands`});const r=incidents.undo(req.params.id,req.user.id);res.status(r.error?(r.status||400):200).json(r);});
router.get('/incidents/:id/ai',requireIncidentAccess,(req,res)=>res.json(incidents.ai(req.params.id)));
router.post('/incidents/:id/ai',requireIncidentAccess,async(req,res)=>{try{const result=await ai.analyzeIncident(req.params.id);if(!result)return res.status(404).json({error:'Incident not found'});res.json(result);}catch(e){res.status(500).json({error:e.message});}});
router.get('/incidents/:id/ai/duplicates',requireIncidentAccess,(req,res)=>{const result=ai.duplicates(req.params.id,req.query.limit);if(!result)return res.status(404).json({error:'Incident not found'});res.json({duplicates:result});});
router.get('/incidents/:id/ai/recommendations',requireIncidentAccess,(req,res)=>{const result=ai.recommendations(req.params.id);if(!result)return res.status(404).json({error:'Incident not found'});res.json(result);});
router.post('/incidents/:id/command/:action',requireIncidentAccess,(req,res)=>{if(!auth.canCommand(req.user.role,req.params.action))return res.status(403).json({error:`Role ${req.user.role} cannot perform ${req.params.action}`});const r=incidents.command(req.params.id,req.params.action,{...req.body,role:req.user.role,actor:req.user.id});res.status(r.error?(r.status||400):200).json(r);});
router.post('/incidents/:id/escalate',requireIncidentAccess,(req,res)=>{if(!['Supervisor','FacilitiesHead','SecurityHead','Admin'].includes(req.user.role))return res.status(403).json({error:'Supervisor or management role required'});const r=incidents.escalate(req.params.id,req.user.role);res.status(r.error?(r.status||400):200).json(r);});
router.post('/incidents/:id/handoff',requireIncidentAccess,(req,res)=>{const cur=incidentRepo.get(req.params.id);if(!isManagement(req.user)&&!(req.user.department&&cur&&cur.department===req.user.department))return res.status(403).json({error:'Only management or the owning department can hand off an incident'});const known=['Maintenance','Security','IT','Facilities'];if(!known.includes(req.body?.toDept))return res.status(400).json({error:'Choose a valid department'});const r=incidents.handoff(req.params.id,req.body.toDept,req.body.reason,req.user.id);res.status(r.error?(r.status||400):200).json(r);});
router.post('/incidents/:id/restore',requireIncidentAccess,(req,res)=>!isManagement(req.user)?res.status(403).json({error:'Management role required'}):res.json(incidents.restore(req.params.id,req.user.id)));
router.post('/incidents/:id/resolve-checklist',requireIncidentAccess,(req,res)=>res.json(incidents.resolveChecklist(req.params.id,req.user.role)));

// ── Offline AI (no network, no API key) ──
router.post('/ai/triage',(req,res)=>{const {title,description}=req.body||{};if(String(title||'').length+String(description||'').length<8)return res.json({suggestion:null,confident:false,reason:'Keep typing to get a suggestion.'});offlineAi.learnFrom(incidentRepo.list());res.json(offlineAi.triage({title:String(title||'').slice(0,200),description:String(description||'').slice(0,2000)}));});
router.post('/ai/similar',(req,res)=>{
  const {title='',description='',location=''}=req.body||{};
  if(String(title).length+String(description).length<8)return res.json({count:0,matches:[]});
  const matches=offlineAi.similarTo({title:String(title).slice(0,200),description:String(description).slice(0,2000),location:String(location).slice(0,200)},incidentRepo.list());
  // Reporters only learn that similar reports exist; staff also see which ones.
  if(req.user.role==='Student')return res.json({count:matches.length,matches:matches.map(m=>({status:m.incident.status,location:m.incident.location,similarity:m.similarity,mine:m.incident.reporter===req.user.id,id:m.incident.reporter===req.user.id?m.incident.id:null,title:m.incident.reporter===req.user.id?m.incident.title:null}))});
  res.json({count:matches.length,matches:matches.map(m=>({id:m.incident.id,title:m.incident.title,status:m.incident.status,location:m.incident.location,similarity:m.similarity}))});
});
router.get('/ai/risk',(req,res)=>res.json(offlineAi.riskMap(visibleIncidents(req.user))));
router.get('/ai/insights',(req,res)=>{
  if(req.user.role==='Student')return res.status(403).json({error:'Staff access required'});
  const list=visibleIncidents(req.user);const risks=offlineAi.riskMap(list);
  const top=list.filter(i=>risks[i.id].score>0).sort((a,b)=>risks[b.id].score-risks[a.id].score).slice(0,5).map(i=>({id:i.id,title:i.title,status:i.status,department:i.department,risk:risks[i.id]}));
  res.json({brief:offlineAi.brief(list),clusters:offlineAi.clusters(list),topRisks:top});
});
router.post('/ai/search',(req,res)=>{const q=String(req.body?.q||'').slice(0,200);const r=offlineAi.search(q,visibleIncidents(req.user),req.user);res.json({description:r.description,filters:r.filters,results:r.results.slice(0,20).map(i=>({id:i.id,title:i.title,status:i.status,severity:i.severity,location:i.location,category:i.category,subCategory:i.subCategory})),total:r.results.length});});

// ── Comments ──
router.get('/incidents/:id/comments',requireIncidentAccess,(req,res)=>res.json(comments.list(req.params.id,req.user)));
router.post('/incidents/:id/comments',requireIncidentAccess,asyncRoute((req,res)=>res.status(201).json(comments.add(req.params.id,req.user,req.body||{}))));
router.post('/incidents/:id/comments/:cid',requireIncidentAccess,asyncRoute((req,res)=>res.json(comments.edit(req.params.cid,req.user,req.body?.body))));
router.delete('/incidents/:id/comments/:cid',requireIncidentAccess,asyncRoute((req,res)=>res.json(comments.remove(req.params.cid,req.user))));

// ── Photo attachments ──
router.get('/incidents/:id/attachments',requireIncidentAccess,(req,res)=>res.json(attachments.list(req.params.id)));
router.post('/incidents/:id/attachments',requireIncidentAccess,asyncRoute((req,res)=>{const a=attachments.add(req.params.id,req.body||{},req.user.id);audit.write({actor:req.user.id,action:'INCIDENT_PHOTO_ADDED',entityType:'incident',entityId:req.params.id,afterState:{attachment:a.id}});res.status(201).json(a);}));
router.get('/incidents/:id/attachments/:aid',requireIncidentAccess,(req,res)=>{const f=attachments.file(req.params.id,req.params.aid);if(!f)return res.status(404).json({error:'Photo not found'});res.set({'Content-Type':f.row.mime,'Cache-Control':'private, max-age=3600','Content-Disposition':'inline'});res.sendFile(f.abs);});
router.delete('/incidents/:id/attachments/:aid',requireIncidentAccess,asyncRoute((req,res)=>{attachments.remove(req.params.id,req.params.aid,req.user);res.json({success:true});}));
router.get('/analytics/report/:type',(req,res)=>res.json(incidents.report(req.params.type)));

router.get('/resources/rooms',(req,res)=>res.json(resources.rooms()));
router.get('/resources/equipment',(req,res)=>res.json(resources.equipment()));
router.get('/resources/campus',(req,res)=>res.json(resources.campus()));
router.get('/resources/equipment-stats',(req,res)=>res.json(resources.stats()));
router.get('/bookings',(req,res)=>res.json(bookingApproval.enrich(['Supervisor','FacilitiesHead','SecurityHead','Admin'].includes(req.user.role)?resources.list():resources.list(req.user.id),req.user)));
router.get('/bookings/conflicts',(req,res)=>{const a=toUtc(req.query.start),b=toUtc(req.query.end);if(!a||!b)return res.json([]);res.json(resources.conflicts(req.query.room,a,b));});
const toUtc=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();};
router.post('/bookings/preview',asyncRoute((req,res)=>{const b=req.body||{};res.json(bookingSeries.preview(String(b.room||''),b.occurrences||[{startTime:b.startTime,endTime:b.endTime}]));}));
router.post('/bookings',asyncRoute((req,res)=>{
  const b=req.body||{};
  if(Array.isArray(b.occurrences)){const r=bookingSeries.create({...b,room:String(b.room||'')},req.user,{skipConflicts:!!b.skipConflicts});return res.status(201).json(r);}
  const startTime=toUtc(b.startTime),endTime=toUtc(b.endTime);
  if(!startTime||!endTime)return res.status(400).json({error:'Enter a valid start and end time'});
  if(new Date(startTime)<new Date(Date.now()-5*60000))return res.status(400).json({error:'Start time cannot be in the past'});
  let r;try{r=resources.create({...b,startTime,endTime,requester:req.user.id});}catch(e){return res.status(400).json({error:e.message});}
  if(r.error)return res.status(r.status||400).json(r);
  if(bookingApproval.canApprove(req.user)){const approved=bookingApproval.autoApprove(r.id,req.user);return res.status(201).json({...r,status:approved.status});}
  res.status(201).json(r);
}));
router.post('/bookings/:id/:action(approve|reject|cancel)',asyncRoute((req,res)=>res.json(req.body?.scope==='series'?bookingApproval.decideSeries(req.params.id,req.params.action,req.user,req.body?.note):bookingApproval.decide(req.params.id,req.params.action,req.user,req.body?.note))));

router.get('/audit', (req,res)=>{if(!['Supervisor','FacilitiesHead','SecurityHead','Admin'].includes(req.user.role))return res.status(403).json({error:'Governance role required'});res.json(audit.list(req.query));});


router.get('/users',(req,res)=>{if(!users.canManageUsers(req.user))return res.status(403).json({error:'Only Admin or Facilities Head can manage users'});res.json(users.list());});
router.post('/users/:id/role',asyncRoute((req,res)=>res.json(users.setRole(req.params.id,req.body||{},req.user))));
router.post('/users/:id/reset-password',asyncRoute((req,res)=>res.json(users.resetPassword(req.params.id,req.user))));
router.post('/account/password',passwordLimiter,asyncRoute((req,res)=>res.json(users.changePassword(req.user,req.body?.currentPassword,req.body?.newPassword,req.authToken))));
router.get('/staff',(req,res)=>{
  const { db }=require('./infrastructure/database');
  const rows=db.prepare(`SELECT u.id,u.name,u.email,u.role,d.name AS department FROM users u LEFT JOIN departments d ON d.id=u.department_id WHERE u.role!='Student' ORDER BY d.name,u.name`).all();
  res.json(rows);
});
router.post('/notifications/read-all',(req,res)=>{notifications.markAllReadFor(req.user);res.json({success:true});});

router.get('/notifications',(req,res)=>res.json(notifications.listFor(req.user)));
router.post('/notifications/:id/read',(req,res)=>res.json(notifications.markReadFor(req.params.id,req.user)));
router.use('/architecture',architecture);

module.exports=router;
