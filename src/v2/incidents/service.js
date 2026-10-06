const CampusRegistry = require('../../patterns/creational/singleton');
const { TicketSubmissionFacade } = require('../../patterns/structural/facade');
const { SecureTicketProxy } = require('../../patterns/structural/proxy');
const { RuleInterpreter, DEFAULT_RULES } = require('../../patterns/behavioral/interpreter');
const { TicketRanker, STRATEGIES } = require('../../patterns/behavioral/strategy');
const { TicketHistoryIterator } = require('../../patterns/behavioral/iterator');
const { TicketStateMachine } = require('../../patterns/behavioral/state');
const { buildEscalationChain } = require('../../patterns/behavioral/chainOfResponsibility');
const { DepartmentMediator } = require('../../patterns/behavioral/mediator');
const { TicketCareTaker } = require('../../patterns/behavioral/memento');
const { getResolutionProcess } = require('../../patterns/behavioral/templateMethod');
const { generateReport, MaintenanceCostVisitor, SafetyIncidentVisitor, RoomUtilizationVisitor } = require('../../patterns/behavioral/visitor');
const aiService = require('../services/aiAdapter');
const repo = require('./repository');
const eventBus = require('../infrastructure/eventBus');
const tracer = require('../infrastructure/patternTracer');
const notifications = require('../notifications/service');
const audit = require('../audit');
const { syncSequences } = require('../infrastructure/sequences');

const registry = CampusRegistry.getInstance();
const facade = new TicketSubmissionFacade();
const interpreter = new RuleInterpreter(DEFAULT_RULES);
const ranker = new TicketRanker(STRATEGIES.sla);
const mediator = new DepartmentMediator();
const caretaker = new TicketCareTaker();
['Maintenance','Security','IT','Facilities'].forEach(dept=>mediator.register(dept,(ticket,reason)=>{const staff=registry.findStaffByDepartment(dept)[0];if(staff)ticket.assignedTo=staff.id;return `${dept} received ticket (reason: ${reason}).`; }));

