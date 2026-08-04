import { XMLParser } from "fast-xml-parser";
import { NewsArticle } from "./types";
import { hashString } from "./kv";

const RSS_SOURCES = [
  {
    name: "Yahoo Finance Currencies & Gold",
    url: "https://finance.yahoo.com/rss/headline?s=GC=F,DX-Y.NYB,EURUSD=X",
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
        const pubDateStr = item.pubDate || item.published || item.updated || "";
        const content = cleanText(item.description || item.content || item["content:encoded"] || title);

        if (!title || !link) continue;

        // Immediately drop corporate earnings, automaker profits, stock reports, and long-term project press releases
        const CORPORATE_DISCARD_PATTERNS = [
          /profit|earnings|quarterly results|earnings release|car sales|vehicle sales|automaker|toyota|tesla|apple|nvidia|amazon|microsoft|google|meta/i,
          /fast-41|permitting|project|exploration|drilling|deposit|assay|samples|claims|property|resources corp|gold corp|silver corp|metals corp/i,
          /acceptance of the new|covered projects|sec filing|ipo|spin-off/i,
        ];

        if (CORPORATE_DISCARD_PATTERNS.some((p) => p.test(title))) {
          console.log(`[DISCARD RSS CORPORATE/PROJECT] Skipping non-macro headline: "${title}"`);
          continue;
        }

        // Freshness check: Discard articles older than 45 minutes (2700 seconds)
        if (pubDateStr) {
          const articleTime = new Date(pubDateStr).getTime();
          if (!isNaN(articleTime)) {
            const ageMs = Date.now() - articleTime;
            // Only process breaking articles published in the last 45 minutes (2,700,000ms)
            if (ageMs > 45 * 60 * 1000) {
              console.log(`[SKIP OLD ARTICLE] "${title}" is ${Math.round(ageMs / 60000)} mins old`);
              continue;
            }
          }
        }

        const cleanTitle = title.toLowerCase().trim();
        const articleId = await hashString(`art:${cleanTitle}`);

        articles.push({
          id: articleId,
          title,
          link: typeof link === "string" ? link : String(link),
          pubDate: pubDateStr || new Date().toISOString(),
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
