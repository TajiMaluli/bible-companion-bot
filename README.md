# bible-companion-bot

A Telegram bot that sends KJV Bible verses on a daily schedule. Verses are drawn
exclusively from `data/kjv.json` — no paraphrasing, no commentary.

---

## Project structure

```
bible-companion-bot/
  package.json
  .env.example
  .gitignore
  src/
    index.js       — Express server, webhook setup, startup
    db.js          — SQLite connection and schema
    bot.js         — Telegraf commands and keyword handler
    scheduler.js   — node-cron per-minute scheduler
    verses.js      — KJV index, topic lookup, daily-repeat prevention
  data/
    kjv.json           — *** YOU MUST PROVIDE THIS FILE (see below) ***
    topics.json        — Verse references grouped by topic
    keyword_map.json   — Keyword → topic mapping
```

---

## Providing kjv.json

The bot only sends verses from `data/kjv.json`. The file is **not** included in
this repo. You must supply it yourself.

**Required format** — a flat JSON array of verse objects:

```json
[
  { "book_name": "Genesis",     "chapter": 1, "verse": 1, "text": "In the beginning..." },
  { "book_name": "Genesis",     "chapter": 1, "verse": 2, "text": "And the earth was..." },
  ...
  { "book_name": "Revelation",  "chapter": 22, "verse": 21, "text": "The grace of our..." }
]
```

Alternate field names `book`, `Book`, `Chapter`, `Verse`, `Text` are also
accepted. The file must cover all books referenced in `data/topics.json`.

> A good public source: search for "KJV JSON" on GitHub. Many repositories
> publish the complete KJV as a single JSON array in the format above.

**Book names in kjv.json must exactly match those used in topics.json.**
The default topics.json uses names like `"Psalms"`, `"1 Corinthians"`,
`"2 Corinthians"`, `"1 John"`, `"2 Samuel"`, etc. Verify your KJV file uses
the same spelling before deploying.

---

## Commands

| Command | Description |
|---|---|
| `/start` | Register the user |
| `/topics` | List all available topics |
| `/topic <name>` | Set your topic (e.g. `/topic faith`) |
| `/times` | Show your current scheduled times |
| `/settime <slot> <HH:MM>` | Change a time slot (e.g. `/settime morning 08:00`) |

Valid slots: `morning`, `midday`, `afternoon`, `evening`

Default schedule: **07:30 · 12:00 · 16:30 · 21:00** (in your configured TZ)

The bot also detects keywords in plain messages (e.g. "I feel anxious") and
replies with 1–2 relevant verses without changing your stored topic.

---

## Available topics

`encouragement` · `faith` · `love` · `hope` · `peace` · `strength` · `wisdom`
`anxiety` · `fear` · `forgiveness` · `gratitude` · `salvation` · `prayer`
`grief` · `joy`

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOT_TOKEN` | Yes | — | Telegram bot token from @BotFather |
| `PUBLIC_URL` | Yes (prod) | — | Public HTTPS URL of the deployed service |
| `PORT` | No | `3000` | Port Express listens on |
| `TZ` | No | `America/Los_Angeles` | IANA timezone for scheduling |
| `SQLITE_PATH` | — | — | *(removed — no longer used)* |

---

## Local development (Windows)

### Prerequisites
- Node.js 20+ (no Visual Studio Build Tools or node-gyp required — all deps are pure JS)
- A Telegram bot token (create one with [@BotFather](https://t.me/BotFather))
- Your `data/kjv.json` file (see "Providing kjv.json" above)

### To get running

Run these commands in **Command Prompt** or **PowerShell** from the project folder:

```cmd
rmdir /s /q node_modules
del package-lock.json
npm install
copy .env.example .env
```

Open `.env` in a text editor and set at minimum:

```
BOT_TOKEN=your_telegram_bot_token_here
PUBLIC_URL=https://your-ngrok-or-render-url.com
```

For local development without a public URL, use [ngrok](https://ngrok.com/) to
expose your local server:

```cmd
ngrok http 3000
```

Copy the `https://` URL ngrok gives you into `.env` as `PUBLIC_URL`.

