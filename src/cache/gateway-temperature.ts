/**
 * Gateway Temperature Cache
 *
 * Tracks recent performance metrics (latency, success rate) for each gateway.
 * "Temperature" refers to how "hot" (fast/reliable) or "cold" (slow/unreliable)
 * a gateway is based on recent observations.
 *
 * This data is used by TemperatureRoutingStrategy to prefer gateways with
 * better recent performance, while still allowing some traffic to slower
 * gateways (to detect when they improve).
 */

import type { Logger } from "../types/index.js";

export interface GatewayTemperature {
  /** Recent latency samples (ms) - sliding window */
  recentLatencies: number[];
  /** Number of successful requests in window */
  successCount: number;
  /** Number of failed requests in window */
  failureCount: number;
  /** Timestamp of last update */
  lastUpdated: number;
  /** Most recent ping latency (ms) - from background ping service */
  pingLatencyMs: number | null;
  /** Timestamp when ping was recorded */
  pingUpdatedAt: number | null;
}

export interface GatewayScore {
  /** Gateway URL */
  gateway: string;
  /** Computed score (higher = better) */
  score: number;
  /** Average latency in ms (or null if no data) */
  avgLatencyMs: number | null;
  /** P95 latency in ms (or null if insufficient data) */
  p95LatencyMs: number | null;
  /** Success rate 0-1 (or null if no data) */
  successRate: number | null;
  /** Total requests in current window */
  requestCount: number;
  /** Most recent ping latency (or null if no ping data) */
  pingLatencyMs: number | null;
}

export interface GatewayTemperatureCacheOptions {
  /** Sliding window size in ms (default: 5 minutes) */
  windowMs?: number;
  /** Maximum latency samples to keep per gateway (default: 100) */
  maxSamples?: number;
  /** Default score for gateways with no data (default: 50) */
  defaultScore?: number;
  /** Maximum gateways to track (default: 500) - prevents unbounded growth */
  maxGateways?: number;
  /** Logger */
  logger?: Logger;
}

export interface GatewayTemperatureCacheStats {
  /** Number of gateways being tracked */
  gatewayCount: number;
  /** Total latency samples across all gateways */
  totalSamples: number;
  /** Window size in ms */
  windowMs: number;
}

/**
 * Cache for tracking gateway performance "temperature"
 */
export class GatewayTemperatureCache {
  private temperatures: Map<string, GatewayTemperature> = new Map();
  private windowMs: number;
  private maxSamples: number;
  private maxGateways: number;
  private defaultScore: number;
  private logger?: Logger;
  private lastPruneTime: number = 0;

  constructor(options: GatewayTemperatureCacheOptions = {}) {
    this.windowMs = options.windowMs ?? 5 * 60 * 1000; // 5 minutes
    this.maxSamples = options.maxSamples ?? 100;
    this.maxGateways = options.maxGateways ?? 500;
    this.defaultScore = options.defaultScore ?? 50;
    this.logger = options.logger;

    this.logger?.info("GatewayTemperatureCache initialized", {
      windowMs: this.windowMs,
      maxSamples: this.maxSamples,
      maxGateways: this.maxGateways,
      defaultScore: this.defaultScore,
    });
  }

  /**
   * Record a successful request to a gateway
   */
  recordSuccess(gateway: string, latencyMs: number): void {
    // Periodically prune stale entries to prevent memory leaks
    this.maybePruneStaleGateways();

    const temp = this.getOrCreate(gateway);
    this.cleanup(temp);

    // Add latency sample
    temp.recentLatencies.push(latencyMs);
    if (temp.recentLatencies.length > this.maxSamples) {
      temp.recentLatencies.shift();
    }

    temp.successCount++;
    temp.lastUpdated = Date.now();

    this.logger?.debug("Recorded gateway success", {
      gateway,
      latencyMs,
      sampleCount: temp.recentLatencies.length,
      successRate: this.calculateSuccessRate(temp),
    });
  }

  /**
   * Record a failed request to a gateway
   */
  recordFailure(gateway: string): void {
    this.maybePruneStaleGateways();
    const temp = this.getOrCreate(gateway);
    this.cleanup(temp);

    temp.failureCount++;
    temp.lastUpdated = Date.now();

    this.logger?.debug("Recorded gateway failure", {
      gateway,
      failureCount: temp.failureCount,
      successRate: this.calculateSuccessRate(temp),
    });
  }

