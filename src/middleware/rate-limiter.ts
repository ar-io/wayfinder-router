/**
 * Rate Limiting Middleware for Wayfinder Router
 * IP-based rate limiting with configurable window and limits
 */

import type { Context, Next } from "hono";
import type { RouterConfig } from "../types/index.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limit store
 * Uses IP address as key
 */
class RateLimitStore {
  private entries: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  get(key: string): RateLimitEntry | undefined {
    return this.entries.get(key);
  }

  set(key: string, entry: RateLimitEntry): void {
    this.entries.set(key, entry);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Global store instance
const store = new RateLimitStore();

/**
 * Extract client IP from request
 * Handles common proxy headers, falls back to socket IP
 */
function getClientIp(c: Context): string {
  // Check common proxy headers (only trustworthy behind a reverse proxy)
  const xForwardedFor = c.req.header("x-forwarded-for");
  if (xForwardedFor) {
    // Take the first IP in the chain (original client)
    return xForwardedFor.split(",")[0].trim();
  }

  const xRealIp = c.req.header("x-real-ip");
  if (xRealIp) {
    return xRealIp.trim();
  }

  // Fall back to socket IP via Bun.Server.requestIP()
  const srv = c.env?.server;
  if (srv && typeof srv.requestIP === "function") {
    const addr = srv.requestIP(c.req.raw);
    if (addr) {
      return addr.address;
    }
  }

  return "0.0.0.0";
}

/**
 * Add rate limit headers to response
 */
function addRateLimitHeaders(
  c: Context,
  limit: number,
  remaining: number,
  resetAt: number,
): void {
  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  c.header("X-RateLimit-Reset", String(Math.floor(resetAt / 1000)));
}

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(config: RouterConfig) {
  const { enabled, windowMs, maxRequests } = config.rateLimit;

  return async (c: Context, next: Next) => {
    // Skip if rate limiting is disabled
    if (!enabled) {
      return next();
    }

    // Skip rate limiting for health check endpoints
    const path = new URL(c.req.url).pathname;
    if (
      path === "/wayfinder/health" ||
      path === "/wayfinder/ready" ||
      path === "/wayfinder/metrics"
    ) {
      return next();
    }

    const clientIp = getClientIp(c);
    const now = Date.now();

    // Get or create rate limit entry
    let entry = store.get(clientIp);

    if (!entry || entry.resetAt <= now) {
      // Create new window
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
    }

    // Increment request count
    entry.count++;
    store.set(clientIp, entry);

    const remaining = maxRequests - entry.count;

    // Add rate limit headers to all responses
    addRateLimitHeaders(c, maxRequests, remaining, entry.resetAt);

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));

      return c.json(
        {
          error: "RATE_LIMITED",
          message: "Too many requests",
          retryAfter,
        },
        429,
      );
    }

    return next();
  };
}

/**
 * Get rate limit stats (for metrics)
 */
export function getRateLimitStats(): { activeClients: number } {
  return {
    activeClients: 0, // Would need to expose store size
  };
}
