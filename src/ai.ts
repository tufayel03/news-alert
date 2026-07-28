import { Env, ImpactAnalysis, NewsArticle } from "./types";

// List of free Workers AI models to try sequentially
const AI_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3-8b-instruct",
  "@cf/mistral/mistral-7b-instruct-v0.1",
];

export async function analyzeNewsWithAI(env: Env, article: NewsArticle): Promise<ImpactAnalysis | null> {
  if (!env.AI) {
    console.warn("Workers AI binding 'AI' is not bound in Cloudflare. Please add Workers AI binding in Cloudflare Dashboard -> Workers & Pages -> news-alert -> Settings -> Bindings -> Workers AI.");
    return null;
  }

  const prompt = `You are a high-speed Forex & Commodity Macro Analyst specializing in USD, EUR, Gold (XAUUSD), and Crude Oil (WTI).
Analyze the following news headline and content snippet for high market volatility impact:

HEADLINE: "${article.title}"
SOURCE: ${article.source}
CONTENT: "${article.content}"

Rules:
1. Provide all text in **Clean, Professional English**.
2. Determine if this news is HIGH impact (Central Banks, Interest Rates, Inflation/CPI, Non-Farm Payrolls/NFP, GDP, OPEC decisions, War/Geopolitics).
3. If it is low impact or routine gossip, set impactLevel="LOW" or "NONE".
4. Output STRICT RAW JSON matching this exact schema:

{
  "isRelevant": true,
  "impactLevel": "HIGH", // "HIGH", "MEDIUM", "LOW", or "NONE"
  "headlineSummary": "One clean, crisp English sentence summarizing the event.",
  "keyTakeaways": [
    "Clean English takeaway 1",
    "Clean English takeaway 2"
  ],
  "affectedAssets": [
    {
      "asset": "USD", // One of: "USD", "EUR", "XAUUSD", "OIL"
      "sentiment": "BULLISH", // "BULLISH", "BEARISH", or "NEUTRAL"
      "reasoning": "Clean English 1-line reason for asset bias."
    }
  ],
  "tradingNote": "Clean English trading takeaway for USD/Gold/Oil traders."
}`;

  for (const model of AI_MODELS) {
    try {
      const response = (await env.AI.run(model, {
        messages: [
          { role: "system", content: "You are a Forex AI analyst. Respond strictly in clean English raw JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
      })) as { response?: string } | undefined;

      const textOutput = response?.response;
      if (!textOutput) continue;

      const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]) as ImpactAnalysis;
      return parsed;
    } catch (err) {
      console.warn(`Model ${model} failed, trying fallback:`, err);
    }
  }

  console.error(`All Workers AI models failed for article "${article.title}"`);
  return null;
}
