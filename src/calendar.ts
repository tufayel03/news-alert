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
  "china": "CNY",
};

/**
 * Fetch strictly High Impact (Red Folder) economic calendar events
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
          // RED FOLDER / HIGH IMPACT ONLY (item.impact === 3 or "3" or "HIGH")
          if (item.impact !== 3 && item.impact !== "3" && item.impact !== "HIGH") continue;

          const rawCountry = (item.country || "").toLowerCase().trim();
          const currency = COUNTRY_CURRENCY_MAP[rawCountry] || (item.currencyCode || "").toUpperCase();
          if (!["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "NZD", "CHF", "CNY"].includes(currency)) continue;

          events.push({
            id: String(item.id || `evt-${item.name}-${item.date}`),
            title: item.name || "Economic Event",
            countryCode: rawCountry || "US",
            currencyCode: currency,
            dateUtc: item.date || new Date().toISOString(),
            volatility: "HIGH",
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
 * Analyze an economic event release using Cloudflare AI to determine instant verdict on USD, EUR, GBP, and GOLD.
 */
export async function analyzeCalendarVerdict(env: Env, event: CalendarEvent): Promise<CalendarVerdict | null> {
  const actualStr = event.actual !== null ? String(event.actual) : "Released";
  const consensusStr = event.consensus !== null ? String(event.consensus) : "N/A";
  const previousStr = event.previous !== null ? String(event.previous) : "N/A";

  const prompt = `You are a high-speed institutional Forex Analyst.
An Economic Indicator has been published on ForexFactory:

EVENT: "${event.title}" (${event.currencyCode})
ACTUAL: ${actualStr}
FORECAST: ${consensusStr}
PREVIOUS: ${previousStr}

Rules:
1. Identify ONLY directly impacted currencies/assets ("USD", "EUR", "GBP", "GOLD"). Do NOT use currency pairs (no EURUSD, no GBPUSD).
2. Do NOT include unaffected or neutral currencies. Only list currencies that are clearly BULLISH or BEARISH.
3. Provide a clear, concise verdict summary around 2 lines (approx 20-30 words).
4. Output STRICT RAW JSON format ONLY:

{
  "verdictSummary": "Concise 2-line summary on the release impact.",
  "currencyImpacts": [
    {
      "currency": "${event.currencyCode}",
      "sentiment": "BULLISH", // "BULLISH" or "BEARISH"
      "reason": "Actual better than forecast"
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
      max_tokens: 350,
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

  const currencyEmojis: Record<string, string> = {
    USD: "💵 USD",
    EUR: "💶 EUR",
    GBP: "💷 GBP",
    GOLD: "🥇 GOLD",
    XAUUSD: "🥇 GOLD",
  };

  const sentimentEmojis: Record<string, string> = {
    BULLISH: "⬆️ BULLISH",
    BEARISH: "⬇️ BEARISH",
    NEUTRAL: "N NEUTRAL",
  };

  const impactedList = (verdict.currencyImpacts || []).filter(
    (c) => c.sentiment === "BULLISH" || c.sentiment === "BEARISH"
  );

  const impactsFormatted = impactedList.length > 0
    ? impactedList
        .map((p) => {
          const key = (p.currency || "").toUpperCase();
          const name = currencyEmojis[key] || key;
          const sent = sentimentEmojis[p.sentiment] || p.sentiment;
          return `• **${name}**: ${sent} — *${p.reason}*`;
        })
        .join("\n")
    : null;

  const fields: { name: string; value: string; inline?: boolean }[] = [
    {
      name: "📊 Released Economic Data",
      value: `• **Actual**: \`${actualStr}\`\n• **Forecast**: \`${consensusStr}\`\n• **Previous**: \`${previousStr}\``,
      inline: true,
    },
  ];

  if (impactsFormatted) {
    fields.push({
      name: "🎯 Currency & Commodity Impact",
      value: impactsFormatted.slice(0, 1024),
      inline: false,
    });
  }

  const embed = {
    title: `🚨 HIGH IMPACT DATA RELEASE: ${evt.title} [${evt.currencyCode}]`,
    url: "https://www.forexfactory.com/calendar",
    color: 0xDC2626, // Bright Red Embed
    description: `**ForexFactory Instant Release**\n\n**Verdict**: ${verdict.verdictSummary}`,
    fields,
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
    AUD: "🇦🇺 AUD",
    CAD: "🇨🇦 CAD",
    JPY: "🇯🇵 JPY",
    NZD: "🇳🇿 NZD",
    CHF: "🇨🇭 CHF",
    CNY: "🇨🇳 CNY",
  };

  const flag = currencyFlags[evt.currencyCode] || evt.currencyCode;

  const embed = {
    title: `⏰ 30-MIN PRE-ALERT: ${evt.title} [${flag}]`,
    url: "https://www.forexfactory.com/calendar",
    color: 0xF59E0B, // Amber Warning Embed
    description: `**🚨 FOREXFACTORY RED FOLDER NEWS IN ~${minsRemaining} MINUTES!**`,
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
    // Red Folder (High Impact) events only
    if (evt.volatility !== "HIGH") continue;
    if (!["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "NZD", "CHF", "CNY"].includes(evt.currencyCode)) continue;

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
          currencyImpacts: [
            { currency: evt.currencyCode, sentiment: "NEUTRAL", reason: "Raw data alert" },
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
