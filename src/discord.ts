import { ImpactAnalysis, NewsArticle } from "./types";

export async function sendDiscordAlert(
  webhookUrl: string,
  article: NewsArticle,
  analysis: ImpactAnalysis
): Promise<boolean> {
  if (!webhookUrl) {
    console.warn("DISCORD_WEBHOOK_URL is not set. Skipping Discord alert dispatch.");
    return false;
  }

  const impactColors = {
    HIGH: 0xdc2626, // Crimson Red
    MEDIUM: 0xf59e0b, // Amber Gold
    LOW: 0x10b981, // Emerald Green
    NONE: 0x6b7280, // Gray
  };

  const impactEmojis = {
    HIGH: "🔴 HIGH IMPACT",
    MEDIUM: "🟡 MEDIUM IMPACT",
    LOW: "🟢 LOW IMPACT",
    NONE: "⚪ INFO",
  };

  const assetEmojis: Record<string, string> = {
    USD: "💵 USD",
    EUR: "💶 EUR",
    XAUUSD: "🥇 GOLD (XAUUSD)",
    OIL: "🛢️ OIL (WTI)",
  };

  const sentimentEmojis: Record<string, string> = {
    BULLISH: "📈 Bullish",
    BEARISH: "📉 Bearish",
    NEUTRAL: "⚖️ Neutral",
  };

  // Format affected assets field
  const assetsFormatted = analysis.affectedAssets && analysis.affectedAssets.length > 0
    ? analysis.affectedAssets
        .map((a) => {
          const assetName = assetEmojis[a.asset] || a.asset;
          const sent = sentimentEmojis[a.sentiment] || a.sentiment;
          return `• **${assetName}**: ${sent} - *${a.reasoning}*`;
        })
        .join("\n")
    : "No direct major asset bias detected";

  // Format key takeaways
  const takeawaysFormatted = analysis.keyTakeaways && analysis.keyTakeaways.length > 0
    ? analysis.keyTakeaways.map((t) => `• ${t}`).join("\n")
    : analysis.headlineSummary;

  const embed = {
    title: `${article.title}`,
    url: article.link,
    color: impactColors[analysis.impactLevel] || 0x3b82f6,
    description: `**${impactEmojis[analysis.impactLevel]}** | **Source**: ${article.source}\n\n${analysis.headlineSummary}`,
    fields: [
      {
        name: "📊 Asset Sentiment & Directional Bias",
        value: assetsFormatted.slice(0, 1024),
        inline: false,
      },
      {
        name: "💡 Key Market Takeaways",
        value: takeawaysFormatted.slice(0, 1024),
        inline: false,
      },
    ],
    footer: {
      text: "Forex & Commodity AI Alert System • Cloudflare Workers AI",
    },
    timestamp: new Date().toISOString(),
  };

  if (analysis.tradingNote) {
    embed.fields.push({
      name: "🎯 Trading Note",
      value: `\`\`\`\n${analysis.tradingNote}\n\`\`\``,
      inline: false,
    });
  }

  const payload = {
    username: "Forex AI Market Sentinel",
    avatar_url: "https://cdn-icons-png.flaticon.com/512/2920/2920349.png",
    embeds: [embed],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Discord Webhook failed with status ${response.status}:`, errText);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Failed to send Discord alert:", err);
    return false;
  }
}
