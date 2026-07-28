import { Env } from "./types";
import { fetchLatestNews } from "./feeds";
import { isArticleAlerted, markArticleAlerted } from "./kv";
import { analyzeNewsWithAI } from "./ai";
import { sendDiscordAlert } from "./discord";
import { processEconomicCalendar } from "./calendar";
import { renderDashboardHTML } from "./html";

// Default fallback Webhook URL provided by user
const DEFAULT_WEBHOOK_URL = "https://discord.com/api/webhooks/1531686607944679484/wYsOfDm2WQ9jihGLRKx-n2rbiw0Tfa5MOD8bfBN50zdVGymmLqpR4AbljVXXmtcaoc8h";

// Global in-memory fallback for webhook URL if KV is not bound
let inMemoryWebhookUrl: string | null = null;

export async function getWebhookUrl(env: Env): Promise<{ url: string; source: string }> {
  if (env.DISCORD_WEBHOOK_URL && env.DISCORD_WEBHOOK_URL.trim() !== "") {
    return { url: env.DISCORD_WEBHOOK_URL.trim(), source: "Environment Secret" };
  }

  if (env.NEWS_KV) {
    try {
      const kvUrl = await env.NEWS_KV.get("SETTING_WEBHOOK_URL");
      if (kvUrl && kvUrl.trim() !== "") {
        return { url: kvUrl.trim(), source: "Cloudflare KV Database" };
      }
    } catch (err) {
      console.warn("KV fetch error for webhook URL:", err);
    }
  }

  if (inMemoryWebhookUrl && inMemoryWebhookUrl.trim() !== "") {
    return { url: inMemoryWebhookUrl.trim(), source: "Web GUI (Session)" };
  }

  return { url: DEFAULT_WEBHOOK_URL, source: "Default Webhook" };
}

async function processNews(env: Env) {
  const startTime = Date.now();
  console.log("Starting Forex AI News Alert processing...");

  const webhookInfo = await getWebhookUrl(env);
  const webhookUrl = webhookInfo.url;

  const articles = await fetchLatestNews();
  console.log(`Fetched ${articles.length} total news items from RSS feeds.`);

  let alertedCount = 0;
  let skippedCount = 0;
  let nonRelevantCount = 0;

  for (const article of articles) {
    const isAlreadyAlerted = await isArticleAlerted(env, article.id);
    if (isAlreadyAlerted) {
      skippedCount++;
      continue;
    }

    console.log(`Analyzing new article: "${article.title}" (${article.source})`);

    let analysis = await analyzeNewsWithAI(env, article);
    let isRawFallback = false;

    if (!analysis) {
      const isMissingBinding = !env.AI;
      console.warn(`[RAW FALLBACK] AI unavailable for "${article.title}". Sending raw breaking news alert.`);
      isRawFallback = true;
      analysis = {
        isRelevant: true,
        impactLevel: "HIGH",
        headlineSummary: article.content ? article.content.slice(0, 350) + "..." : article.title,
        keyTakeaways: [
          isMissingBinding
            ? "⚠️ Workers AI Binding Missing on Cloudflare Dashboard."
            : "⚠️ Cloudflare AI Free Credits Exhausted or Service Unavailable.",
          isMissingBinding
            ? "Fix: Go to Cloudflare Dashboard -> Workers & Pages -> news-alert -> Settings -> Bindings -> Add Workers AI binding (name: AI)."
            : "Raw Breaking News headline sent directly so you never miss market events."
        ],
        affectedAssets: []
      };
    }

    if (!analysis.isRelevant || analysis.impactLevel === "NONE") {
      nonRelevantCount++;
      await markArticleAlerted(env, article.id, article.title);
      continue;
    }

    const minImpact = (env.MIN_IMPACT_LEVEL || "HIGH").toUpperCase();
    const shouldAlert = isRawFallback || minImpact === "ALL" || analysis.impactLevel === minImpact || (minImpact === "MEDIUM" && analysis.impactLevel === "HIGH");

    if (shouldAlert && webhookUrl) {
      console.log(`[ALERT] ${isRawFallback ? "RAW FALLBACK" : "AI"} Impact ${analysis.impactLevel}: Sending Discord alert for "${article.title}"`);
      const sent = await sendDiscordAlert(webhookUrl, article, analysis);
      if (sent) alertedCount++;
    } else {
      console.log(`Skipped alert for "${article.title}" (Impact: ${analysis.impactLevel}, Filter: ${minImpact})`);
    }

    await markArticleAlerted(env, article.id, article.title);
  }

  const durationMs = Date.now() - startTime;

  console.log("Checking High-Impact Economic Calendar releases...");
  const calendarAlertsCount = await processEconomicCalendar(env);

  const summary = {
    timestamp: new Date().toISOString(),
    durationMs,
    totalFetched: articles.length,
    newsAlerted: alertedCount,
    calendarAlerted: calendarAlertsCount,
    skippedDuplicates: skippedCount,
    nonRelevant: nonRelevantCount,
    webhookConfigured: Boolean(webhookUrl),
    webhookSource: webhookInfo.source,
  };

  console.log("Processing finished:", JSON.stringify(summary));
  return summary;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processNews(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Save Webhook Settings via POST /api/settings
    if (url.pathname === "/api/settings" && request.method === "POST") {
      try {
        const body = (await request.json()) as { webhookUrl?: string };
        const newUrl = body.webhookUrl?.trim();
        if (!newUrl || !newUrl.startsWith("http")) {
          return new Response(JSON.stringify({ error: "Invalid Webhook URL" }), { status: 400 });
        }

        inMemoryWebhookUrl = newUrl;
        if (env.NEWS_KV) {
          await env.NEWS_KV.put("SETTING_WEBHOOK_URL", newUrl);
        }

        return new Response(JSON.stringify({ success: true, message: "Webhook saved successfully" }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
      }
    }

    // Status endpoint
    if (url.pathname === "/status") {
      const webhookInfo = await getWebhookUrl(env);
      return new Response(
        JSON.stringify({
          status: "online",
          service: "Forex AI News & Calendar Sentinel",
          timestamp: new Date().toISOString(),
          minImpact: env.MIN_IMPACT_LEVEL || "HIGH",
          hasWebhook: Boolean(webhookInfo.url),
          webhookSource: webhookInfo.source,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Trigger news run endpoint
    if (url.pathname === "/trigger" || url.pathname === "/test") {
      const summary = await processNews(env);
      return new Response(JSON.stringify({ message: "News & Calendar cycle completed", summary }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Render Web Dashboard GUI on root "/"
    const webhookInfo = await getWebhookUrl(env);
    const html = renderDashboardHTML({
      service: "Forex AI News & Calendar Sentinel",
      hasWebhook: Boolean(webhookInfo.url),
      webhookSource: webhookInfo.source,
      minImpact: env.MIN_IMPACT_LEVEL || "HIGH",
    });

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};
