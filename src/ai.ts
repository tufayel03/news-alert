import { Env, ImpactAnalysis, NewsArticle } from "./types";

// List of free Workers AI models to try sequentially
const AI_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3-8b-instruct",
  "@cf/mistral/mistral-7b-instruct-v0.1",
];

// Title patterns to immediately reject (opinion pieces, stock commentary, corporate earnings, mining press releases, exploration projects, corporate deals, oil news, ETF advice)
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
  /gold miner|silver miner|exploration|mining|greenfield|prospectivity|gold corp|silver corp|metals corp|mining corp|mine |drilling|drill |g\/t|deposit|epithermal|prospect|intersects|assays?|samples?|claims|property|resources corp|fast-41|permitting|project/i,
  /oil price|crude oil price|wti crude|opec meeting|eia oil inventory|petroleum stocks/i,
  /\b(inc|ltd|corp|toyota|tesla|apple|nvidia|amazon|microsoft|google|meta)\b|quarterly results|earnings release|advances|completes|reports surface|expands land|confirms|sale to|acquisition|merger|falls apart|hefty profit|car sales|vehicle sales|automaker/i,
  /company announcement|corporate announcement|sec filing|ipo|spin-off|acceptance of the new|covered projects/i,
  /\?/i, // Discard speculative headlines containing question marks
];

/**
 * Parse estimated average dollar impact for Gold (e.g. "~$10-$25/oz" -> 17.5, "$30/oz" -> 30)
 */
function getGoldImpactAmount(estimatedImpact?: string): number {
  if (!estimatedImpact) return 0;
  const matches = estimatedImpact.match(/\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) return 0;
  const nums = matches.map(Number);
  const sum = nums.reduce((acc, curr) => acc + curr, 0);
  return sum / nums.length;
}

export async function analyzeNewsWithAI(env: Env, article: NewsArticle): Promise<ImpactAnalysis | null> {
  if (!env.AI) {
    console.warn("Workers AI binding 'AI' is not bound in Cloudflare.");
    return null;
  }

  // Pre-filter: Discard stock commentary, mining corporate news, oil news, and opinion pieces immediately
  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(article.title)) {
      console.log(`[REJECT MINING/CORPORATE/EARNINGS] Skipping: "${article.title}"`);
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
Analyze the following news headline for REAL-WORLD IMMEDIATE 7-DAY MARKET IMPACT:

HEADLINE: "${article.title}"
SOURCE: ${article.source}
CONTENT: "${article.content.slice(0, 350)}"

CRITICAL REJECTION RULES (isRelevant = false):
1. REJECT (isRelevant=false, impactLevel="NONE") if this is about corporate earnings, company profits (e.g. Toyota, Big Tech), automaker sales, corporate press releases, specific mining companies, gold exploration projects (e.g. FAST-41, Amalga), drilling results, or corporate deals.
2. REJECT (isRelevant=false, impactLevel="NONE") if the market impact is long-term (2-3 months away, multi-year permitting, or slow structural trends). ACCEPT ONLY NEWS THAT WILL IMMEDIATELY MOVE THE MARKET WITHIN THE NEXT 7 DAYS (preferably 24-48 hours).
3. REJECT (isRelevant=false, impactLevel="NONE") if this news DOES NOT have massive market strength to move spot Gold (XAUUSD) by AT LEAST $25/oz or USD/Forex by at least 60+ pips. Reject routine $5-$15/oz gold commentary, daily price noise, analyst opinions, or minor updates.
4. REJECT (isRelevant=false, impactLevel="NONE") if this is stock market commentary, S&P 500, Nasdaq, Big Tech, oil news, earnings, or equity rotation.
5. REJECT (isRelevant=false, impactLevel="NONE") if you CANNOT determine a direct, clear BULLISH or BEARISH directional impact on USD, EUR, GBP, or GOLD (XAUUSD).

CRITICAL ACCEPTANCE RULES (isRelevant = true, impactLevel = "HIGH"):
ACCEPT ONLY EXTREME HIGH-STRENGTH URGENT BREAKING MACRO SHOCKS WITH IMMEDIATE 7-DAY IMPACT:
- Major Geopolitical Shocks: Wars, military strikes, Strait of Hormuz closure, emergency international trade sanctions/tariffs.
- Major Breaking Central Bank policy shifts or emergency Federal Reserve rate announcements.
- Direct global macro shocks causing immediate >= $25/oz movement on Gold or 60+ pips on USD/EUR/GBP within the next 7 days.

Output STRICT RAW JSON:

{
  "isRelevant": true, // false if opinion/corporate/unclear impact, impact < $25/oz for Gold, or timeframe > 7 days
  "impactLevel": "HIGH", // "HIGH" ONLY for urgent breaking macro shocks with >= $25/oz 7-day impact on Gold, otherwise "NONE"
  "headlineSummary": "Concise 2-line summary explaining the breaking news event.",
  "keyTakeaways": [
    "Main market takeaway (1-2 sentences)."
  ],
  "affectedAssets": [
    {
      "asset": "GOLD", // Single currency/asset only: "USD", "EUR", "GBP", or "GOLD"
      "sentiment": "BULLISH", // MUST be "BULLISH" or "BEARISH"
      "estimatedImpact": "~$30-$50/oz", // ACTUAL estimated 7-day impact. Calculate carefully based on news strength.
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
