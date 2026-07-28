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
  asset: "USD" | "EUR" | "GBP" | "XAUUSD" | "EURUSD" | "GBPUSD";
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
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

export interface CalendarVerdict {
  event: CalendarEvent;
  verdictSummary: string;
  pairSentiments: {
    pair: "EURUSD" | "GBPUSD" | "XAUUSD";
    sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
    reason: string;
  }[];
}

