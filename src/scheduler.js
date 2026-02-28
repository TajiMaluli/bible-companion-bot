import cron from 'node-cron';
import { getUsersByTime } from './storage.js';
import { getVersesForUser } from './verses.js';
import { bot, buildVerseMessage } from './bot.js';

const TZ = process.env.TZ || 'America/Los_Angeles';

/**
 * Returns the current HH:MM in the configured timezone.
 */
function currentHHMM() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).formatToParts(new Date());

  const h = parts.find(p => p.type === 'hour').value.padStart(2, '0');
  const m = parts.find(p => p.type === 'minute').value.padStart(2, '0');
  // Intl can return "24" for midnight in some environments
  return `${h === '24' ? '00' : h}:${m}`;
}

async function sendScheduledVerses() {
  const hhmm = currentHHMM();
  const users = getUsersByTime(hhmm);

  for (const user of users) {
    const verses = getVersesForUser(user);
    if (verses.length === 0) continue;

    try {
      await bot.telegram.sendMessage(user.user_id, buildVerseMessage(verses));
    } catch (err) {
      console.error(`[scheduler] Failed to send to ${user.user_id}:`, err.message);
    }
  }
}

export function startScheduler() {
  cron.schedule('* * * * *', sendScheduledVerses, { timezone: TZ });
  console.log(`[scheduler] Started (timezone: ${TZ})`);
}
