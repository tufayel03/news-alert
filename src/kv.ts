import { Env } from "./types";

/**
 * Generate a deterministic SHA-256 hash string for an article URL or ID.
 */
export async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// In-memory fallback set for local development without KV bound
const memorySeenCache = new Set<string>();

/**
 * Check if the article hash has already been alerted or processed.
 */
export async function isArticleAlerted(env: Env, hash: string): Promise<boolean> {
  if (memorySeenCache.has(hash)) {
    return true;
  }

  if (env.NEWS_KV) {
    try {
      const val = await env.NEWS_KV.get(`article:${hash}`);
      return val !== null;
    } catch (err) {
      console.warn("KV fetch failed, using memory cache:", err);
    }
  }

  return false;
}

/**
 * Mark article hash as alerted in KV with a 7-day TTL (604800 seconds).
 */
export async function markArticleAlerted(env: Env, hash: string, title: string): Promise<void> {
  memorySeenCache.add(hash);
  if (memorySeenCache.size > 500) {
    // Keep memory cache size bounded
    const firstKey = memorySeenCache.values().next().value;
    if (firstKey) memorySeenCache.delete(firstKey);
  }

  if (env.NEWS_KV) {
    try {
      await env.NEWS_KV.put(
        `article:${hash}`,
        JSON.stringify({ title, timestamp: new Date().toISOString() }),
        { expirationTtl: 604800 } // 7 days TTL
      );
    } catch (err) {
      console.warn("KV write failed:", err);
    }
  }
}
