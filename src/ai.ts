import { Env, ImpactAnalysis, NewsArticle } from "./types";

// List of free Workers AI models to try sequentially
const AI_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3-8b-instruct",
  "@cf/mistral/mistral-7b-instruct-v0.1",
];

// Title patterns to immediately reject (opinion pieces, stock commentary, mining press releases, oil news, ETF advice)
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
  /exploration|mining|greenfield|prospectivity|gold corp|mining corp|mine /i,
  /oil|crude oil|wti|petroleum|opec/i,
  /inc\.|ltd\.|corp\.|quarterly results|earnings release/i,
  /\?/i, // Discard speculative headlines containing question marks
];

export async function analyzeNewsWithAI(env: Env, article: NewsArticle): Promise<ImpactAnalysis | null> {
  if (!env.AI) {
    console.warn("Workers AI binding 'AI' is not bound in Cloudflare.");
    return null;
  }

  // Pre-filter: Discard stock commentary, mining corporate news, oil news, and opinion pieces immediately
  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(article.title)) {
      console.log(`[REJECT OPINION/CORPORATE/OIL] Skipping: "${article.title}"`);
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
1. REJECT (isRelevant=false, impactLevel="NONE") if this is about a specific mining company, exploration property, corporate gold/mining stock, or oil news.
2. REJECT (isRelevant=false, impactLevel="NONE") if this is stock market commentary, S&P 500, Nasdaq, Big Tech, earnings, or equity rotation news.
3. REJECT (isRelevant=false, impactLevel="NONE") if this is an opinion piece, historical analysis, or ETF/stock investment advice.
4. REJECT (isRelevant=false, impactLevel="NONE") if you CANNOT determine a clear BULLISH or BEARISH directional impact on USD, EUR, GBP, or GOLD (XAUUSD).

CRITICAL ACCEPTANCE RULES (isRelevant = true, impactLevel = "HIGH"):
ACCEPT ONLY IF this is REAL BREAKING GEOPOLITICAL OR MAJOR FUNDAMENTAL NEWS:
- Geopolitical events: Wars, military strikes/attacks, Strait of Hormuz, Middle East escalation, sanctions, tariffs, trade war.
- Major breaking central bank policy shifts or emergency announcements.
- Direct macro shocks impacting USD, EUR, GBP, or Gold.

Output STRICT RAW JSON:

{
  "isRelevant": true, // false if opinion/corporate/unclear impact
  "impactLevel": "HIGH", // "HIGH" for breaking news, otherwise "NONE"
  "headlineSummary": "Concise 2-line summary explaining the breaking news event.",
  "keyTakeaways": [
    "Main market takeaway (1-2 sentences)."
  ],
  "affectedAssets": [
    {
      "asset": "USD", // Single currency/asset only: "USD", "EUR", "GBP", or "GOLD"
      "sentiment": "BULLISH", // MUST be "BULLISH" or "BEARISH"
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

      // Require at least 1 asset with clear BULLISH or BEARISH sentiment
      const validAssets = (parsed.affectedAssets || []).filter(
        (a) => a.sentiment === "BULLISH" || a.sentiment === "BEARISH"
      );

      if (validAssets.length === 0) {
        console.log(`[REJECT NO DIRECTIONAL BIAS] Skipping "${article.title}" - No clear directional impact determined.`);
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
