import { CalendarEvent, CalendarVerdict, Env } from "./types";
import { hashString, isArticleAlerted, markArticleAlerted } from "./kv";
import { sendDiscordAlert } from "./discord";
import { getWebhookUrl } from "./index";

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  "united-states": "USD",
  "euro-zone": "EUR",
  "germany": "EUR",
  "france": "EUR",
  "italy": "EUR",
  "spain": "EUR",
  "united-kingdom": "GBP",
  "japan": "JPY",
  "australia": "AUD",
  "canada": "CAD",
  "switzerland": "CHF",
  "new-zealand": "NZD",
};

/**
 * Fetch high impact economic calendar events from FXEmpire Live API
 */
export async function fetchEconomicEvents(): Promise<CalendarEvent[]> {
  try {
    const url = "https://www.fxempire.com/api/v1/en/economic-calendar";
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ForexAINewsAlert/1.0",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      console.warn(`Economic Calendar API returned status: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as any;
    const events: CalendarEvent[] = [];

    if (data?.calendar && Array.isArray(data.calendar)) {
      for (const day of data.calendar) {
        if (!Array.isArray(day.events)) continue;
        for (const item of day.events) {
          const rawCountry = (item.country || "").toLowerCase().trim();
          const currency = COUNTRY_CURRENCY_MAP[rawCountry] || (item.currencyCode || "").toUpperCase();
          if (!["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "NZD", "CHF"].includes(currency)) continue;

          const impactMap: Record<number, string> = { 3: "HIGH", 2: "MEDIUM", 1: "LOW" };
          const volatility = impactMap[item.impact] || "HIGH";

          events.push({
            id: String(item.id || `evt-${item.name}-${item.date}`),
            title: item.name || "Economic Event",
            countryCode: rawCountry || "US",
            currencyCode: currency,
            dateUtc: item.date || new Date().toISOString(),
            volatility,
            actual: item.actual !== "" && item.actual !== undefined ? item.actual : null,
            consensus: item.forecast !== "" && item.forecast !== undefined ? item.forecast : null,
            previous: item.previous !== "" && item.previous !== undefined ? item.previous : null,
          });
        }
      }
    }

    return events;
  } catch (err) {
    console.error("Failed to fetch economic calendar events:", err);
    return [];
  }
}

/**
 * Analyze an economic event release using Cloudflare AI to determine instant verdict on EURUSD, GBPUSD, XAUUSD, and USOIL.
 */
export async function analyzeCalendarVerdict(env: Env, event: CalendarEvent): Promise<CalendarVerdict | null> {
  const actualStr = event.actual !== null ? String(event.actual) : "Released";
  const consensusStr = event.consensus !== null ? String(event.consensus) : "N/A";
  const previousStr = event.previous !== null ? String(event.previous) : "N/A";

  const prompt = `You are a high-speed institutional Forex Analyst.
A major High-Impact Economic Indicator has just been published on ForexFactory:

EVENT: "${event.title}" (${event.currencyCode})
ACTUAL: ${actualStr}
FORECAST/CONSENSUS: ${consensusStr}
PREVIOUS: ${previousStr}

Analyze the immediate impact on trading pairs: EURUSD, GBPUSD, and XAUUSD (Gold).
Provide output in STRICT RAW JSON format ONLY:

{
  "verdictSummary": "One-line instant verdict on whether this data is Bullish or Bearish for ${event.currencyCode}.",
  "pairSentiments": [
    {
      "pair": "EURUSD",
      "sentiment": "BEARISH", // "BULLISH", "BEARISH", or "NEUTRAL"
      "reason": "1-line direct impact explanation."
    },
    {
      "pair": "GBPUSD",
      "sentiment": "BEARISH",
      "reason": "1-line direct impact explanation."
    },
    {
      "pair": "XAUUSD",
      "sentiment": "BEARISH",
      "reason": "1-line direct impact explanation."
    }
  ]
}`;

  try {
    const response = (await env.AI.run(AI_MODEL, {
      messages: [
        { role: "system", content: "You are a Forex AI analyst providing instant economic event verdicts in clean English raw JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 200,
    })) as { response?: string } | undefined;

    const textOutput = response?.response;
    if (!textOutput) return null;

    const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as CalendarVerdict;
    parsed.event = event;
    return parsed;
  } catch (err) {
    console.error("AI Calendar analysis error:", err);
    return null;
  }
}

/**
 * Format and send Instant High-Impact Calendar Verdict to Discord Webhook
 */
export async function sendCalendarDiscordAlert(webhookUrl: string, verdict: CalendarVerdict): Promise<boolean> {
  const evt = verdict.event;

  const actualStr = evt.actual !== null ? String(evt.actual) : "Published";
  const consensusStr = evt.consensus !== null ? String(evt.consensus) : "N/A";
  const previousStr = evt.previous !== null ? String(evt.previous) : "N/A";

  const pairEmojis: Record<string, string> = {
    EURUSD: "💶 EURUSD",
    GBPUSD: "💷 GBPUSD",
    XAUUSD: "🥇 XAUUSD (Gold)",
  };

  const sentimentEmojis: Record<string, string> = {
    BULLISH: "📈 BULLISH",
    BEARISH: "📉 BEARISH",
    NEUTRAL: "⚖️ NEUTRAL",
  };

  const pairsFormatted = verdict.pairSentiments && verdict.pairSentiments.length > 0
    ? verdict.pairSentiments
        .map((p) => {
          const name = pairEmojis[p.pair] || p.pair;
          const sent = sentimentEmojis[p.sentiment] || p.sentiment;
          return `• **${name}**: ${sent} — *${p.reason}*`;
        })
        .join("\n")
    : "No major pair bias";

  const embed = {
    title: `🚨 HIGH IMPACT DATA RELEASE: ${evt.title} [${evt.currencyCode}]`,
    url: "https://www.forexfactory.com/calendar",
    color: 0xDC2626, // Bright Red Embed
    description: `**ForexFactory Instant Release**\n\n**Verdict**: ${verdict.verdictSummary}`,
    fields: [
      {
        name: "📊 Released Economic Data",
        value: `• **Actual**: \`${actualStr}\`\n• **Forecast**: \`${consensusStr}\`\n• **Previous**: \`${previousStr}\``,
        inline: true,
      },
      {
        name: "🎯 Pair Impact (EURUSD, GBPUSD, XAUUSD)",
        value: pairsFormatted.slice(0, 1024),
        inline: false,
      },
    ],
    footer: {
      text: "ForexFactory Instant Verdict Sentinel • Cloudflare Workers AI",
    },
    timestamp: new Date().toISOString(),
  };

  const payload = {
    username: "ForexFactory Instant Alert Sentinel",
    avatar_url: "https://cdn-icons-png.flaticon.com/512/2920/2920349.png",
    embeds: [embed],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to send calendar discord alert:", err);
    return false;
  }
}

/**
 * Format and send 30-Minute Pre-Alert Warning for upcoming Red Folder news to Discord
 */
export async function sendPreAlertDiscordAlert(webhookUrl: string, evt: CalendarEvent, minsRemaining: number): Promise<boolean> {
  const forecastStr = evt.consensus !== null ? String(evt.consensus) : "N/A";
  const previousStr = evt.previous !== null ? String(evt.previous) : "N/A";

  const currencyFlags: Record<string, string> = {
    USD: "🇺🇸 USD",
    EUR: "🇪🇺 EUR",
    GBP: "🇬🇧 GBP",
  };

  const flag = currencyFlags[evt.currencyCode] || evt.currencyCode;

  const embed = {
    title: `⏰ 30-MIN PRE-ALERT: ${evt.title} [${flag}]`,
    url: "https://www.forexfactory.com/calendar",
    color: 0xF59E0B, // Amber Warning Embed
    description: `**🚨 FOREXFACTORY RED FOLDER NEWS IN ~${minsRemaining} MINUTES!**\n\nHigh market volatility expected on **EURUSD**, **GBPUSD**, and **XAUUSD (Gold)**.`,
    fields: [
      {
        name: "📅 Event Details",
        value: `• **Event**: ${evt.title}\n• **Currency**: ${flag}\n• **Release Time**: <t:${Math.floor(new Date(evt.dateUtc).getTime() / 1000)}:R>`,
        inline: true,
      },
      {
        name: "📈 Market Forecast",
        value: `• **Forecast**: \`${forecastStr}\`\n• **Previous**: \`${previousStr}\``,
        inline: true,
      },
      {
        name: "⚠️ Risk & Trading Warning",
        value: "```\nExpect sharp spread widening, slippage, and rapid price spikes. Adjust stop-losses or reduce position sizes before the release.\n```",
        inline: false,
      },
    ],
    footer: {
      text: "ForexFactory Pre-Alert Sentinel • Cloudflare Workers AI",
    },
    timestamp: new Date().toISOString(),
  };

  const payload = {
    username: "ForexFactory 30-Min Pre-Alert Sentinel",
    avatar_url: "https://cdn-icons-png.flaticon.com/512/2920/2920349.png",
    embeds: [embed],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to send pre-alert discord alert:", err);
    return false;
  }
}

/**
 * Process economic calendar events cycle (both 30-min Pre-Alerts and Instant Verdicts)
 */
export async function processEconomicCalendar(env: Env) {
  const events = await fetchEconomicEvents();
  let alertedCount = 0;
  const nowMs = Date.now();

  const webhookInfo = await getWebhookUrl(env);
  const webhookUrl = webhookInfo.url;

  for (const evt of events) {
    // Only check Red Folder currencies: USD, EUR, GBP
    if (!["USD", "EUR", "GBP"].includes(evt.currencyCode)) continue;

    const eventTimeMs = new Date(evt.dateUtc).getTime();
    const diffMins = (eventTimeMs - nowMs) / (1000 * 60);

    // 1. CHECK FOR 30-MINUTE PRE-ALERT (Triggers when event is 20 to 35 minutes away)
    if (diffMins >= 20 && diffMins <= 35) {
      const cleanTitle = evt.title.toLowerCase().trim();
      const preAlertHash = await hashString(`pre30m:${cleanTitle}:${evt.currencyCode}`);
      const isPreAlerted = await isArticleAlerted(env, preAlertHash);

      if (!isPreAlerted && webhookUrl) {
        console.log(`[30-MIN PRE-ALERT] Upcoming Red Folder event: ${evt.title} (${evt.currencyCode}) in ${Math.round(diffMins)} mins`);
        const sent = await sendPreAlertDiscordAlert(webhookUrl, evt, Math.round(diffMins));
        if (sent) alertedCount++;
        await markArticleAlerted(env, preAlertHash, `PreAlert: ${evt.title}`);
      }
    }

    // 2. CHECK FOR INSTANT RELEASE VERDICT (When actual result is published within last 30 minutes)
    if (evt.actual !== null && evt.actual !== undefined) {
      const ageMs = nowMs - eventTimeMs;
      // Discard calendar releases older than 30 minutes (1,800,000ms) or in the future
      if (ageMs > 30 * 60 * 1000 || ageMs < 0) {
        continue;
      }

      const cleanTitle = evt.title.toLowerCase().trim();
      const eventHash = await hashString(`cal:${cleanTitle}:${evt.currencyCode}:${evt.actual}`);
      const isAlerted = await isArticleAlerted(env, eventHash);
      if (isAlerted) continue;

      console.log(`[CALENDAR EVENT RELEASED] ${evt.title} (${evt.currencyCode}) - Actual: ${evt.actual}`);

      let verdict = await analyzeCalendarVerdict(env, evt);
      if (!verdict) {
        verdict = {
          event: evt,
          verdictSummary: `${evt.title} data released: Actual ${evt.actual} vs Forecast ${evt.consensus || "N/A"}.`,
          pairSentiments: [
            { pair: "EURUSD", sentiment: "NEUTRAL", reason: "Raw data alert" },
            { pair: "GBPUSD", sentiment: "NEUTRAL", reason: "Raw data alert" },
            { pair: "XAUUSD", sentiment: "NEUTRAL", reason: "Raw data alert" },
          ],
        };
      }

      if (webhookUrl) {
        const sent = await sendCalendarDiscordAlert(webhookUrl, verdict);
        if (sent) alertedCount++;
      }

      await markArticleAlerted(env, eventHash, evt.title);
    }
  }

  return alertedCount;
}
