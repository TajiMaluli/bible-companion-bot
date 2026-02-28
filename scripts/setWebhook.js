/**
 * scripts/setWebhook.js
 *
 * Registers the Telegram webhook URL and prints the result.
 * Reads BOT_TOKEN and PUBLIC_URL from the environment (.env or shell).
 * Never prints the bot token.
 *
 * Usage:
 *   node --env-file=.env scripts/setWebhook.js       (local, Node 20+)
 *   node scripts/setWebhook.js                        (Render shell, vars already set)
 */

const WEBHOOK_PATH = '/telegram';

const token     = process.env.BOT_TOKEN;
const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, ''); // strip trailing slash

if (!token) {
  console.error('ERROR: BOT_TOKEN is not set.');
  process.exit(1);
}
if (!publicUrl) {
  console.error('ERROR: PUBLIC_URL is not set.');
  process.exit(1);
}

const webhookUrl = `${publicUrl}${WEBHOOK_PATH}`;
const apiBase    = `https://api.telegram.org/bot${token}`;

async function run() {
  // 1. Set the webhook
  console.log(`Setting webhook to: ${webhookUrl}`);
  const setRes  = await fetch(`${apiBase}/setWebhook`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url: webhookUrl, drop_pending_updates: true }),
  });
  const setJson = await setRes.json();
  console.log('setWebhook →', setJson.ok ? 'ok' : 'FAILED', '|', setJson.description ?? '');

  // 2. Read back webhook info
  const infoRes  = await fetch(`${apiBase}/getWebhookInfo`);
  const infoJson = await infoRes.json();
  const info     = infoJson.result ?? {};

  console.log('\ngetWebhookInfo:');
  console.log('  ok               :', infoJson.ok);
  console.log('  url              :', info.url              ?? '(none)');
  console.log('  last_error_message:', info.last_error_message ?? '(none)');
  console.log('  last_error_date  :', info.last_error_date
    ? new Date(info.last_error_date * 1000).toISOString()
    : '(none)');
  console.log('  pending_update_count:', info.pending_update_count ?? 0);

  if (!infoJson.ok || info.url !== webhookUrl) {
    console.error('\nWebhook URL does not match expected value. Check PUBLIC_URL and redeploy.');
    process.exit(1);
  }

  console.log('\nWebhook is active and pointing to the correct URL.');
}

run().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
