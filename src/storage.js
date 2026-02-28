/**
 * storage.js — pure-JS persistence layer (no native modules, no node-gyp).
 *
 * Users       → data/users.json       { "<userId>": { user_id, username, topic, morning, … } }
 * Verse log   → data/sent_verses.json { "<userId>|<YYYY-MM-DD>": ["Book 4:6", …] }
 *
 * Atomic write pattern: write to <file>.tmp, then renameSync over the real file.
 * On Windows, renameSync overwrites the destination file, so this is safe for a
 * single-process bot and protects against corrupt files on mid-write crashes.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '../data');

mkdirSync(DATA_DIR, { recursive: true });

const USERS_PATH = join(DATA_DIR, 'users.json');
const LOG_PATH   = join(DATA_DIR, 'sent_verses.json');

const USER_DEFAULTS = {
  topic:     'encouragement',
  morning:   '07:30',
  midday:    '12:00',
  afternoon: '16:30',
  evening:   '21:00',
};

// ── Low-level I/O ─────────────────────────────────────────────────────────────

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    const raw = readFileSync(filePath, 'utf8').trim();
    // Treat an empty file or bare [] as the fallback so the code never sees an array
    if (!raw || raw === '[]') return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'w' });
  try {
    renameSync(tmp, filePath);
  } catch {
    // Fallback: write directly (handles rare cross-device or permission edge cases)
    writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'w' });
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────

function readUsers() {
  return readJson(USERS_PATH, {});
}

/**
 * Returns the user object if they exist, otherwise null.
 */
export function getUser(userId) {
  return readUsers()[String(userId)] ?? null;
}

/**
 * Creates the user if they don't exist yet. Always returns the current record.
 */
export function upsertUser(userId, username) {
  const users = readUsers();
  const key   = String(userId);

  if (!users[key]) {
    users[key] = {
      user_id:       userId,
      username,
      ...USER_DEFAULTS,
      registered_at: new Date().toISOString(),
    };
    writeJson(USERS_PATH, users);
  }

  return users[key];
}

/**
 * Merges `fields` into the user record. Returns the updated record, or null
 * if the user doesn't exist.
 */
export function updateUser(userId, fields) {
  const users = readUsers();
  const key   = String(userId);

  if (!users[key]) return null;

  users[key] = { ...users[key], ...fields };
  writeJson(USERS_PATH, users);
  return users[key];
}

/**
 * Returns all users whose morning / midday / afternoon / evening slot equals hhmm.
 */
export function getUsersByTime(hhmm) {
  return Object.values(readUsers()).filter(u =>
    u.morning === hhmm || u.midday   === hhmm ||
    u.afternoon === hhmm || u.evening === hhmm
  );
}

// ── Daily verse log ───────────────────────────────────────────────────────────

function readLog() {
  return readJson(LOG_PATH, {});
}

/**
 * Returns the list of verse refs already sent to `userId` on `date` (YYYY-MM-DD).
 */
export function getSentVersesToday(userId, date) {
  return readLog()[`${userId}|${date}`] ?? [];
}

/**
 * Records that `verseRef` was sent to `userId` on `date`. Idempotent.
 * Prunes entries older than 7 days on each write to keep the file small.
 */
export function logVerse(userId, verseRef, date) {
  const log = readLog();
  const key = `${userId}|${date}`;

  if (!log[key]) log[key] = [];
  if (log[key].includes(verseRef)) return; // already logged, no write needed

  log[key].push(verseRef);

  // Prune entries older than 7 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0]; // YYYY-MM-DD

  for (const k of Object.keys(log)) {
    const entryDate = k.split('|')[1]; // key format: "<userId>|<YYYY-MM-DD>"
    if (entryDate && entryDate < cutoffStr) delete log[k];
  }

  writeJson(LOG_PATH, log);
}
