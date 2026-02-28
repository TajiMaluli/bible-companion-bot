// dotenv/config must be the first static import so env vars are available
// to all subsequent modules when the module graph is evaluated.
import 'dotenv/config';

import express from 'express';
import { bot } from './bot.js';
import { startScheduler } from './scheduler.js';

const PORT        = process.env.PORT || 3000;
// Fall back to the known Render URL so the webhook always registers even if
// the PUBLIC_URL env var is absent or mis-spelled on the dashboard.
const PUBLIC_URL  = (process.env.PUBLIC_URL || 'https://bible-companion-bot.onrender.com')
                      .replace(/\/$/, ''); // strip any trailing slash
const WEBHOOK_PATH = '/telegram';
const WEBHOOK_URL  = `${PUBLIC_URL}${WEBHOOK_PATH}`;

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.send('ok'));

// Telegram webhook receiver  —  POST /telegram
app.post(WEBHOOK_PATH, async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook] handleUpdate error:', err.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log(`[webhook] Registering: ${WEBHOOK_URL}`);

  try {
    await bot.telegram.setWebhook(WEBHOOK_URL);
    const info = await bot.telegram.getWebhookInfo();
    if (info.url === WEBHOOK_URL) {
      console.log(`[webhook] Confirmed active: ${info.url}`);
    } else {
      console.error(`[webhook] Mismatch — Telegram reports: ${info.url}`);
    }
  } catch (err) {
    console.error('[webhook] Registration failed:', err.message);
  }

  startScheduler();
});
