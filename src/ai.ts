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

  const prompt = `You are a high-speed Forex & Commodity Macro Analyst specializing in USD, EUR, GBP, Gold (XAUUSD), and Crude Oil (WTI).
Analyze the following news headline and content snippet for high market volatility impact:

HEADLINE: "${article.title}"
SOURCE: ${article.source}
CONTENT: "${article.content.slice(0, 350)}"

Rules:
1. Provide all text in **Clean, Concise English**.
2. Determine if this news is HIGH impact (Central Banks, Interest Rates, CPI, NFP, GDP, OPEC, War/Geopolitics). Otherwise impactLevel="LOW" or "NONE".
3. Keep descriptions super short (max 10 words per field) to save output tokens.
4. Output STRICT RAW JSON matching this exact schema:

{
  "isRelevant": true,
  "impactLevel": "HIGH", // "HIGH", "MEDIUM", "LOW", or "NONE"
  "headlineSummary": "Short 1-line summary (max 10 words).",
  "keyTakeaways": [
    "Key takeaway (max 10 words)"
  ],
  "affectedAssets": [
    {
      "asset": "USD", // One of: "USD", "EUR", "GBP", "XAUUSD", "OIL"
      "sentiment": "BULLISH", // "BULLISH", "BEARISH", or "NEUTRAL"
      "reasoning": "Short reason (max 6 words)."
    }
  ],
  "tradingNote": "Short trading note for active traders (max 10 words)."
}`;

  for (const model of AI_MODELS) {
    try {
      const response = (await env.AI.run(model, {
        messages: [
          { role: "system", content: "You are a concise Forex AI analyst. Respond strictly in ultra-short raw JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 200,
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
