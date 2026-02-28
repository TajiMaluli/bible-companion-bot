import { Telegraf } from 'telegraf';
import { upsertUser, updateUser } from './storage.js';
import { listTopics, detectTopic, getVersesForUser } from './verses.js';

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
  ctx.reply(listTopics().join('\n'));
});

bot.command('topic', ctx => {
  const user  = registerUser(ctx);
  const parts = ctx.message.text.trim().split(/\s+/);
  const arg   = parts[1]?.toLowerCase();

  if (!arg) {
    ctx.reply(`Current topic: ${user.topic}`);
    return;
  }

  if (!listTopics().includes(arg)) {
    ctx.reply(`Unknown topic. Available:\n${listTopics().join('\n')}`);
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

// ── Keyword detection on plain text ──────────────────────────────────────────

bot.on('text', ctx => {
  if (ctx.message.text.startsWith('/')) return;

  const user  = registerUser(ctx);
  const topic = detectTopic(ctx.message.text);
  if (!topic) return;

  const resolvedTopic = listTopics().includes(topic) ? topic : user.topic;
  const verses = getVersesForUser({ ...user, topic: resolvedTopic });
  if (verses.length === 0) return;

  ctx.reply(buildVerseMessage(verses));
});

export { buildVerseMessage };
