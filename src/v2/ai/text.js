// Tiny text-processing toolkit shared by the offline AI features: tokenizer,
// light stemmer and a TF-IDF index with cosine similarity. No dependencies.
const STOPWORDS = new Set(('a an the and or but if then of in on at to for from by with without near around into onto over under is are was were be been being ' +
  'it its this that these those there here i we you they he she my our your their me us them has have had do does did not no very just also can could would should will ' +
  'please kindly some any all more most than so as up out off about again still since while when where which who whom what during after before between through every each').split(/\s+/));

function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}
function tokenize(text) {
  return String(text || '').toLowerCase().replace(/wi-fi/g, 'wifi').replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(t => t.length > 1 && !STOPWORDS.has(t)).map(stem);
}

class TfIdfIndex {
  constructor(docs = []) {
    this.docs = docs.map(d => ({ id: d.id, tokens: tokenize(d.text) }));
    this.df = new Map();
    for (const d of this.docs) for (const t of new Set(d.tokens)) this.df.set(t, (this.df.get(t) || 0) + 1);
    this.vectors = new Map(this.docs.map(d => [d.id, this.vectorizeTokens(d.tokens)]));
  }
  idf(term) { return Math.log((this.docs.length + 1) / ((this.df.get(term) || 0) + 1)) + 1; }
  vectorizeTokens(tokens) {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    const vec = new Map();
    let norm = 0;
    for (const [t, c] of tf) { const w = (1 + Math.log(c)) * this.idf(t); vec.set(t, w); norm += w * w; }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of vec) vec.set(t, w / norm);
    return vec;
  }
  vectorize(text) { return this.vectorizeTokens(tokenize(text)); }
  static cosine(a, b) {
    if (a.size > b.size) [a, b] = [b, a];
    let dot = 0;
    for (const [t, w] of a) { const o = b.get(t); if (o) dot += w * o; }
    return dot;
  }
  similarity(idA, idB) { return TfIdfIndex.cosine(this.vectors.get(idA), this.vectors.get(idB)); }
  query(text, { limit = 5, minScore = 0.2, exclude } = {}) {
    const q = this.vectorize(text);
    return this.docs.filter(d => d.id !== exclude)
      .map(d => ({ id: d.id, score: TfIdfIndex.cosine(q, this.vectors.get(d.id)) }))
      .filter(r => r.score >= minScore).sort((a, b) => b.score - a.score).slice(0, limit);
  }
  topTerms(vec, n = 3) { return [...vec].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t); }
}
// Maps each stem back to the first original word that produced it, for human-readable explanations.
function originalWords(text) {
  const map = new Map();
  for (const word of String(text || '').toLowerCase().replace(/wi-fi/g, 'wifi').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    const [t] = tokenize(word);
    if (t && !map.has(t)) map.set(t, word);
  }
  return map;
}
module.exports = { tokenize, stem, TfIdfIndex, STOPWORDS, originalWords };
