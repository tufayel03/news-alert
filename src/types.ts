export interface Env {
  NEWS_KV?: KVNamespace;
  AI: Ai;
  DISCORD_WEBHOOK_URL?: string;
  MIN_IMPACT_LEVEL?: string; // "HIGH" | "MEDIUM" | "ALL"
}

export interface NewsArticle {
  id: string; // Hash or unique GUID
  title: string;
  link: string;
  pubDate: string;
  source: string;
  content: string;
}

export interface AssetSentiment {
  asset: "USD" | "EUR" | "GBP" | "GOLD" | "XAUUSD" | string;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  estimatedImpact?: string; // e.g. "~$10-$20/oz" or "~40-60 pips"
  reasoning: string;
}

export interface ImpactAnalysis {
  isRelevant: boolean;
  impactLevel: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  headlineSummary: string;
  keyTakeaways: string[];
  affectedAssets: AssetSentiment[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  countryCode: string;
  currencyCode: string;
  dateUtc: string;
  volatility: string;
  actual: number | string | null;
  consensus: number | string | null;
  previous: number | string | null;
  isBetterThanExpected?: boolean | null;
}

export interface CurrencyImpact {
  currency: "USD" | "EUR" | "GBP" | "GOLD" | "XAUUSD" | string;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  estimatedImpact?: string; // e.g. "~$15-$30/oz" or "~50-80 pips"
  reason: string;
}

export interface CalendarVerdict {
  event: CalendarEvent;
  verdictSummary: string;
  currencyImpacts: CurrencyImpact[];
}