// Reporters are told when their report moves, unless they made the change themselves.
function notifyReporter(ticket, title, message, actor) {
  if (!ticket.reporter || ticket.reporter === actor) return;
  notifications.notify({ recipient: ticket.reporter, title, message, referenceType: 'incident', referenceId: ticket.id });
}
function persistPatternTicket(ticket) {
  ticket.updatedAt = new Date().toISOString();
  return repo.save(ticket);
}
function create(payload) {
  const trace=tracer.start('CREATE_INCIDENT',{category:payload.category,location:payload.location});
  try {
    syncSequences();
    tracer.enter(trace,'Facade','TicketSubmissionFacade');
    const result=facade.submitTicket(payload); tracer.exit(trace,'Facade');
    if(!result.success) { tracer.finish(trace,'failed'); return result; }
    const ticket=result.ticket;
    if(repo.get(ticket.id)) throw new Error(`ID collision: ${ticket.id} already exists`);
    tracer.enter(trace,'Interpreter','RuleInterpreter');
    const route=interpreter.route({category:ticket.category,subCategory:ticket.subCategory,severity:ticket.severity});
    tracer.exit(trace,'Interpreter'); if(route) ticket.suggestedRoute=route;
    tracer.enter(trace,'Repository','IncidentRepository'); const persisted = persistPatternTicket(ticket); repo.addEvent(ticket.id,{eventType:'CREATED',toStatus:ticket.state.current,actor:payload.reporter||'system',message:'Incident submitted'});
    audit.write({actor:payload.actor||payload.reporter,action:'INCIDENT_CREATED',entityType:'incident',entityId:ticket.id,afterState:ticket}); tracer.exit(trace,'Repository');
    tracer.enter(trace,'Memento','TicketCareTaker'); caretaker.save(ticket); repo.snapshot(ticket.id,ticket); tracer.exit(trace,'Memento');
    // State-pattern instances retain a reference to their ticket. Never send that
    // domain object across Socket.IO: it is circular and cannot be serialized.
    const eventTicket=serialize(persisted);
    tracer.enter(trace,'Observer','EventBus'); eventBus.publish('incident.created',{ticket:eventTicket}); notifications.notify({recipient:ticket.department||'operations',title:`${ticket.id} created`,message:ticket.title,referenceType:'incident',referenceId:ticket.id}); tracer.exit(trace,'Observer');
    tracer.finish(trace); return {success:true,ticket:serialize(persisted),traceId:trace};
  } catch(e){ tracer.finish(trace,'failed'); throw e; }
}
function get(id,requester={}) { const ticket=repo.get(id); if(!ticket)return null; const proxy=new SecureTicketProxy({...ticket,state:{current:ticket.status,log:repo.history(id)}}); const view=proxy.view(requester); return view.access==='granted'?{...view,ticket:serialize(view.ticket)}:view; }
function canAccess(id,user={}){const ticket=repo.get(id);if(!ticket)return{allowed:false,exists:false};const management=['Supervisor','FacilitiesHead','SecurityHead','Admin'].includes(user.role);const allowed=management||(user.role==='Student'&&ticket.reporter===user.id)||(['Maintenance','Security','IT'].includes(user.role)&&ticket.department===user.department);return{allowed,exists:true,ticket};}
function list(filters){return repo.list(filters).map(serialize);}
function command(id,action,payload={}){
  const current=repo.get(id); if(!current)return {error:'Incident not found',status:404};
  const trace=tracer.start(action.toUpperCase(),{incidentId:id});
  const before=current.status;
  try {
    tracer.enter(trace,'Command','TicketCommandInvoker');
    const ticket={...current}; ticket.state=new TicketStateMachine(ticket,current.status); ticket.state.log=repo.history(id).map(e=>({state:e.toStatus||e.event,at:e.at}));
    const commands=require('../../patterns/behavioral/command'); let c;
    if(action==='assign') { const staffId=payload.staffId || registry.findStaffByDepartment(ticket.department||'Maintenance')[0]?.id; if(!staffId) return {error:'No staff member available for this department',status:409}; c=new commands.AssignCommand(ticket,staffId); } else if(action==='start') c=new commands.StartCommand(ticket); else if(action==='markDone') c=new commands.MarkDoneCommand(ticket,payload.note||''); else if(action==='approve') c=new commands.ApproveCommand(ticket,payload.resolutionNote||''); else if(action==='sendBack') c=new commands.SendBackCommand(ticket,payload.reason||'Needs more work'); else if(action==='resolve') c=new commands.ResolveCommand(ticket,payload.resolutionNote||''); else if(action==='close') c=new commands.CloseCommand(ticket); else if(action==='reopen') c=new commands.ReopenCommand(ticket); else if(action==='reject') c=new commands.RejectCommand(ticket,payload.reason||'Not specified'); else {tracer.finish(trace,'failed');return{error:`Unknown action: ${action}`,status:400};}
    const invoker=new commands.TicketCommandInvoker(); const message=invoker.run(c); tracer.exit(trace,'Command');
    // Keep resolvedAt in sync with the lifecycle so dashboards (e.g. "Resolved today") are accurate.
    if(ticket.state.current==='Resolved') ticket.resolvedAt=ticket.resolvedAt||new Date().toISOString();
    else if(['Reopened','InProgress','Assigned'].includes(ticket.state.current)) ticket.resolvedAt=null;
    const updated=repo.save(ticket); repo.addEvent(id,{eventType:action.toUpperCase(),actor:payload.actor||payload.role||'system',fromStatus:before,toStatus:updated.status,message}); repo.snapshot(id,updated);
    repo.recordCommand({incidentId:id,actor:payload.actor||payload.role,action,beforeState:current,afterState:updated});
    audit.write({actor:payload.actor||payload.role,action:`INCIDENT_${action.toUpperCase()}`,entityType:'incident',entityId:id,beforeState:current,afterState:updated});
    tracer.enter(trace,'Observer','EventBus'); eventBus.publish('incident.updated',{incident:updated,action}); notifyReporter(updated,`${id} updated`,`Your report is now ${updated.status}${payload.reason?`: ${payload.reason}`:''}`,payload.actor); notifications.notify({recipient:updated.assignedTo||updated.department||'operations',title:`${id} updated`,message:`Status: ${updated.status}`,referenceType:'incident',referenceId:id}); tracer.exit(trace,'Observer'); tracer.finish(trace);
    return {success:true,message,ticket:serialize(updated),traceId:trace};
  } catch(e){tracer.finish(trace,'failed');return{error:e.message,status:409,traceId:trace};}
}
function escalate(id,role){const t=repo.get(id);if(!t)return{error:'Incident not found',status:404};const hours=(Date.now()-new Date(t.createdAt).getTime())/3600000;const result=buildEscalationChain().handle({...t,status:t.status},hours);repo.addEvent(id,{eventType:'ESCALATED',actor:role||'system',message:result.message||'Escalation evaluated'}); audit.write({actor:role,action:'INCIDENT_ESCALATION',entityType:'incident',entityId:id,beforeState:t,afterState:{...t,escalation:result}});return{...result,hoursOpen:Number(hours.toFixed(2))};}
function handoff(id,toDept,reason,actor){
  const t=repo.get(id);if(!t)return{error:'Incident not found',status:404};
  const before={...t};const note=String(reason||'').trim().slice(0,200)||'No reason given';
  if(t.department===toDept)return{error:`Already with ${toDept}`,status:409};
  const result=mediator.handoff(t,t.department,toDept,note);
  t.assignedTo=null; // the previous department's assignee no longer owns it
  persistPatternTicket(t);
  const message=`Handed off from ${before.department||'unassigned'} to ${toDept}: ${note}`;
  repo.addEvent(id,{eventType:'HANDOFF',actor:actor||'system',message});
  audit.write({actor,action:'INCIDENT_HANDOFF',entityType:'incident',entityId:id,beforeState:before,afterState:t});
  const updated=repo.get(id);
  eventBus.publish('incident.updated',{incident:updated,action:'handoff'});
  notifications.notify({recipient:toDept,title:`${id} handed off to ${toDept}`,message:note,referenceType:'incident',referenceId:id});
  notifyReporter(updated,`${id} updated`,`Your report was passed to ${toDept}`,actor);
  return{success:true,message,ticket:serialize(updated),from:before.department,to:toDept};
}
function history(id){return repo.history(id);}
function commandHistory(id,options={}) { return repo.commandHistory(id,options); }
function undo(id, actor='system') {
  const current=repo.get(id); if(!current)return{error:'Incident not found',status:404};
  const command=repo.latestUndoableCommand(id);
  if(!command)return{error:'No undoable command remains for this incident',status:409};
  if(JSON.stringify(command.afterState)!==JSON.stringify(current)) return {error:'Undo blocked because the incident changed after this command',status:409};
  repo.snapshot(id,current);
  const restored=repo.save({...command.beforeState,updatedAt:new Date().toISOString()});
  repo.markCommandUndone(command.id);
  repo.addEvent(id,{eventType:'COMMAND_UNDONE',actor,message:`Undid ${command.action}`,fromStatus:current.status,toStatus:restored.status,metadata:{commandId:command.id,action:command.action}});
  audit.write({actor,action:'INCIDENT_COMMAND_UNDONE',entityType:'incident',entityId:id,beforeState:current,afterState:restored});
  eventBus.publish('incident.updated',{incident:restored,action:'undo',undid:command.action});
  notifications.notify({recipient:restored.assignedTo||restored.department||'operations',title:`${id} command undone`,message:`Undid ${command.action}`,referenceType:'incident',referenceId:id});
  return {success:true,message:`Undid ${command.action}`,ticket:serialize(restored),undoneCommand:command.id};
}
function rank(strategyName='sla'){const s=STRATEGIES[strategyName]||STRATEGIES.sla;ranker.setStrategy(s);const tickets=repo.list();return ranker.rank(tickets,t=>(Date.now()-new Date(t.createdAt).getTime())/3600000).map(x=>({ticket:serialize(x.ticket),score:Number(x.score.toFixed(2))}));}
function resolveChecklist(id,role){const t=repo.get(id);if(!t)return{error:'Incident not found',status:404};return{steps:getResolutionProcess(t.category).run({...t,status:t.status})};}
function report(type){const tickets=repo.list();const bookings=require('../resources/repository').bookings();let visitor;if(type==='maintenance-cost')visitor=new MaintenanceCostVisitor();else if(type==='safety-incidents')visitor=new SafetyIncidentVisitor();else if(type==='room-utilization')visitor=new RoomUtilizationVisitor();else return{error:'Unknown report type'};return generateReport(visitor,tickets,bookings);}
function restore(id,actor='system'){const snap=repo.latestSnapshot(id);const current=repo.get(id);if(!snap||!current)return{success:false,message:'No snapshot to restore'};const restored=repo.save({...snap,updatedAt:new Date().toISOString()});repo.addEvent(id,{eventType:'SNAPSHOT_RESTORED',actor,message:'Previous snapshot restored',fromStatus:current.status,toStatus:restored.status});audit.write({actor,action:'INCIDENT_SNAPSHOT_RESTORED',entityType:'incident',entityId:id,beforeState:current,afterState:restored});eventBus.publish('incident.updated',{incident:restored,action:'restore'});return{success:true,ticket:serialize(restored)};}
function ai(id){return repo.aiAnalysis(id);}
function serialize(t){return t?{...t,status:t.status,stateLog:repo.history(t.id)}:t;}

module.exports={create,get,canAccess,list,command,commandHistory,undo,escalate,handoff,history,rank,resolveChecklist,report,restore,ai};