Start the bot:

```cmd
npm run dev
```

The bot logs `[verses] KJV index built: X verses loaded.` on startup. If it
instead prints `[FATAL]` and exits, check that `data/kjv.json` is present and
contains valid data (see "Providing kjv.json" above).

---

## Deploying on Render

### 1. Create a new Web Service

- Go to [render.com](https://render.com) and click **New → Web Service**
- Connect your GitHub repository
- Set the following:

| Field | Value |
|---|---|
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

### 2. Add environment variables

In the Render dashboard → your service → **Environment**, add:

| Key | Value |
|---|---|
| `BOT_TOKEN` | Your token from @BotFather |
| `PUBLIC_URL` | `https://bible-companion-bot.onrender.com` |
| `TZ` | `America/Los_Angeles` (or your timezone) |

### 3. Add a persistent disk

User data (`users.json`, `sent_verses.json`) must survive deploys. In Render:

1. Go to your service → **Disks** → **Add Disk**
2. Set **Mount Path** to `/var/data`
3. Set a reasonable size (1 GB is more than enough)
4. Click **Save**

Without a persistent disk, user registrations reset on every deploy.

### 4. Register the Telegram webhook

After the service is live, run this **once** (locally or from the Render shell):

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

If `last_error_message` is not `(none)`, see the **Troubleshooting** section below.

**From the Render shell** (if env vars are already set there):

```bash
node scripts/setWebhook.js
```

### 5. Verify the service is up

```cmd
curl https://bible-companion-bot.onrender.com/health
```

Returns `ok` if the server is running. If it times out, check the Render logs —
the most common cause is the service sleeping on the free tier (first request
wakes it; try again after ~30 seconds).

---

## Troubleshooting

### Telegram returns `ok: false` / webhook errors

1. Confirm `PUBLIC_URL` in Render env is exactly `https://bible-companion-bot.onrender.com` (no trailing slash).
2. Run `node --env-file=.env scripts/setWebhook.js` and check `last_error_message`.
3. Common errors:
   - **"Wrong response from the webhook"** → the service hasn't finished deploying yet; wait and retry.
   - **"Connection refused"** → the service is down or hasn't bound to `0.0.0.0`; check Render logs.
   - **"SSL error"** → Render provides TLS automatically; no action needed on your side.
4. Check `GET /health` returns `ok`. If it doesn't, the app crashed on startup — check Render logs for `[FATAL]` messages (usually a missing `BOT_TOKEN` or bad `kjv.json`).

### 7. Upload kjv.json

After deploying, use the Render **Shell** tab (or a startup script) to place
`kjv.json` in `data/`. Alternatively, commit the file to your repo before
deploying (it may be large — check Render's free-tier limits).

The simplest approach is to commit `data/kjv.json` to your private GitHub repo
alongside the other files.

---

## Database schema

```sql
CREATE TABLE users (
  user_id       INTEGER PRIMARY KEY,
  username      TEXT,
  topic         TEXT NOT NULL DEFAULT 'encouragement',
  morning       TEXT NOT NULL DEFAULT '07:30',
  midday        TEXT NOT NULL DEFAULT '12:00',
  afternoon     TEXT NOT NULL DEFAULT '16:30',
  evening       TEXT NOT NULL DEFAULT '21:00',
  registered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE daily_verse_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  verse_ref  TEXT    NOT NULL,
  sent_date  TEXT    NOT NULL,
  UNIQUE(user_id, verse_ref, sent_date)
);
```

---

## Extending topics

To add a new topic:

1. Add an entry in `data/topics.json` with verse references that exist in your
   `kjv.json` (book names must match exactly).
2. Add relevant keywords in `data/keyword_map.json` pointing to the new topic
   name.
3. Restart the bot — no code changes needed.
