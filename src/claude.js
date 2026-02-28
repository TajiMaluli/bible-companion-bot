/**
 * claude.js — Claude Haiku integration, strictly grounded in local KJV data.
 *
 * askClaude() receives the user's message plus verse objects retrieved from
 * the local kjv.json. It instructs the model to ONLY use those verses —
 * never external knowledge, never invented scripture.
 *
 * Returns null if ANTHROPIC_API_KEY is not set (caller falls back gracefully).
 */

import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `\
You are a Bible companion bot. You must respond using ONLY the KJV verses \
explicitly provided to you in each request. No other source is permitted.

Rules you must never break:
1. Every verse you quote or reference must appear word-for-word in the \
provided context. Do not paraphrase, combine, or recall any scripture from \
memory.
2. Always cite the exact reference (e.g. John 3:16) immediately after any \
quoted text.
3. Never invent, hallucinate, or approximate scripture. If a verse is not in \
the provided list, it does not exist for this response.
4. If the provided verses do not directly address the user's message, say so \
clearly, then identify the single closest verse from the list and briefly \
explain why it is the closest match.
5. Keep your response concise — no more than 3-4 sentences of commentary \
beyond the verse text itself.`;

let _client = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/**
 * @param {string} userMessage  - the user's raw Telegram message
 * @param {{ ref: string, text: string }[]} verses - verses from searchVerses()
 * @returns {Promise<string|null>} Claude's reply, or null if key not set
 */
export async function askClaude(userMessage, verses) {
  const client = getClient();
  if (!client) return null;

  const verseBlock = verses.length > 0
    ? verses.map(v => `${v.ref} — "${v.text}"`).join('\n')
    : '(No matching verses were found in the local KJV database.)';

  const userContent =
    `Retrieved KJV verses from local database:\n\n${verseBlock}\n\n` +
    `User message: ${userMessage}`;

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userContent }],
  });

  return response.content[0]?.text ?? null;
}
