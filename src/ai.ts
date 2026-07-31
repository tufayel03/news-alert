import { Env, ImpactAnalysis, NewsArticle } from "./types";

// List of free Workers AI models to try sequentially
const AI_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3-8b-instruct",
  "@cf/mistral/mistral-7b-instruct-v0.1",
];

// Title patterns to immediately reject (opinion pieces, stock commentary, mining press releases, exploration projects, corporate deals, oil news, ETF advice)
const REJECT_PATTERNS = [
  /is (now|it) a (good|bad) time/i,
  /here's (what|why|how)/i,
  /should you (buy|sell|invest)/i,
  /top \d+/i,
  /what history (says|shows)/i,
  /reasons to (buy|sell)/i,
  /investment strategy|etf guide|stock market/i,
  /s&p|nasdaq|dow jones|big tech|wall street|tech stocks|stock rotation|melt-up/i,
  /market experts|analysts (say|think|believe|suggest|discuss)/i,
  /miner|gold miner|exploration|mining|greenfield|prospectivity|gold corp|silver corp|metals corp|mining corp|mine |drilling|drill |g\/t|deposit|epithermal|prospect|intersects|assays?|samples?|claims|property|resources corp/i,
  /oil|crude oil|wti|petroleum|opec/i,
  /inc\.|ltd\.|corp\.|quarterly results|earnings release|advances|completes|reports surface|expands land|confirms|sale to|acquisition|merger|falls apart/i,
  /\?/i, // Discard speculative headlines containing question marks
];

/**
 * Parse estimated dollar impact for Gold (e.g. "~$10-$20/oz" -> 20, "$30/oz" -> 30)
 */
function getGoldImpactAmount(estimatedImpact?: string): number {
  if (!estimatedImpact) return 0;
  const matches = estimatedImpact.match(/\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) return 0;
  return Math.max(...matches.map(Number));
}

export async function analyzeNewsWithAI(env: Env, article: NewsArticle): Promise<ImpactAnalysis | null> {
  if (!env.AI) {
    console.warn("Workers AI binding 'AI' is not bound in Cloudflare.");
    return null;
  }

  // Pre-filter: Discard stock commentary, mining corporate news, oil news, and opinion pieces immediately
  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(article.title)) {
      console.log(`[REJECT MINING/CORPORATE/OIL] Skipping: "${article.title}"`);
      return {
        isRelevant: false,
        impactLevel: "NONE",
        headlineSummary: "",
        keyTakeaways: [],
        affectedAssets: [],
      };
    }
  }

  const prompt = `You are an institutional Forex & Gold Macro Fundamental Analyst.
Analyze the following news headline for real-world breaking market impact:

HEADLINE: "${article.title}"
SOURCE: ${article.source}
CONTENT: "${article.content.slice(0, 350)}"

CRITICAL REJECTION RULES (isRelevant = false):
1. REJECT (isRelevant=false, impactLevel="NONE") if this is about a specific mining company, gold exploration project, drilling results, junior miners, corporate sales/mergers, or corporate press releases.
2. REJECT (isRelevant=false, impactLevel="NONE") if this news DOES NOT have massive market strength to move spot Gold (XAUUSD) by AT LEAST $25/oz or USD/Forex by at least 60+ pips. Reject routine $5-$15/oz gold commentary, daily price noise, analyst opinions, or minor updates.
3. REJECT (isRelevant=false, impactLevel="NONE") if this is stock market commentary, S&P 500, Nasdaq, Big Tech, oil news, earnings, or equity rotation.
4. REJECT (isRelevant=false, impactLevel="NONE") if you CANNOT determine a direct, clear BULLISH or BEARISH directional impact on USD, EUR, GBP, or GOLD (XAUUSD).

CRITICAL ACCEPTANCE RULES (isRelevant = true, impactLevel = "HIGH"):
ACCEPT ONLY EXTREME HIGH-STRENGTH BREAKING MACRO / GEOPOLITICAL SHOCKS (Capable of moving spot Gold by at least $25/oz or USD substantially by 60+ pips):
- Major Geopolitical Shocks: Wars, military strikes, Strait of Hormuz closure, major international sanctions, emergency trade tariffs.
- Major Breaking Central Bank policy shifts or emergency Federal Reserve rate announcements.
- Direct global macro shocks impacting USD, EUR, GBP, or Gold by $25+/oz.

Output STRICT RAW JSON:

{
  "isRelevant": true, // false if opinion/corporate/unclear impact or impact < $25/oz for Gold
  "impactLevel": "HIGH", // "HIGH" for breaking news with >= $25/oz impact on Gold, otherwise "NONE"
  "headlineSummary": "Concise 2-line summary explaining the breaking news event.",
  "keyTakeaways": [
    "Main market takeaway (1-2 sentences)."
  ],
  "affectedAssets": [
    {
      "asset": "GOLD", // Single currency/asset only: "USD", "EUR", "GBP", or "GOLD"
      "sentiment": "BULLISH", // MUST be "BULLISH" or "BEARISH"
      "estimatedImpact": "~$25-$50/oz", // For GOLD use $/oz (MUST BE AT LEAST $25/oz), for Currencies use pips (e.g. "~60-100 pips")
      "reasoning": "Short reason (max 10 words)."
    }
  ]
}`;

  for (const model of AI_MODELS) {
    try {
      const response = (await env.AI.run(model, {
        messages: [
          { role: "system", content: "You are a concise Forex AI analyst. Respond strictly in clean raw JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 350,
      })) as { response?: string } | undefined;

      const textOutput = response?.response;
      if (!textOutput) continue;

      const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]) as ImpactAnalysis;

      // Strictly enforce HIGH impact level only
      if (parsed.impactLevel !== "HIGH") {
        console.log(`[REJECT NON-HIGH IMPACT] Skipping "${article.title}" - Impact level is "${parsed.impactLevel}" (Only HIGH impact allowed).`);
        return {
          isRelevant: false,
          impactLevel: "NONE",
          headlineSummary: "",
          keyTakeaways: [],
          affectedAssets: [],
        };
      }

      // Filter assets: Require clear BULLISH/BEARISH sentiment AND minimum $25/oz threshold for Gold
      const validAssets = (parsed.affectedAssets || []).filter((a) => {
        if (a.sentiment !== "BULLISH" && a.sentiment !== "BEARISH") return false;

        const assetUpper = (a.asset || "").toUpperCase();
        if (assetUpper === "GOLD" || assetUpper === "XAUUSD") {
          const dollarAmount = getGoldImpactAmount(a.estimatedImpact);
          if (dollarAmount < 25) {
            console.log(`[REJECT SMALL GOLD IMPACT] Skipping "${article.title}" - Gold impact estimated at $${dollarAmount}/oz (Minimum required is $25/oz).`);
            return false;
          }
        }
        return true;
      });

      if (validAssets.length === 0) {
        console.log(`[REJECT NO QUALIFYING ASSETS] Skipping "${article.title}" - No assets met the minimum impact threshold (Gold >= $25/oz).`);
        return {
          isRelevant: false,
          impactLevel: "NONE",
          headlineSummary: "",
          keyTakeaways: [],
          affectedAssets: [],
        };
      }

      parsed.affectedAssets = validAssets;
      return parsed;
    } catch (err) {
      console.warn(`Model ${model} failed, trying fallback:`, err);
    }
  }

  console.error(`All Workers AI models failed for article "${article.title}"`);
  return null;
}
