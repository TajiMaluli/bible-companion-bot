// dotenv/config must be the first static import so env vars are available
// to all subsequent modules when the module graph is evaluated.
import 'dotenv/config';

import express from 'express';
import { bot } from './bot.js';
import { startScheduler } from './scheduler.js';

const PORT       = process.env.PORT       || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL ?? '';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.send('ok'));

// Telegram webhook receiver
app.post('/telegram', async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook] handleUpdate error:', err.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, async () => {
  console.log(`[server] Listening on port ${PORT}`);

  if (PUBLIC_URL) {
    const webhookUrl = `${PUBLIC_URL}/telegram`;
    try {
      await bot.telegram.setWebhook(webhookUrl);
      console.log(`[webhook] Set to ${webhookUrl}`);
    } catch (err) {
      console.error('[webhook] Failed to set webhook:', err.message);
    }
  } else {
    console.warn('[webhook] PUBLIC_URL not set — webhook not registered');
  }

  startScheduler();
});