  /**
   * Record a ping result from the background ping service.
   * Ping data is stored separately from request data and blended in scoring.
   * Note: This doesn't update lastUpdated to prevent pings from keeping
   * inactive gateways in the cache indefinitely.
   */
  recordPing(gateway: string, latencyMs: number): void {
    const temp = this.getOrCreate(gateway);
    temp.pingLatencyMs = latencyMs;
    temp.pingUpdatedAt = Date.now();

    this.logger?.debug("Recorded gateway ping", {
      gateway,
      latencyMs,
    });
  }

  /**
   * Get the score for a gateway (higher = better)
   */
  getScore(gateway: string): number {
    const temp = this.temperatures.get(gateway);
    if (!temp) {
      return this.defaultScore;
    }

    this.cleanup(temp);
    return this.calculateScore(temp);
  }

  /**
   * Get detailed scoring info for a gateway
   */
  getGatewayScore(gateway: string): GatewayScore {
    const temp = this.temperatures.get(gateway);

    if (!temp || this.isStale(temp)) {
      return {
        gateway,
        score: this.defaultScore,
        avgLatencyMs: null,
        p95LatencyMs: null,
        successRate: null,
        requestCount: 0,
        pingLatencyMs: temp?.pingLatencyMs ?? null,
      };
    }

    this.cleanup(temp);

    const avgLatencyMs =
      temp.recentLatencies.length > 0
        ? temp.recentLatencies.reduce((a, b) => a + b, 0) /
          temp.recentLatencies.length
        : null;

    const p95LatencyMs =
      temp.recentLatencies.length >= 5
        ? this.calculatePercentile(temp.recentLatencies, 95)
        : null;

    const successRate = this.calculateSuccessRate(temp);

    return {
      gateway,
      score: this.calculateScore(temp),
      avgLatencyMs,
      p95LatencyMs,
      successRate,
      requestCount: temp.successCount + temp.failureCount,
      pingLatencyMs: this.isPingStale(temp) ? null : temp.pingLatencyMs,
    };
  }

  /**
   * Select a gateway using weighted random selection based on scores.
   * Higher-scoring gateways are more likely to be selected, but lower-scoring
   * gateways still have a chance (to detect when they improve).
   */
  selectWeighted(gateways: URL[]): URL {
    if (gateways.length === 0) {
      throw new Error("No gateways to select from");
    }

    if (gateways.length === 1) {
      return gateways[0];
    }

    // Calculate scores for all gateways
    const scored = gateways.map((gw) => ({
      gateway: gw,
      score: this.getScore(gw.toString()),
    }));

    // Calculate total score for probability distribution
    const totalScore = scored.reduce((sum, s) => sum + s.score, 0);

    if (totalScore <= 0) {
      // Fallback to random if all scores are 0
      return gateways[Math.floor(Math.random() * gateways.length)];
    }

    // Weighted random selection
    let random = Math.random() * totalScore;
    for (const { gateway, score } of scored) {
      random -= score;
      if (random <= 0) {
        return gateway;
      }
    }

    // Fallback (shouldn't reach here)
    return gateways[gateways.length - 1];
  }

