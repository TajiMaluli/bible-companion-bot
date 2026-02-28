# bible-companion-bot

A Telegram bot that sends KJV Bible verses on a daily schedule and responds to
plain-text messages with scripture-grounded replies powered by **Claude Haiku**.

Every response — scheduled or conversational — is grounded **exclusively** in
`data/kjv.json`. Claude is not allowed to quote, paraphrase, or recall any
scripture from its training knowledge. If no matching verse is found locally,
the bot says so honestly.

---

## Project structure

```
bible-companion-bot/
  package.json
  requirements.txt       — Python reference (npm package @anthropic-ai/sdk is used at runtime)
  .env.example
  .gitignore
  src/
    index.js       — Express server, webhook setup, startup
    bot.js         — Telegraf commands and text handler
    scheduler.js   — node-cron per-minute scheduler
    verses.js      — KJV index, topic lookup, full-text search, verifyRef
    storage.js     — Pure-JS JSON persistence (no native deps, no SQLite)
    claude.js      — Claude Haiku integration with strict KJV-only system prompt
  data/
    kjv.json           — *** YOU MUST PROVIDE THIS FILE (see below) ***
    topics.json        — Verse references grouped by topic
    keyword_map.json   — Keyword → topic mapping
  scripts/
    setWebhook.js  — One-time webhook registration helper
    test.js        — Smoke tests (25 assertions, includes live Claude call)
```

---

## How it works

1. A user sends a plain-text message, e.g. _"I'm struggling with anxiety"_.
2. The bot runs a full-text keyword search across all 31,100 KJV verses (up to
   15 hits) and merges results from topic detection and the user's saved topic.
3. Those verses — and only those verses — are injected into the Claude Haiku
   prompt as context.
4. Claude replies using only the provided KJV text. `temperature: 0` minimises
   creative deviation.
5. After the reply, every Bible reference in the response is checked against the
   local KJV index. Any reference not found is logged as a warning:
   `[hallucination-check] unverified reference: <ref>`
6. If the Anthropic API key is not set, the bot falls back to sending the top
   2 matching verses directly without Claude.

Scheduled verses are delivered at **07:30, 12:00, 16:30, and 21:00** in the
configured timezone (default: `America/Los_Angeles`). Users can customise these
times with `/settime`.

---

## Providing kjv.json

The bot only sends verses from `data/kjv.json`. The file is **not** included in
this repo. You must supply it yourself.

**Required format** — a flat JSON array of verse objects:

```json
[
  { "book_name": "Genesis",    "chapter": 1, "verse": 1, "text": "In the beginning..." },
  { "book_name": "Genesis",    "chapter": 1, "verse": 2, "text": "And the earth was..." },
  ...
  { "book_name": "Revelation", "chapter": 22, "verse": 21, "text": "The grace of our..." }
]
```

Alternate field names `book`, `Book`, `Chapter`, `Verse`, `Text` are accepted.
The file must cover all books referenced in `data/topics.json`.

