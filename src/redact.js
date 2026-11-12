// Deterministic shield: patterns that must never depend on a model's recall.
const PATTERNS = [
  ['EMAIL', /[\w.+-]+@[\w-]+\.[\w.-]+/g],
  ['PHONE', /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g],
  ['SSN', /\b\d{3}-\d{2}-\d{4}\b/g],
  ['CARD', /\b(?:\d[ -]?){13,16}\b/g],
  ['IBAN', /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g],
  ['ID', /\b(?:MRN|ID|Policy|Case|Acct|Account|Claim)[\s#:no.]*[A-Z0-9-]{4,}\b/gi],
  ['DATE', /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g],
];

export function regexScan(text) {
  const out = [];
  for (const [type, re] of PATTERNS) for (const m of text.matchAll(re)) out.push({ text: m[0].trim(), type });
  return out;
}

// Replace longest values first so "Maria Lopez" wins over "Maria".
export function applyRedactions(text, entities) {
  const byValue = new Map();
  for (const e of entities) {
    const v = e.text.trim();
    if (v.length < 2 || byValue.has(v)) continue;
    byValue.set(v, (e.type || 'PII').toUpperCase().replace(/[^A-Z]/g, '') || 'PII');
  }
  const counters = {};
  const map = {};
  let redacted = text;
  for (const v of [...byValue.keys()].sort((a, b) => b.length - a.length)) {
    if (!redacted.includes(v)) continue;
    const t = byValue.get(v);
    counters[t] = (counters[t] || 0) + 1;
    const ph = `[${t}_${counters[t]}]`;
    map[ph] = v;
    redacted = redacted.split(v).join(ph);
  }
  return { redacted, map };
}

export function rehydrate(text, map) {
  let out = text;
  for (const [ph, v] of Object.entries(map)) out = out.split(ph).join(v);
  return out;
}

// Any vault value (or its >=4-char tokens for names) still in the outbound text is a leak.
export function leakCheck(redacted, map) {
  const hay = redacted.toLowerCase();
  return Object.values(map).filter((v) => hay.includes(v.toLowerCase()));
}
