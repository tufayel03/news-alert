import { Env } from "./types";
import { fetchLatestNews } from "./feeds";
import { isArticleAlerted, markArticleAlerted } from "./kv";
import { analyzeNewsWithAI } from "./ai";
import { sendDiscordAlert } from "./discord";
import { processEconomicCalendar } from "./calendar";

async function processNews(env: Env) {
  const startTime = Date.now();
  console.log("Starting Forex AI News Alert processing...");

  const articles = await fetchLatestNews();
  console.log(`Fetched ${articles.length} total news items from RSS feeds.`);

  let alertedCount = 0;
  let skippedCount = 0;
  let nonRelevantCount = 0;

  const minImpact = (env.MIN_IMPACT_LEVEL || "MEDIUM").toUpperCase();

  for (const article of articles) {
    // 1. Check KV deduplication
    const isAlreadyAlerted = await isArticleAlerted(env, article.id);
    if (isAlreadyAlerted) {
      skippedCount++;
      continue;
    }

    console.log(`Analyzing new article: "${article.title}" (${article.source})`);

    // 2. Run AI Analysis
    let analysis = await analyzeNewsWithAI(env, article);
    let isRawFallback = false;

    // Fallback: If AI fails (e.g. credit/quota limit exhausted or service error), send RAW alert!
    if (!analysis) {
      console.warn(`[RAW FALLBACK] AI unavailable for "${article.title}". Sending raw breaking news alert.`);
      isRawFallback = true;
      analysis = {
        isRelevant: true,
        impactLevel: "HIGH",
        headlineSummary: article.content ? article.content.slice(0, 350) + "..." : article.title,
        keyTakeaways: [
          "⚠️ Cloudflare AI Free Credits Exhausted or AI Unavailable.",
          "Raw Breaking News headline sent directly so you never miss market events."
        ],
        affectedAssets: [],
        tradingNote: `Read full story at: ${article.link}`
      };
    }

    if (!analysis.isRelevant || analysis.impactLevel === "NONE") {
      nonRelevantCount++;
      await markArticleAlerted(env, article.id, article.title);
      continue;
    }

    // Default filter: High impact news unless MIN_IMPACT_LEVEL is explicitly changed
    const minImpact = (env.MIN_IMPACT_LEVEL || "HIGH").toUpperCase();
    const shouldAlert = isRawFallback || minImpact === "ALL" || analysis.impactLevel === minImpact || (minImpact === "MEDIUM" && analysis.impactLevel === "HIGH");

    if (shouldAlert && env.DISCORD_WEBHOOK_URL) {
      console.log(`[ALERT] ${isRawFallback ? "RAW FALLBACK" : "AI"} Impact ${analysis.impactLevel}: Sending Discord alert for "${article.title}"`);
      const sent = await sendDiscordAlert(env.DISCORD_WEBHOOK_URL, article, analysis);
      if (sent) {
        alertedCount++;
      }
    } else {
      console.log(`Skipped alert for "${article.title}" (Impact: ${analysis.impactLevel}, Filter: ${minImpact})`);
    }

    // 3. Mark article as processed in KV state
    await markArticleAlerted(env, article.id, article.title);
  }

  const durationMs = Date.now() - startTime;
  
  // Also process High-Impact Economic Calendar data releases (CPI, Interest Rates, NFP, GDP)
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
  };

  console.log("Processing finished:", JSON.stringify(summary));
  return summary;
}

export default {
  /**
   * Cron Trigger handler (runs automatically on scheduled intervals)
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processNews(env));
  },

  /**
   * HTTP Fetch handler (for testing, manual triggering, or monitoring status)
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/status") {
      return new Response(
        JSON.stringify({
          status: "online",
          service: "Forex AI News Alert Worker",
          timestamp: new Date().toISOString(),
          minImpact: env.MIN_IMPACT_LEVEL || "MEDIUM",
          hasWebhook: Boolean(env.DISCORD_WEBHOOK_URL),
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.pathname === "/trigger" || url.pathname === "/test" || url.pathname === "/") {
      const summary = await processNews(env);
      return new Response(JSON.stringify({ message: "News processing cycle completed", summary }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
