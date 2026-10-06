// ---- AI SERVICE ----
// Provides two AI-assisted features:
//   1. triageDescription(text)   -> suggests category/subCategory/severity/title
//   2. summarizeTicket(ticket)   -> short staff-facing TL;DR of a ticket
//   3. campusBrief(tickets)      -> one-paragraph situational summary of the board
//
// If ANTHROPIC_API_KEY is set in the environment, these call the real Claude
// API. If it's not set (or the call fails for any reason), every function
// falls back to a transparent rule-based heuristic so the app still works
// out of the box with zero configuration. The response always says which
// path was used via `source: 'claude' | 'heuristic'`.

const MODEL = 'claude-sonnet-4-6';

async function callClaude(systemPrompt, userPrompt, maxTokens = 400) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    return textBlock ? textBlock.text : null;
  } catch (err) {
    console.error('Claude API call failed:', err.message);
    return null;
  }
}

function safeParseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ---------------- Triage ----------------

const KEYWORD_MAP = {
  Electrical: ['light', 'flicker', 'power', 'socket', 'wire', 'wiring', 'electrical', 'switch', 'outlet', 'shock', 'sparking'],
  Plumbing: ['leak', 'water', 'pipe', 'tap', 'toilet', 'drain', 'plumbing', 'flood', 'clog', 'sink'],
  IT: ['wifi', 'wi-fi', 'internet', 'projector', 'computer', 'network', 'software', 'printer', 'laptop', 'login', 'server'],
};
const SECURITY_WORDS = ['theft', 'stolen', 'suspicious', 'intruder', 'fight', 'weapon', 'harassment', 'unsafe', 'trespass', 'assault', 'fire'];
const HIGH_SEVERITY_WORDS = ['fire', 'weapon', 'assault', 'emergency', 'urgent', 'injury', 'injured', 'unconscious', 'threat', 'blood'];
const LOST_FOUND_WORDS = ['lost', 'found', 'missing item', 'misplaced', 'left behind', 'dropped'];

function heuristicTriage(text) {
  const lower = text.toLowerCase();

  if (LOST_FOUND_WORDS.some(w => lower.includes(w))) {
    return {
      source: 'heuristic',
      category: 'LostFound',
      itemDescription: text.slice(0, 80),
      suggestedTitle: capitalize(firstSentence(text)),
      confidence: 'medium',
    };
  }

  if (SECURITY_WORDS.some(w => lower.includes(w))) {
    const severity = HIGH_SEVERITY_WORDS.some(w => lower.includes(w)) ? 'High' : 'Normal';
    return {
      source: 'heuristic',
      category: 'Safety',
      severity,
      suggestedTitle: capitalize(firstSentence(text)),
      confidence: 'medium',
    };
  }

  let bestSub = null, bestScore = 0;
  for (const [sub, words] of Object.entries(KEYWORD_MAP)) {
    const score = words.filter(w => lower.includes(w)).length;
    if (score > bestScore) { bestScore = score; bestSub = sub; }
  }

  return {
    source: 'heuristic',
    category: 'Maintenance',
    subCategory: bestSub || 'Electrical',
    suggestedTitle: capitalize(firstSentence(text)),
    confidence: bestSub ? 'medium' : 'low',
  };
}

function firstSentence(text) {
  const sentence = (text.split(/[.!?\n]/)[0] || text).trim();
  if (sentence.length <= 60) return sentence;
  const truncated = sentence.slice(0, 60);
  return truncated.slice(0, truncated.lastIndexOf(' ')) + '…';
}
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

async function triageDescription(text) {
  const systemPrompt = `You are a campus incident triage assistant. Given a free-text report, classify it and respond with ONLY a JSON object, no prose, no markdown fences. Schema:
{
  "category": "Maintenance" | "Safety" | "LostFound",
  "subCategory": "Electrical" | "Plumbing" | "IT" | "Security" (only if category is Maintenance),
  "severity": "Low" | "Normal" | "High" (only if category is Safety),
  "itemDescription": string (only if category is LostFound),
  "suggestedTitle": a short (under 8 words) title for the ticket,
  "confidence": "low" | "medium" | "high"
}`;
  const aiText = await callClaude(systemPrompt, text, 250);
  const parsed = safeParseJson(aiText);
  if (parsed && parsed.category) {
    return { source: 'claude', ...parsed };
  }
  return heuristicTriage(text);
}

// ---------------- Ticket summary ----------------

async function summarizeTicket(ticket, history) {
  const systemPrompt = `You are a campus operations assistant. Summarize the following ticket for a staff member glancing at it for the first time. One or two sentences, plain text, no markdown, no preamble.`;
  const userPrompt = `Ticket ${ticket.id}: ${ticket.category}${ticket.subCategory ? '/' + ticket.subCategory : ''}, status ${ticket.status}, at ${ticket.location}.
Title: ${ticket.title}
Description: ${ticket.description || 'none given'}
Reporter: ${ticket.reporter}
Events: ${history.map(h => h.event || h.state).join(', ') || 'none yet'}`;

  const aiText = await callClaude(systemPrompt, userPrompt, 150);
  if (aiText) {
    return { source: 'claude', summary: aiText.trim() };
  }

  const summary = `${ticket.category}${ticket.subCategory ? ' (' + ticket.subCategory + ')' : ''} issue at ${ticket.location}, reported by ${ticket.reporter}. Currently "${ticket.status}" with ${history.length} logged event${history.length === 1 ? '' : 's'}.`;
  return { source: 'heuristic', summary };
}

// ---------------- Campus brief ----------------

async function campusBrief(tickets, bookings) {
  const openTickets = tickets.filter(t => !['Closed', 'Resolved'].includes(t.status));
  const byCategory = groupCount(tickets, t => t.category);
  const byDept = groupCount(openTickets, t => t.department);
  const urgent = openTickets.filter(t => t.severity === 'High' || (t.tags || []).includes('Urgent'));

  const systemPrompt = `You are a campus operations assistant writing a short morning briefing for facilities staff. Two to three sentences, plain text, no markdown, no preamble, be concrete and reference real numbers given.`;
  const userPrompt = `Total tickets: ${tickets.length}. Open tickets: ${openTickets.length}. By category: ${JSON.stringify(byCategory)}. Open by department: ${JSON.stringify(byDept)}. High-urgency open tickets: ${urgent.length} (${urgent.map(t => t.id).join(', ') || 'none'}). Active bookings: ${bookings.length}.`;

  const aiText = await callClaude(systemPrompt, userPrompt, 200);
  if (aiText) {
    return { source: 'claude', brief: aiText.trim(), stats: { total: tickets.length, open: openTickets.length, byCategory, byDept, urgentCount: urgent.length } };
  }

  const brief = `${openTickets.length} of ${tickets.length} tickets are currently open across ${Object.keys(byDept).length} department${Object.keys(byDept).length === 1 ? '' : 's'}. ${urgent.length > 0 ? `${urgent.length} ticket${urgent.length === 1 ? ' needs' : 's need'} urgent attention: ${urgent.map(t => t.id).join(', ')}.` : 'No high-urgency tickets right now.'} ${bookings.length} room booking${bookings.length === 1 ? '' : 's'} on record.`;
  return { source: 'heuristic', brief, stats: { total: tickets.length, open: openTickets.length, byCategory, byDept, urgentCount: urgent.length } };
}

function groupCount(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

module.exports = { triageDescription, summarizeTicket, campusBrief };
