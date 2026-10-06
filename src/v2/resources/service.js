const CampusRegistry=require('../../patterns/creational/singleton');
const {BookingBuilder}=require('../../patterns/creational/builder');
const {BookingTemplateRegistry}=require('../../patterns/creational/prototype');
const {EquipmentFlyweightFactory}=require('../../patterns/structural/flyweight');
const {LegacyIdCardAdapter}=require('../../patterns/structural/adapter');
const repo=require('./repository');
const tracer=require('../infrastructure/patternTracer');
const notifications=require('../notifications/service');
const audit=require('../audit');
const eventBus=require('../infrastructure/eventBus');
const {syncSequences}=require('../infrastructure/sequences');
const registry=CampusRegistry.getInstance();
const templates=new BookingTemplateRegistry();
const flyweights=new EquipmentFlyweightFactory(registry.equipment);
const adapter=new LegacyIdCardAdapter();
function formatWhen(iso){return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function create(payload){const trace=tracer.start('CREATE_BOOKING',{room:payload.room});try{tracer.enter(trace,'Builder','BookingBuilder');const booking=new BookingBuilder().setRoom(payload.room).setTimeSlot(payload.startTime,payload.endTime).setAttendees(payload.attendees||0).setPurpose(payload.purpose||'').setRecurring(!!payload.recurring);(payload.equipment||[]).forEach(e=>booking.addEquipment(e));const built=booking.build();
    if (!built.room || !built.startTime || !built.endTime) throw new Error('Room, start time and end time are required');
    if (new Date(built.endTime) <= new Date(built.startTime)) throw new Error('End time must be after start time');
    if (Number(built.attendees||0) < 1) throw new Error('At least one attendee is required');
    const roomRow = repo.rooms().find(r => r.code === built.room);
    if (!roomRow) throw new Error(`Unknown room ${built.room}`);
    if (Number(built.attendees) > Number(roomRow.capacity)) throw new Error(`${built.room} seats ${roomRow.capacity}; ${built.attendees} attendees will not fit`);
    tracer.exit(trace,'Builder');tracer.enter(trace,'Adapter','LegacyIdCardAdapter');const requesterProfile=payload.cardNo?adapter.getReporterProfile(payload.cardNo):null;tracer.exit(trace,'Adapter');const conflict=repo.conflicts(built.room,built.startTime,built.endTime,null);if(conflict.length){tracer.finish(trace,'conflict');return{error:'This room is already booked for part of that time',status:409,conflicts:conflict.map(x=>({id:x.id,room:x.room,startTime:x.start_time,endTime:x.end_time}))};}tracer.enter(trace,'Flyweight','EquipmentFlyweightFactory');const resolvedEquipment=flyweights.resolveMany(built.equipment);tracer.exit(trace,'Flyweight');syncSequences();const id=registry.newBookingId();const saved=repo.createBooking({id,...built,series:payload.series,requesterId:payload.requester,requesterProfile,status:'PENDING'}); audit.write({actor:payload.requester,action:'BOOKING_CREATED',entityType:'booking',entityId:id,afterState:saved});if(!payload.silent){eventBus.publish('booking.created',{booking:saved});notifications.notify({recipient:'operations',title:'Booking awaiting approval',message:`${saved.room} • ${formatWhen(saved.start_time)} → ${formatWhen(saved.end_time)} • ${saved.purpose||'Campus booking'}`,referenceType:'booking',referenceId:id});notifications.notify({recipient:payload.requester||'operations',title:'Booking requested',message:`${saved.room} • ${formatWhen(saved.start_time)} → ${formatWhen(saved.end_time)} • awaiting approval`,referenceType:'booking',referenceId:id});}tracer.finish(trace);return{...saved,traceId:trace,resolvedEquipment};}catch(e){tracer.finish(trace,'failed');throw e;}}
function list(requesterId=null){return repo.bookings(requesterId);} function rooms(){return repo.rooms();} function equipment(){return repo.equipment();} function conflicts(room,start,end){return repo.conflicts(room,start,end,null);} function campus(){return repo.campusTree();} function stats(){return flyweights.stats();} function templatesList(){return templates.list();}
module.exports={create,list,rooms,equipment,conflicts,campus,stats,templatesList};
