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

  const prompt = `You are a high-speed Forex Macro Analyst specializing in USD, EUR, GBP, and Gold.
Analyze the following news headline and content snippet for market impact:

HEADLINE: "${article.title}"
SOURCE: ${article.source}
CONTENT: "${article.content.slice(0, 350)}"

Rules:
1. Determine if this news is HIGH impact (Central Banks, Fed Interest Rates, CPI, NFP, GDP, Geopolitics). Otherwise impactLevel="LOW" or "NONE".
2. Identify ONLY directly impacted currencies/assets ("USD", "EUR", "GBP", "GOLD"). Do NOT include currency pairs (no EURUSD, no GBPUSD).
3. Do NOT include unaffected or neutral currencies in "affectedAssets". Only list currencies that are clearly BULLISH or BEARISH.
4. Provide a clear, concise headline summary around 2 lines (approx 20-30 words).
5. Output STRICT RAW JSON:

{
  "isRelevant": true,
  "impactLevel": "HIGH", // "HIGH", "MEDIUM", "LOW", or "NONE"
  "headlineSummary": "Concise 2-line summary explaining the news context.",
  "keyTakeaways": [
    "Main market takeaway (1-2 sentences)."
  ],
  "affectedAssets": [
    {
      "asset": "USD", // Single currency/asset only: "USD", "EUR", "GBP", or "GOLD"
      "sentiment": "BULLISH", // "BULLISH" or "BEARISH"
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
      return parsed;
    } catch (err) {
      console.warn(`Model ${model} failed, trying fallback:`, err);
    }
  }

  console.error(`All Workers AI models failed for article "${article.title}"`);
  return null;
}
