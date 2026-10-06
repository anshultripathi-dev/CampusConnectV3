// ---- OBSERVER-ADJACENT INFRASTRUCTURE: pattern execution tracer ----
// Every domain operation (create/command/booking) narrates which GoF
// patterns it passed through. Traces are kept in-memory for fast access
// during a request, and persisted to sqlite so the Architecture
// Observatory still has something to show after a server restart instead
// of looking broken/empty.
const { db } = require('./database');

const traces = new Map();
const MAX_TRACES = 200;

const upsertStmt = db.prepare(`INSERT INTO pattern_traces(trace_id,operation,context_json,steps_json,status,started_at,completed_at)
  VALUES(?,?,?,?,?,?,?)
  ON CONFLICT(trace_id) DO UPDATE SET steps_json=excluded.steps_json,status=excluded.status,completed_at=excluded.completed_at`);
const deleteStmt = db.prepare('DELETE FROM pattern_traces WHERE trace_id=?');

function persist(trace) {
  try {
    upsertStmt.run(trace.traceId, trace.operation, JSON.stringify(trace.context || {}), JSON.stringify(trace.steps || []), trace.status, trace.startedAt, trace.completedAt || null);
  } catch (_) { /* best-effort persistence; in-memory trace still works */ }
}

// Rehydrate the most recent traces from disk so the Architecture page has
// data immediately after a restart.
(function rehydrate() {
  try {
    const rows = db.prepare('SELECT * FROM pattern_traces ORDER BY started_at DESC LIMIT ?').all(MAX_TRACES);
    for (const r of rows) {
      traces.set(r.trace_id, {
        traceId: r.trace_id,
        operation: r.operation,
        context: JSON.parse(r.context_json || '{}'),
        steps: JSON.parse(r.steps_json || '[]'),
        status: r.status,
        startedAt: r.started_at,
        completedAt: r.completed_at || undefined,
      });
    }
  } catch (_) { /* fresh database, nothing to rehydrate */ }
})();

function start(operation, context = {}) {
  const traceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const trace = { traceId, operation, context, startedAt: new Date().toISOString(), steps: [], status: 'running' };
  traces.set(traceId, trace);
  if (traces.size > MAX_TRACES) {
    const oldestKey = traces.keys().next().value;
    traces.delete(oldestKey);
    deleteStmt.run(oldestKey);
  }
  persist(trace);
  return traceId;
}
function enter(traceId, pattern, component) {
  const trace = traces.get(traceId); if (!trace) return;
  trace.steps.push({ pattern, component, enteredAt: new Date().toISOString() });
  persist(trace);
}
function exit(traceId, pattern, result = 'completed') {
  const trace = traces.get(traceId); if (!trace) return;
  const step = [...trace.steps].reverse().find(s => s.pattern === pattern && !s.exitedAt);
  if (step) { step.exitedAt = new Date().toISOString(); step.result = result; }
  persist(trace);
}
function finish(traceId, status = 'completed') {
  const trace = traces.get(traceId); if (!trace) return;
  trace.status = status; trace.completedAt = new Date().toISOString();
  persist(trace);
}
function get(traceId) { return traces.get(traceId) || null; }
function list() { return [...traces.values()].sort((a,b) => b.startedAt.localeCompare(a.startedAt)); }
module.exports = { start, enter, exit, finish, get, list };