> A complete public-domain KJV in this exact format is available at
> [thiagobodruk/bible](https://github.com/thiagobodruk/bible) — use `en_kjv.json`
> and convert the nested-array format to the flat-object format shown above.

---

## Commands

| Command | Description |
|---|---|
| `/start` | Register the user |
| `/topics` | List suggested topics (users are not limited to these) |
| `/topic <anything>` | Set your topic to **any word or phrase** — e.g. `/topic David`, `/topic Holy Spirit`, `/topic healing` |
| `/times` | Show your current scheduled delivery times |
| `/settime <slot> <HH:MM>` | Change a time slot (e.g. `/settime morning 08:00`) |

Valid slots: `morning`, `midday`, `afternoon`, `evening`

Default schedule: **07:30 · 12:00 · 16:30 · 21:00** (`America/Los_Angeles`)

The `/topic` command accepts any word or phrase — not just the predefined list.
Custom topics are searched against the full KJV text at delivery time.

---

## Predefined topics

`encouragement` · `faith` · `love` · `hope` · `peace` · `strength` · `wisdom`
`anxiety` · `fear` · `forgiveness` · `gratitude` · `salvation` · `prayer`
`grief` · `joy`

Users can also set custom topics like `david`, `holy spirit`, `grace`, or any
other word that appears in the KJV. The bot searches the full 31,100-verse
index and falls back to `encouragement` if nothing is found.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOT_TOKEN` | Yes | — | Telegram bot token from @BotFather |
| `PUBLIC_URL` | Yes (prod) | `https://bible-companion-bot.onrender.com` | Public HTTPS URL of the deployed service |
| `ANTHROPIC_API_KEY` | Yes (for AI replies) | — | Anthropic API key — bot falls back to raw verses if absent |
| `PORT` | No | `3000` | Port Express listens on |
| `TZ` | No | `America/Los_Angeles` | IANA timezone for scheduling |

> **Note:** The env variable for the Telegram token is `BOT_TOKEN` (not
> `TELEGRAM_BOT_TOKEN`). This matches what @BotFather issues and what is set in
> the Render dashboard.

---

## Local development (Windows)

### Prerequisites
- Node.js 20+ (no Visual Studio Build Tools or node-gyp required — all deps are pure JS)
- A Telegram bot token (create one with [@BotFather](https://t.me/BotFather))
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
- Your `data/kjv.json` file (see "Providing kjv.json" above)

### Setup

Run these commands in **Command Prompt** or **PowerShell** from the project folder:

```cmd
npm install
copy .env.example .env
```

Open `.env` and fill in at minimum:

```
BOT_TOKEN=your_telegram_bot_token_here
PUBLIC_URL=https://your-ngrok-or-render-url.com
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

For local development without a public URL, use [ngrok](https://ngrok.com/):

```cmd
ngrok http 3000
```

Copy the `https://` URL ngrok gives you into `.env` as `PUBLIC_URL`, then start
the bot:

```cmd
npm run dev
```

### Run the test suite

```cmd
node --env-file=.env scripts/test.js
```

25 assertions covering topic detection, verse search, `verifyRef`, hallucination
check regex, the full context-building pipeline, and a live Claude API call
(skipped if `ANTHROPIC_API_KEY` is not set locally).

---

## Deploying on Render

### 1. Create a new Web Service

- Go to [render.com](https://render.com) → **New → Web Service**
- Connect your GitHub repository
- Set:

| Field | Value |
|---|---|
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

### 2. Add environment variables

In **Environment** add:

| Key | Value |
|---|---|
| `BOT_TOKEN` | Your token from @BotFather |
| `PUBLIC_URL` | `https://bible-companion-bot.onrender.com` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `TZ` | `America/Los_Angeles` (or your timezone) |

### 3. Add a persistent disk

User data (`users.json`, `sent_verses.json`) must survive deploys:

1. Service → **Disks** → **Add Disk**
2. **Mount Path**: `/var/data`
3. Size: 1 GB is more than enough
4. Click **Save**

Without a persistent disk, user registrations and sent-verse logs reset on
every deploy.

### 4. Register the Telegram webhook

After the service is live, run once (locally):

```cmd
node --env-file=.env scripts/setWebhook.js
```

Expected output:

```
Setting webhook to: https://bible-companion-bot.onrender.com/telegram
setWebhook → ok | Webhook was set

getWebhookInfo:
  ok               : true
  url              : https://bible-companion-bot.onrender.com/telegram
  last_error_message: (none)
  last_error_date  : (none)
  pending_update_count: 0

Webhook is active and pointing to the correct URL.
```

### 5. Verify the service is up

```cmd
curl https://bible-companion-bot.onrender.com/health
```

Returns `ok` if the server is running.

---

## Troubleshooting

### Bot does not respond to messages

1. Check Render logs for `[webhook] Confirmed active: ...` on startup.
2. If it shows `Registration failed: 404`, verify `BOT_TOKEN` is set correctly
   in the Render dashboard.
3. Confirm `ANTHROPIC_API_KEY` is set — without it Claude is disabled and the
   bot falls back to raw verses only.

### Telegram webhook errors

1. Confirm `PUBLIC_URL` is exactly `https://bible-companion-bot.onrender.com`
   (no trailing slash).
2. Run `node --env-file=.env scripts/setWebhook.js` and check
   `last_error_message`.
3. Common errors:
   - **"Wrong response from the webhook"** → service hasn't finished deploying;
     wait and retry.
   - **"Connection refused"** → service is down; check Render logs.
4. Check `GET /health` returns `ok`. If not, look for `[FATAL]` in Render logs
   (usually missing `BOT_TOKEN` or bad `kjv.json`).

### kjv.json not found / empty

The startup log will print `[FATAL]` with instructions. Place a valid flat-array
KJV JSON file at `data/kjv.json` and redeploy. The simplest approach is to
commit it directly to your private GitHub repo.

### Hallucination warnings in logs

If you see `[hallucination-check] unverified reference: <ref>`, it means Claude
cited a Bible reference that does not exist in the local `kjv.json`. The verse
was still sent to the user — the check is a warning only. To suppress false
positives, verify the book name spelling matches what is in your `kjv.json`.

---

## Extending topics

To add a new predefined topic:

1. Add an entry in `data/topics.json` with verse references that exist in your
   `kjv.json`.
2. Add relevant keywords in `data/keyword_map.json` pointing to the new topic.
3. Restart the bot — no code changes needed.

Custom topics (any word set via `/topic`) are supported automatically via
full-text search and do not require changes to `topics.json`.
