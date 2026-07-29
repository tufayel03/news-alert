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
    GBP: "💷 GBP",
    GOLD: "🥇 GOLD",
    XAUUSD: "🥇 GOLD",
    OIL: "🛢️ OIL",
  };

  const sentimentEmojis: Record<string, string> = {
    BULLISH: "⬆️ BULLISH",
    BEARISH: "⬇️ BEARISH",
    NEUTRAL: "N NEUTRAL",
  };

  // Filter ONLY directly impacted currencies (BULLISH or BEARISH)
  const impactedAssets = (analysis.affectedAssets || []).filter(
    (a) => a.sentiment === "BULLISH" || a.sentiment === "BEARISH"
  );

  const assetsFormatted = impactedAssets.length > 0
    ? impactedAssets
        .map((a) => {
          const key = (a.asset || "").toUpperCase();
          const assetName = assetEmojis[key] || key;
          const sent = sentimentEmojis[a.sentiment] || a.sentiment;
          return `• **${assetName}**: ${sent} — *${a.reasoning}*`;
        })
        .join("\n")
    : null;

  // Format key takeaways (ultra short)
  const takeawaysFormatted = analysis.keyTakeaways && analysis.keyTakeaways.length > 0
    ? analysis.keyTakeaways.map((t) => `• ${t}`).join("\n")
    : analysis.headlineSummary;

  let description = `**${impactEmojis[analysis.impactLevel]}** | **Source**: [**${article.source}**](${article.link})\n\n${analysis.headlineSummary}`;
  if (assetsFormatted) {
    description += `\n\n${assetsFormatted}`;
  }

  const fields: { name: string; value: string; inline?: boolean }[] = [
    {
      name: "💡 Key Market Takeaway",
      value: takeawaysFormatted.slice(0, 1024),
      inline: false,
    },
  ];

  const embed = {
    title: `${article.title}`,
    url: article.link,
    color: impactColors[analysis.impactLevel] || 0x3b82f6,
    description,
    fields,
    timestamp: new Date().toISOString(),
  };

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
