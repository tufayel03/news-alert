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
 * Checks Memory Cache -> Cloudflare Cache API -> Cloudflare KV.
 */
export async function isArticleAlerted(env: Env, hash: string): Promise<boolean> {
  if (memorySeenCache.has(hash)) {
    return true;
  }

  // 1. Check Cloudflare Edge Cache API (Persists across worker restarts without KV)
  try {
    const cache = caches.default;
    const cacheUrl = `https://news-alert.internal/seen/${hash}`;
    const cachedResponse = await cache.match(cacheUrl);
    if (cachedResponse) {
      memorySeenCache.add(hash);
      return true;
    }
  } catch (err) {
    console.warn("Cache API fetch failed:", err);
  }

  // 2. Check Cloudflare KV (if bound)
  if (env.NEWS_KV) {
    try {
      const val = await env.NEWS_KV.get(`article:${hash}`);
      if (val !== null) {
        memorySeenCache.add(hash);
        return true;
      }
    } catch (err) {
      console.warn("KV fetch failed:", err);
    }
  }

  return false;
}

/**
 * Mark article hash as alerted in Memory, Cache API (7 days), and KV.
 */
export async function markArticleAlerted(env: Env, hash: string, title: string): Promise<void> {
  memorySeenCache.add(hash);
  if (memorySeenCache.size > 500) {
    const firstKey = memorySeenCache.values().next().value;
    if (firstKey) memorySeenCache.delete(firstKey);
  }

  // 1. Save to Cloudflare Edge Cache API (7-day TTL: 604800s)
  try {
    const cache = caches.default;
    const cacheUrl = `https://news-alert.internal/seen/${hash}`;
    const cacheResponse = new Response(JSON.stringify({ title, time: Date.now() }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=604800", // 7 days
      },
    });
    await cache.put(cacheUrl, cacheResponse);
  } catch (err) {
    console.warn("Cache API write failed:", err);
  }

  // 2. Save to Cloudflare KV (if bound)
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
