const express=require('express');
const tracer=require('../infrastructure/patternTracer');
const router=express.Router();
const PATTERNS={
  creational:[['Singleton','Campus registry and shared configuration'],['Abstract Factory','Incident family components'],['Factory Method','Specialized reports'],['Builder','Complex booking construction'],['Prototype','Recurring booking templates']],
  structural:[['Adapter','Legacy university record integration'],['Bridge','Notification channel abstraction'],['Composite','Campus → building → floor → room hierarchy'],['Decorator','Dynamic incident policies and priority flags'],['Facade','Incident submission orchestration'],['Flyweight','Shared equipment metadata'],['Proxy','Sensitive incident access control']],
  behavioral:[['Chain of Responsibility','SLA escalation chain'],['Command','Incident operations with undo semantics'],['Interpreter','Configurable routing rules'],['Iterator','Incident history/resource traversal'],['Mediator','Department handoff coordination'],['Memento','Incident state snapshots'],['Observer','Domain events and real-time notifications'],['State','Incident lifecycle'],['Strategy','Queue priority ranking'],['Template Method','Resolution workflows'],['Visitor','Cross-domain analytics']]
};
router.get('/patterns',(req,res)=>res.json({total:23,implemented:23,...PATTERNS}));
router.get('/traces',(req,res)=>res.json(tracer.list().slice(0,50)));
router.get('/traces/:id',(req,res)=>{const x=tracer.get(req.params.id);if(!x)return res.status(404).json({error:'Trace not found'});res.json(x);});
router.get('/health',(req,res)=>res.json({architecture:'modular-monolith',database:'sqlite',realTime:'event-bus-ready',patternCount:23}));
module.exports=router;
