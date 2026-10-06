// Minimal fixed-window rate limiter keyed by client IP. Enough to blunt password guessing
// without adding a dependency; state is per-process.
function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Too many attempts. Try again later.' } = {}) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    let entry = hits.get(req.ip);
    if (!entry || entry.resetAt <= now) { entry = { count: 0, resetAt: now + windowMs }; hits.set(req.ip, entry); }
    entry.count++;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
module.exports = rateLimit;
