import { XMLParser } from "fast-xml-parser";
import { NewsArticle } from "./types";
import { hashString } from "./kv";

const RSS_SOURCES = [
  {
    name: "Investing.com Forex",
    url: "https://www.investing.com/rss/forex.rss",
  },
  {
    name: "Investing.com Commodities",
    url: "https://www.investing.com/rss/commodities.rss",
  },
  {
    name: "MarketWatch",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
  },
  {
    name: "Yahoo Finance Currencies & Commodities",
    url: "https://finance.yahoo.com/rss/headline?s=GC=F,CL=F,DX-Y.NYB,EURUSD=X",
  },
];

function cleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>?/gm, "") // strip HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function fetchLatestNews(): Promise<NewsArticle[]> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const articles: NewsArticle[] = [];

  for (const source of RSS_SOURCES) {
    try {
      const response = await fetch(source.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ForexAINewsAlert/1.0",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
        cf: {
          cacheTtl: 60,
        },
      } as RequestInit & { cf?: { cacheTtl?: number } });

      if (!response.ok) {
        console.warn(`Failed to fetch RSS from ${source.name}: ${response.status}`);
        continue;
      }

      const xmlText = await response.text();
      const jsonObj = parser.parse(xmlText);

      // Handle standard RSS <rss><channel><item>
      let items = jsonObj?.rss?.channel?.item;
      if (!items) {
        // Handle Atom feeds <feed><entry>
        items = jsonObj?.feed?.entry;
      }

      if (!items) continue;

      const itemList = Array.isArray(items) ? items : [items];

      // Limit to latest 5 items per source to optimize latency & AI processing
      for (const item of itemList.slice(0, 5)) {
        const title = cleanText(item.title || "");
        const link = item.link?.["@_href"] || item.link || "";
        const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
        const content = cleanText(item.description || item.content || item["content:encoded"] || title);

        if (!title || !link) continue;

        const articleId = await hashString(`${link}-${title}`);

        articles.push({
          id: articleId,
          title,
          link: typeof link === "string" ? link : String(link),
          pubDate,
          source: source.name,
          content: content.slice(0, 800), // Keep content snippet manageable for AI prompt
        });
      }
    } catch (err) {
      console.error(`Error parsing feed from ${source.name}:`, err);
    }
  }

  return articles;
}
