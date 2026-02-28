import { Telegraf } from 'telegraf';
import { upsertUser, updateUser } from './storage.js';
import { listTopics, detectTopic, getVersesForUser, searchVerses, getTopicVerses } from './verses.js';
import { askClaude } from './claude.js';

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN environment variable is required');
}

export const bot = new Telegraf(process.env.BOT_TOKEN);

// ── Helpers ──────────────────────────────────────────────────────────────────

function registerUser(ctx) {
  const userId   = ctx.from.id;
  const username = ctx.from.username ?? ctx.from.first_name ?? String(userId);
  return upsertUser(userId, username);
}

function buildVerseMessage(verses) {
  return verses.map(v => `${v.ref}\n${v.text}`).join('\n\n');
}

// ── Commands ──────────────────────────────────────────────────────────────────

bot.command('start', ctx => {
  registerUser(ctx);
  ctx.reply('Registered.');
});

bot.command('topics', ctx => {
  registerUser(ctx);
  ctx.reply(
    `Suggested topics:\n${listTopics().join('\n')}\n\n` +
    `You are not limited to these — set any word or phrase:\n` +
    `/topic patience\n/topic David\n/topic Holy Spirit\n/topic healing`
  );
});

bot.command('topic', ctx => {
  const user = registerUser(ctx);
  const arg  = ctx.message.text.trim().replace(/^\/topic\s*/i, '').trim().toLowerCase();

  if (!arg) {
    ctx.reply(`Current topic: ${user.topic}`);
    return;
  }

  updateUser(user.user_id, { topic: arg });
  ctx.reply('Topic updated.');
});

bot.command('times', ctx => {
  const user = registerUser(ctx);
  ctx.reply(
    `Morning:   ${user.morning}\n` +
    `Midday:    ${user.midday}\n` +
    `Afternoon: ${user.afternoon}\n` +
    `Evening:   ${user.evening}`
  );
});

bot.command('settime', ctx => {
  const user  = registerUser(ctx);
  const parts = ctx.message.text.trim().split(/\s+/);
  const slot  = parts[1]?.toLowerCase();
  const time  = parts[2];

  const validSlots = ['morning', 'midday', 'afternoon', 'evening'];

  if (!slot || !validSlots.includes(slot)) {
    ctx.reply('Usage: /settime <morning|midday|afternoon|evening> <HH:MM>');
    return;
  }

  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    ctx.reply('Time must be in HH:MM format, e.g. 08:00');
    return;
  }

  updateUser(user.user_id, { [slot]: time });
  ctx.reply('Time updated.');
});

// ── Plain-text messages → Claude Haiku grounded in local KJV search ──────────

bot.on('text', async ctx => {
  if (ctx.message.text.startsWith('/')) return;

  const user    = registerUser(ctx);
  const message = ctx.message.text;

  // 1. Build context: keyword search across full KJV + topic-pinned verses.
  //    KJV vocabulary (fear, care, sorrow) rarely matches modern words (anxious,
  //    worried, sad), so we combine keyword search, topic detection, and the
  //    user's saved topic, then deduplicate.
  const keywordHits   = searchVerses(message);                // full-text match on message
  const detectedTopic = detectTopic(message);
  const topicHits     = detectedTopic ? getTopicVerses(detectedTopic) : [];
  const userTopicHits = user.topic ? searchVerses(user.topic, 5) : [];

  const seen   = new Set(keywordHits.map(v => v.ref));
  const verses = [...keywordHits];
  for (const v of [...topicHits, ...userTopicHits]) {
    if (!seen.has(v.ref)) { seen.add(v.ref); verses.push(v); }
  }
  // Cap at 10 so the prompt stays concise
  verses.splice(10);

  // 2. Ask Claude, strictly grounded in those verses
  try {
    const reply = await askClaude(message, verses);

    if (reply) {
      ctx.reply(reply);
      return;
    }
  } catch (err) {
    console.error('[claude] API error:', err.message);
  }

  // 3. Fallback: Claude unavailable — reply with verse directly
  if (verses.length > 0) {
    ctx.reply(buildVerseMessage(verses.slice(0, 2)));
  } else {
    const fallback = getVersesForUser(user);
    if (fallback.length > 0) ctx.reply(buildVerseMessage(fallback));
  }
});

export { buildVerseMessage };
