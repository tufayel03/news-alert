# 📈 Forex & Commodity AI News Alert Worker

An automated market news monitor built for Cloudflare Workers. It scrapes real-time financial news feeds (ForexLive, FXStreet, DailyFX, CNBC), uses **Cloudflare Workers AI** (`Llama 3.1 8B`) to evaluate market impact on **USD**, **EUR**, **Gold (XAUUSD)**, and **Oil (WTI)**, and posts color-coded alerts to a **Discord Webhook**.

---

## ⚡ Features

- 🔴 **Impact Assessment**: Classifies news as `HIGH`, `MEDIUM`, `LOW`, or `NONE`.
- 📊 **Asset Sentiments**: Evaluates Directional Bias (`📈 BULLISH`, `📉 BEARISH`, `⚖️ NEUTRAL`) for **USD**, **EUR**, **Gold**, and **Oil**.
- 💡 **Key Takeaways & Trading Notes**: Extracts actionable market context for traders.
- 🎨 **Rich Discord Embeds**: Color-coded alerts (Red for High Impact, Amber for Medium) sent straight to your Discord channel.
- 🔄 **Deduplication Engine**: Uses **Cloudflare KV** to prevent duplicate alerts.
- ⏱️ **Cron Trigger**: Checks news every 3 minutes automatically.
- 💯 **100% Free Tier Compatible**: Runs entirely within Cloudflare's permanent free tier.

---

## 🚀 Quick Setup & Deployment Guide

### 1. Set Up Cloudflare KV Namespace

Run the following command to create your KV namespace for deduplication state:

```bash
npx wrangler kv namespace create NEWS_KV
```

Copy the generated `id` from the terminal output and paste it into your [wrangler.json](file:///c:/Users/toxic/Documents/Projects/news%20alert/wrangler.json):

```json
"kv_namespaces": [
  {
    "binding": "NEWS_KV",
    "id": "YOUR_ACTUAL_KV_NAMESPACE_ID_HERE"
  }
]
```

---

### 2. Set Up Discord Webhook Secret

Create a Webhook in your Discord channel (`Channel Settings` -> `Integrations` -> `Webhooks` -> `Copy Webhook URL`).

Set the webhook secret in Cloudflare:

```bash
npx wrangler secret put DISCORD_WEBHOOK_URL
```

*(When prompted, paste your Discord Webhook URL)*.

---

### 3. (Optional) Customize Minimum Impact Filter

By default, the worker alerts on **MEDIUM** and **HIGH** impact events. If you want all news or high-impact only, set the secret:

```bash
npx wrangler secret put MIN_IMPACT_LEVEL
# Enter: HIGH, MEDIUM, or ALL
```

---

### 4. Deploy to Cloudflare

Deploy the worker to Cloudflare:

```bash
npm run deploy
```

Once deployed, Cloudflare Cron Triggers will execute the worker automatically every 3 minutes.

---

## 🧪 Local Testing & Manual Triggering

You can run the worker locally using Wrangler:

```bash
npm run dev
```

Then visit in your browser or curl:
- `http://localhost:8787/status` - View worker health and status.
- `http://localhost:8787/trigger` - Manually execute a news scraping & AI analysis cycle.
