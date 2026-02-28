import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getSentVersesToday, logVerse } from './storage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir   = join(__dirname, '../data');

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

// ── Load & index KJV ─────────────────────────────────────────────────────────
//
// Supported formats:
//
//   1. Flat array (most common public datasets):
//      [{ "book_name": "Genesis", "chapter": 1, "verse": 1, "text": "..." }, ...]
//      Also accepts field aliases: book / Book, Chapter, Verse, Text
//
//   2. Flat object with dot-separated keys (no spaces in book names):
//      { "Genesis.1.1": "...", "1John.3.16": "...", ... }
//
// Internal index key: "<BookNoSpaces>|<chapter>|<verse>"  (e.g. "1John|3|16")
// lookupText() strips spaces from topics.json book names before querying,
// so "1 John" → "1John" matches the index automatically.

const kjvIndex = new Map();
const kjvPath  = join(dataDir, 'kjv.json');

if (!existsSync(kjvPath)) {
  console.error('[FATAL] data/kjv.json not found.');
  console.error('        Copy a valid KJV JSON file to data/kjv.json and restart.');
  process.exit(1);
}

const kjvRaw = loadJson(kjvPath);

if (Array.isArray(kjvRaw)) {
  if (kjvRaw.length === 0) {
    console.error('[FATAL] data/kjv.json is an empty array.');
    console.error('        Replace it with a full KJV JSON file and restart.');
    process.exit(1);
  }
  for (const v of kjvRaw) {
    const book    = v.book_name ?? v.book ?? v.Book;
    const chapter = v.chapter  ?? v.Chapter;
    const verse   = v.verse    ?? v.Verse;
    const text    = v.text     ?? v.Text;
    if (book && chapter && verse && text) {
      // Strip spaces so "1 John" and "1John" both resolve to "1John|..."
      kjvIndex.set(`${String(book).replace(/\s+/g, '')}|${chapter}|${verse}`, String(text).trim());
    }
  }
} else if (typeof kjvRaw === 'object' && kjvRaw !== null) {
  // Dot-separated key format: "Genesis.1.1", "1John.3.16", "SongofSolomon.1.1"
  // Split from the right so multi-word book names survive: "Song.of.Solomon.1.1" → book = "SongofSolomon"?
  // In practice these files concatenate the book name without spaces, so we just pop the last two segments.
  for (const [key, text] of Object.entries(kjvRaw)) {
    if (!text) continue;
    const parts   = key.split('.');
    const verse   = parts.pop();
    const chapter = parts.pop();
    const book    = parts.join(''); // concatenate remaining parts (already no spaces)
    if (book && chapter && verse) {
      kjvIndex.set(`${book}|${chapter}|${verse}`, String(text).trim());
    }
  }
}

if (kjvIndex.size === 0) {
  console.error('[FATAL] data/kjv.json loaded but contains no usable verses.');
  console.error('        Check the file format (see README) and restart.');
  process.exit(1);
}

console.log(`[verses] KJV index built: ${kjvIndex.size.toLocaleString()} verses loaded.`);

// ── Load topic / keyword data ─────────────────────────────────────────────────

const topics     = loadJson(join(dataDir, 'topics.json'));
const keywordMap = loadJson(join(dataDir, 'keyword_map.json'));

// ── Public helpers ────────────────────────────────────────────────────────────

export function listTopics() {
  return Object.keys(topics);
}

export function detectTopic(text) {
  const lower = text.toLowerCase();
  for (const [keyword, topic] of Object.entries(keywordMap)) {
    if (lower.includes(keyword)) return topic;
  }
  return null;
}

// Returns today's date string (YYYY-MM-DD) in the configured timezone.
function todayDate() {
  const tz = process.env.TZ || 'America/Los_Angeles';
  return new Date().toLocaleDateString('en-CA', { timeZone: tz }); // en-CA → YYYY-MM-DD
}

function formatRef(ref) {
  return `${ref.book} ${ref.chapter}:${ref.verse}`;
}

// Strip spaces from book name before querying the index, so "1 John" → "1John" etc.
function lookupText(ref) {
  const normalizedBook = String(ref.book).replace(/\s+/g, '');
  return kjvIndex.get(`${normalizedBook}|${ref.chapter}|${ref.verse}`) ?? null;
}

/**
 * Returns up to `count` verses for the given user, avoiding same-day repeats.
 * Each result: { ref: "Book Chapter:Verse", text: "..." }
 */
export function getVersesForUser(user, count = 2) {
  const topicName = user.topic || 'encouragement';
  const refs      = topics[topicName] ?? topics['encouragement'] ?? [];
  const today     = todayDate();

  const sentToday = new Set(getSentVersesToday(user.user_id, today));

  // Available = has text in index AND not sent today
  let available = refs.filter(ref => {
    const text = lookupText(ref);
    return text !== null && !sentToday.has(formatRef(ref));
  });

  // If the topic pool is exhausted for today, allow repeats
  if (available.length === 0) {
    available = refs.filter(ref => lookupText(ref) !== null);
  }

  if (available.length === 0) return [];

  // Shuffle and pick
  const picked = available
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(count, available.length));

  // Log
  for (const ref of picked) {
    logVerse(user.user_id, formatRef(ref), today);
  }

  return picked.map(ref => ({ ref: formatRef(ref), text: lookupText(ref) }));
}