  /**
   * Get scores for all tracked gateways
   */
  getAllScores(): GatewayScore[] {
    const scores: GatewayScore[] = [];
    for (const gateway of this.temperatures.keys()) {
      scores.push(this.getGatewayScore(gateway));
    }
    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Get cache statistics
   */
  stats(): GatewayTemperatureCacheStats {
    let totalSamples = 0;
    for (const temp of this.temperatures.values()) {
      totalSamples += temp.recentLatencies.length;
    }

    return {
      gatewayCount: this.temperatures.size,
      totalSamples,
      windowMs: this.windowMs,
    };
  }

  /**
   * Clear all temperature data
   */
  clear(): void {
    this.temperatures.clear();
    this.logger?.info("Gateway temperature cache cleared");
  }

  // --- Private methods ---

  private getOrCreate(gateway: string): GatewayTemperature {
    let temp = this.temperatures.get(gateway);
    if (!temp) {
      temp = {
        recentLatencies: [],
        successCount: 0,
        failureCount: 0,
        lastUpdated: Date.now(),
        pingLatencyMs: null,
        pingUpdatedAt: null,
      };
      this.temperatures.set(gateway, temp);
    }
    return temp;
  }

  /**
   * Check if temperature data is stale (outside window)
   */
  private isStale(temp: GatewayTemperature): boolean {
    return Date.now() - temp.lastUpdated > this.windowMs;
  }

  /**
   * Check if ping data is stale (older than 8 hours = 2x default ping interval)
   */
  private isPingStale(temp: GatewayTemperature): boolean {
    if (!temp.pingUpdatedAt) return true;
    // Ping data expires after 8 hours (2x the default 4-hour refresh interval)
    const PING_STALE_THRESHOLD_MS = 8 * 60 * 60 * 1000;
    return Date.now() - temp.pingUpdatedAt > PING_STALE_THRESHOLD_MS;
  }

  /**
   * Clean up stale data for a gateway
   */
  private cleanup(temp: GatewayTemperature): void {
    if (this.isStale(temp)) {
      // Reset counters if data is stale
      temp.recentLatencies = [];
      temp.successCount = 0;
      temp.failureCount = 0;
    }
  }

  /**
   * Prune stale gateway entries to prevent unbounded memory growth.
   * Called periodically (every windowMs) during record operations.
   */
  private maybePruneStaleGateways(): void {
    const now = Date.now();

    // Only prune once per window period
    if (now - this.lastPruneTime < this.windowMs) {
      return;
    }
    this.lastPruneTime = now;

    // Remove gateways that are stale (no updates in 2x window)
    const staleThreshold = this.windowMs * 2;
    let pruned = 0;

    for (const [gateway, temp] of this.temperatures.entries()) {
      if (now - temp.lastUpdated > staleThreshold) {
        this.temperatures.delete(gateway);
        pruned++;
      }
    }

    // If still over max, remove oldest entries
    if (this.temperatures.size > this.maxGateways) {
      const entries = [...this.temperatures.entries()].sort(
        (a, b) => a[1].lastUpdated - b[1].lastUpdated,
      );
      const toRemove = entries.slice(
        0,
        this.temperatures.size - this.maxGateways,
      );
      for (const [gateway] of toRemove) {
        this.temperatures.delete(gateway);
        pruned++;
      }
    }

    if (pruned > 0) {
      this.logger?.debug("Pruned stale gateway temperature entries", {
        pruned,
        remaining: this.temperatures.size,
      });
    }
  }

  /**
   * Calculate success rate from temperature data
   */
  private calculateSuccessRate(temp: GatewayTemperature): number | null {
    const total = temp.successCount + temp.failureCount;
    if (total === 0) return null;
    return temp.successCount / total;
  }

  /**
   * Calculate latency bonus/penalty based on latency value.
   * Returns a value from -30 (very slow) to +30 (excellent).
   */
  private latencyBonus(latencyMs: number): number {
    // Latency scoring:
    // < 100ms = +30 (excellent)
    // 100-250ms = +15 (good)
    // 250-500ms = 0 (acceptable)
    // 500-1000ms = -15 (slow)
    // > 1000ms = -30 (very slow)
    if (latencyMs < 100) {
      return 30;
    } else if (latencyMs < 250) {
      return 15;
    } else if (latencyMs < 500) {
      return 0;
    } else if (latencyMs < 1000) {
      return -15;
    } else {
      return -30;
    }
  }

  /**
   * Calculate score for a gateway based on its temperature
   *
   * Score formula combines (weights adjusted for ping integration):
   * - Success rate: 28% weight (reduced from 40%)
   * - Request latency: 42% weight (reduced from 60%)
   * - Ping latency: 30% weight (new)
   *
   * Total: 100% (actual request performance 70%, ping 30%)
   * Score range: 1-100
   */
  private calculateScore(temp: GatewayTemperature): number {
    const successRate = this.calculateSuccessRate(temp);
    const avgLatency =
      temp.recentLatencies.length > 0
        ? temp.recentLatencies.reduce((a, b) => a + b, 0) /
          temp.recentLatencies.length
        : null;

    // Start with base score
    let score = this.defaultScore;

    // Adjust for success rate (weight: 28% - reduced from 40%)
    if (successRate !== null) {
      // successRate 1.0 = +14, successRate 0.5 = 0, successRate 0.0 = -14
      score += (successRate - 0.5) * 28;
    }

    // Adjust for request latency (weight: 42% - reduced from 60%)
    // We apply 70% of the latency bonus to account for reduced weight
    if (avgLatency !== null) {
      score += this.latencyBonus(avgLatency) * 0.7;
    }

    // Adjust for ping latency (weight: 30% - new)
    // We apply 50% of the latency bonus (30/60 = 0.5 of original weight)
    if (temp.pingLatencyMs !== null && !this.isPingStale(temp)) {
      score += this.latencyBonus(temp.pingLatencyMs) * 0.5;
    }

    // Clamp score to 1-100 range (never 0 to ensure all gateways have some chance)
    return Math.max(1, Math.min(100, score));
  }

  /**
   * Calculate percentile from an array of numbers
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
