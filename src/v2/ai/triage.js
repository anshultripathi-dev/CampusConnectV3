// Offline incident triage: a multinomial Naive Bayes text classifier (category +
// sub-category) trained on a bundled labelled corpus plus the incidents already in
// the database, and a transparent keyword-weight model for severity.
const { tokenize, originalWords } = require('./text');
const bundled = require('./trainingData.json');

const DEPARTMENT = { Maintenance: 'Maintenance', Safety: 'Security', LostFound: 'Facilities' };
const label = (category, subCategory) => `${category}/${subCategory}`;

class NaiveBayesTriage {
  constructor() { this.reset(); }
  reset() { this.classCount = new Map(); this.termCount = new Map(); this.classTotal = new Map(); this.vocab = new Set(); this.docs = 0; }
  train(examples) {
    this.reset();
    for (const ex of examples) {
      if (!ex.category || !ex.text) continue;
      const lab = label(ex.category, ex.subCategory || 'General');
      const tokens = tokenize(ex.text);
      if (!tokens.length) continue;
      this.docs++;
      this.classCount.set(lab, (this.classCount.get(lab) || 0) + 1);
      if (!this.termCount.has(lab)) this.termCount.set(lab, new Map());
      const tc = this.termCount.get(lab);
      for (const t of tokens) {
        tc.set(t, (tc.get(t) || 0) + 1);
        this.classTotal.set(lab, (this.classTotal.get(lab) || 0) + 1);
        this.vocab.add(t);
      }
    }
    return this;
  }
  logP(term, lab) { // Laplace-smoothed P(term | class)
    return Math.log(((this.termCount.get(lab).get(term) || 0) + 1) / (this.classTotal.get(lab) + this.vocab.size));
  }
  predict(text) {
    const tokens = tokenize(text);
    const known = tokens.filter(t => this.vocab.has(t));
    if (!this.docs || !known.length) return { ranked: [], known: 0, tokens };
    const scores = [...this.classCount.keys()].map(lab => {
      let s = Math.log(this.classCount.get(lab) / this.docs);
      for (const t of known) s += this.logP(t, lab);
      return { lab, s };
    });
    // Naive Bayes is over-confident on long texts; temper the likelihood once past ~3 known terms.
    const k = 1 / Math.max(1, Math.sqrt(known.length / 3));
    const max = Math.max(...scores.map(x => x.s * k));
    const exp = scores.map(x => ({ lab: x.lab, e: Math.exp(x.s * k - max) }));
    const sum = exp.reduce((a, b) => a + b.e, 0);
    const ranked = exp.map(x => ({ lab: x.lab, probability: x.e / sum })).sort((a, b) => b.probability - a.probability);
    return { ranked, known: known.length, tokens: known };
  }
  explain(lab, other, tokens) {
    if (!other) return [];
    return [...new Set(tokens)].map(t => ({ t, w: this.logP(t, lab) - this.logP(t, other) }))
      .filter(x => x.w > 0.3).sort((a, b) => b.w - a.w).slice(0, 4).map(x => x.t);
  }
}

const SEVERITY_SIGNALS = [
  [10, /\b(fire|smoke|burning|burnt|spark(?:s|ing)?|electric(?:al)? shock|electrocut\w*|gas leak|explosion|weapon|knife|assault\w*|unconscious|bleeding|blood|collapse\w*|trapped|stabb\w*)\b/i],
  [8, /\b(emergency|life[- ]threatening|injur\w+|attack\w*|threat\w*)\b/i],
  [5, /\b(flood\w*|burst|blackout|outage|short[- ]circuit|intrud\w+|unauthori[sz]ed|theft|stol(?:e|en)|harass\w*|fight\w*|server room|during (?:an? |the )?exams?|urgent|no power|exposed wir\w+|slipped)\b/i],
  [3, /\b(down|not (?:working|turning on|booting)|overflow\w*|clogged|blocked|no water|offline|unsafe|all (?:the )?(?:taps|computers|labs))\b/i],
  [2, /\b(leak\w*|broken|flicker\w*|slow|noise|smell|dripping|stuck|jammed)\b/i],
  [-4, /\b(minor|cosmetic|small|whenever|suggestion|eventually|no rush|not urgent)\b/i],
];
function severityOf(text, category) {
  let score = 0; const hits = [];
  for (const [weight, rx] of SEVERITY_SIGNALS) {
    const m = String(text).match(rx);
    if (m) { score += weight; hits.push(m[0].toLowerCase()); }
  }
  let severity = score >= 10 ? 'Critical' : score >= 5 ? 'High' : score >= 1 ? 'Medium' : hits.length ? 'Low' : 'Medium';
  if (category === 'LostFound' && score < 5) severity = 'Low';
  return { severity, signals: hits.slice(0, 4) };
}

const model = new NaiveBayesTriage();
function retrain(extraExamples = []) { return model.train([...bundled, ...extraExamples]); }
retrain();

function triage({ title = '', description = '' } = {}) {
  const text = `${title}. ${description}`.trim();
  const { ranked, known, tokens } = model.predict(text);
  const top = ranked[0];
  if (!top || known < 2 || top.probability < 0.35) {
    return { suggestion: null, confident: false, reason: 'Not enough recognisable detail yet.', model: { name: 'naive-bayes', trainedOn: model.docs } };
  }
  const [category, subCategory] = top.lab.split('/');
  const sev = severityOf(text, category);
  return {
    confident: top.probability >= 0.6,
    suggestion: { category, subCategory, severity: sev.severity, department: DEPARTMENT[category] || 'Facilities' },
    confidence: Number(Math.min(0.97, top.probability).toFixed(3)),
    alternatives: ranked.slice(1, 3).filter(r => r.probability > 0.1).map(r => { const [c, s] = r.lab.split('/'); return { category: c, subCategory: s, probability: Number(r.probability.toFixed(3)) }; }),
    signals: { keywords: model.explain(top.lab, ranked[1]?.lab, tokens).map(t => originalWords(text).get(t) || t), severity: sev.signals },
    model: { name: 'naive-bayes', trainedOn: model.docs, source: 'local' },
  };
}
module.exports = { triage, retrain, severityOf, NaiveBayesTriage, DEPARTMENT };
