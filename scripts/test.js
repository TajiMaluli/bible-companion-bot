/**
 * Smoke-test of verses.js logic + KJV-grounding enforcement.
 * Run: node --env-file=.env scripts/test.js
 */
import 'dotenv/config';
import {
  listTopics, detectTopic, getTopicVerses,
  searchVerses, getVersesForUser, verifyRef
} from '../src/verses.js';

let pass = 0;
let fail = 0;

function assert(label, value) {
  if (value) {
    console.log(`  ✓  ${label}`);
    pass++;
  } else {
    console.error(`  ✗  ${label}`);
    fail++;
  }
}

// ── 1. listTopics ─────────────────────────────────────────────────────────────
console.log('\n1. listTopics()');
const topics = listTopics();
assert('returns array', Array.isArray(topics));
assert('contains encouragement', topics.includes('encouragement'));

// ── 2. detectTopic ────────────────────────────────────────────────────────────
console.log('\n2. detectTopic()');
assert('detects anxiety keyword', detectTopic('I feel anxious today') !== null);
assert('returns null for gibberish', detectTopic('asdfghjkl') === null);

// ── 3. searchVerses — increased limit ─────────────────────────────────────────
console.log('\n3. searchVerses() at limit 15');
const fearResults = searchVerses('fear not be strong courageous', 15);
assert('returns up to 15 results', fearResults.length > 0 && fearResults.length <= 15);
assert('results have ref and text', fearResults[0]?.ref && fearResults[0]?.text);
console.log(`     got ${fearResults.length} verses`);

// ── 4. verifyRef — known good refs ────────────────────────────────────────────
console.log('\n4. verifyRef() — known good refs');
assert('John 3:16 exists',      verifyRef('John', 3, 16));
assert('Genesis 1:1 exists',    verifyRef('Genesis', 1, 1));
assert('Psalm 23:1 exists',     verifyRef('Psalms', 23, 1));
assert('1 John 4:8 exists',     verifyRef('1 John', 4, 8));
assert('Revelation 21:4 exists',verifyRef('Revelation', 21, 4));

// ── 5. verifyRef — fake / hallucinated refs ───────────────────────────────────
console.log('\n5. verifyRef() — hallucinated refs (should all be FALSE)');
assert('John 99:99 does NOT exist',   !verifyRef('John', 99, 99));
assert('Genesis 0:0 does NOT exist',  !verifyRef('Genesis', 0, 0));
assert('Fakebook 1:1 does NOT exist', !verifyRef('Fakebook', 1, 1));

// ── 6. Hallucination-check regex ──────────────────────────────────────────────
console.log('\n6. Hallucination-check regex against sample Claude reply');
const sampleReply =
  `"Be strong and of a good courage" (Joshua 1:9) — the Lord your God is with you.\n` +
  `Also see Philippians 4:13 for strength. Notabook 99:99 should be caught.`;

const refPattern = /\b((?:[1-3] )?[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+(\d+):(\d+)\b/g;
const found = [];
let m;
while ((m = refPattern.exec(sampleReply)) !== null) {
  const [full, book, chapter, verse] = m;
  const ok = verifyRef(book, chapter, verse);
  found.push({ full, ok });
}

const verified   = found.filter(r => r.ok);
const unverified = found.filter(r => !r.ok);

console.log(`     refs found: ${found.map(r => r.full).join(', ')}`);
console.log(`     verified:   ${verified.map(r => r.full).join(', ') || '(none)'}`);
console.log(`     unverified: ${unverified.map(r => r.full).join(', ') || '(none)'}`);

assert('detected Joshua 1:9',       found.some(r => r.full === 'Joshua 1:9'));
assert('Joshua 1:9 verified',       verified.some(r => r.full === 'Joshua 1:9'));
assert('detected Philippians 4:13', found.some(r => r.full === 'Philippians 4:13'));
assert('Notabook 99:99 flagged',    unverified.some(r => r.full.includes('99:99')));

// ── 7. Context building — full pipeline ───────────────────────────────────────
console.log('\n7. Full context pipeline (message + topic)');
const msg         = 'I am struggling with anxiety and worry';
const kwHits      = searchVerses(msg, 15);
const detected    = detectTopic(msg);
const topicHits   = detected ? getTopicVerses(detected) : [];
const userHits    = searchVerses('peace', 8);

const seen   = new Set(kwHits.map(v => v.ref));
const verses = [...kwHits];
for (const v of [...topicHits, ...userHits]) {
  if (!seen.has(v.ref)) { seen.add(v.ref); verses.push(v); }
}
verses.splice(15);

assert('pipeline produces verses', verses.length > 0);
assert('capped at 15',             verses.length <= 15);
console.log(`     ${verses.length} verses | ${verses.map(v => v.ref).join(', ')}`);

// ── 8. getVersesForUser — custom topic ───────────────────────────────────────
console.log('\n8. getVersesForUser() — custom and predefined topics');
const base = { user_id: 99999, topic: 'encouragement', morning: '08:00', midday: '12:00', afternoon: '15:00', evening: '20:00' };
assert('predefined topic works', getVersesForUser(base).length > 0);
assert('custom "david" works',   getVersesForUser({ ...base, user_id: 99998, topic: 'david' }).length > 0);
assert('nonsense falls back',    getVersesForUser({ ...base, user_id: 99997, topic: 'xyzxyz' }).length > 0);

// ── 9. Claude API (live, only if key set) ─────────────────────────────────────
console.log('\n9. Claude API (live)');
if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
  console.log('     ANTHROPIC_API_KEY not set locally — skipping live Claude call');
  console.log('     (This runs on Render where the key is set)');
} else {
  const { askClaude } = await import('../src/claude.js');
  const testVerses = searchVerses('fear not trust god', 15);
  console.log(`     sending ${testVerses.length} verses to Claude...`);
  try {
    const reply = await askClaude('I am afraid and need encouragement', testVerses);
    assert('Claude returned a reply', !!reply);
    if (reply) {
      console.log(`     reply preview: ${reply.slice(0, 120)}...`);
      // Run hallucination check on the live reply
      const re2 = /\b((?:[1-3] )?[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+(\d+):(\d+)\b/g;
      let m2; const bad = [];
      while ((m2 = re2.exec(reply)) !== null) {
        const [full2, b, c, v] = m2;
        if (!verifyRef(b, c, v)) bad.push(full2);
      }
      if (bad.length > 0) {
        console.warn(`     [hallucination-check] unverified: ${bad.join(', ')}`);
        assert('no hallucinated refs', false);
      } else {
        assert('no hallucinated refs in live reply', true);
      }
    }
  } catch (err) {
    console.error(`     Claude error: ${err.message}`);
    assert('Claude call succeeded', false);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
