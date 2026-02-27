/**
 * Gateway Ping Service
 *
 * Background service that periodically pings random gateways to measure
 * their latency. Ping results are stored in the temperature cache and
 * blended with actual request performance for smarter gateway selection.
 *
 * Design goals:
 * - Zero latency added to content requests (all pinging is background)
 * - Even distribution across gateways (random selection each round)
 * - Resilient to failures (individual ping failures don't affect service)
 */

import type { Logger } from "../types/index.js";
import type { GatewayTemperatureCache } from "../cache/gateway-temperature.js";
import type { GatewaySelector } from "./gateway-selector.js";
import type {
  NetworkGatewayManager,
  GatewayInfo,
} from "./network-gateway-manager.js";

export interface GatewayPingServiceOptions {
  /** Network gateway manager to get gateway list from */
  networkManager: NetworkGatewayManager;
  /** Temperature cache to record ping results */
  temperatureCache: GatewayTemperatureCache;
  /** Gateway selector for health tracking (circuit breaker) */
  gatewaySelector: GatewaySelector;
  /** How often to refresh ping data (hours) */
  intervalHours: number;
  /** Number of random gateways to ping each round */
  gatewayCount: number;
  /** Timeout for each ping request (ms) */
  timeoutMs: number;
  /** Maximum concurrent ping requests */
  concurrency: number;
  /** Logger */
  logger: Logger;
}

export interface GatewayPingStats {
  /** Whether the service is initialized */
  initialized: boolean;
  /** Number of ping rounds completed */
  roundsCompleted: number;
  /** Total pings attempted */
  totalPings: number;
  /** Successful pings */
  successfulPings: number;
  /** Failed pings */
  failedPings: number;
  /** Time of last ping round */
  lastPingRoundAt: number | null;
  /** Time until next scheduled round (ms) */
  nextPingInMs: number | null;
}

/**
 * Background service that pings gateways and records latency
 */
export class GatewayPingService {
  private readonly networkManager: NetworkGatewayManager;
  private readonly temperatureCache: GatewayTemperatureCache;
  private readonly gatewaySelector: GatewaySelector;
  private readonly intervalHours: number;
  private readonly gatewayCount: number;
  private readonly timeoutMs: number;
  private readonly concurrency: number;
  private readonly logger: Logger;

  private refreshTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private pingPromise: Promise<void> | null = null;

  // Stats tracking
  private roundsCompleted = 0;
  private totalPings = 0;
  private successfulPings = 0;
  private failedPings = 0;
  private lastPingRoundAt: number | null = null;
  private nextPingAt: number | null = null;

  constructor(options: GatewayPingServiceOptions) {
    this.networkManager = options.networkManager;
    this.temperatureCache = options.temperatureCache;
    this.gatewaySelector = options.gatewaySelector;
    this.intervalHours = options.intervalHours;
    this.gatewayCount = options.gatewayCount;
    this.timeoutMs = options.timeoutMs;
    this.concurrency = options.concurrency;
    this.logger = options.logger;
  }

  /**
   * Initialize the ping service - runs first ping round and schedules refresh
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn("Gateway ping service already initialized");
      return;
    }

    this.logger.info("Initializing gateway ping service...", {
      intervalHours: this.intervalHours,
      gatewayCount: this.gatewayCount,
      timeoutMs: this.timeoutMs,
      concurrency: this.concurrency,
    });

    try {
      // Run initial ping round
      await this.pingGateways();

      // Schedule periodic refresh
      this.scheduleRefresh();

      this.isInitialized = true;

      this.logger.info("Gateway ping service initialized", {
        roundsCompleted: this.roundsCompleted,
        successfulPings: this.successfulPings,
        failedPings: this.failedPings,
      });
    } catch (error) {
      // Log but don't throw - service is optional
      this.logger.warn("Gateway ping service initialization failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Still schedule refresh to retry later
      this.scheduleRefresh();
      this.isInitialized = true;
    }
  }

  /**
   * Stop the ping service and clear timers
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.nextPingAt = null;
    this.logger.info("Gateway ping service stopped");
  }

  /**
   * Get service statistics
   */
  getStats(): GatewayPingStats {
    return {
      initialized: this.isInitialized,
      roundsCompleted: this.roundsCompleted,
      totalPings: this.totalPings,
      successfulPings: this.successfulPings,
      failedPings: this.failedPings,
      lastPingRoundAt: this.lastPingRoundAt,
      nextPingInMs: this.nextPingAt ? this.nextPingAt - Date.now() : null,
    };
  }

  /**
   * Get Prometheus-formatted metrics
   */
  getPrometheusMetrics(): string {
    const stats = this.getStats();
    let metrics = "\n# Gateway Ping Service Metrics\n";

    metrics +=
      "# HELP wayfinder_ping_rounds_total Total number of ping rounds completed\n";
    metrics += "# TYPE wayfinder_ping_rounds_total counter\n";
    metrics += `wayfinder_ping_rounds_total ${stats.roundsCompleted}\n`;

    metrics += "# HELP wayfinder_ping_total Total number of pings attempted\n";
    metrics += "# TYPE wayfinder_ping_total counter\n";
    metrics += `wayfinder_ping_total ${stats.totalPings}\n`;

    metrics +=
      "# HELP wayfinder_ping_success_total Total number of successful pings\n";
    metrics += "# TYPE wayfinder_ping_success_total counter\n";
    metrics += `wayfinder_ping_success_total ${stats.successfulPings}\n`;

    metrics +=
      "# HELP wayfinder_ping_failure_total Total number of failed pings\n";
    metrics += "# TYPE wayfinder_ping_failure_total counter\n";
    metrics += `wayfinder_ping_failure_total ${stats.failedPings}\n`;

    metrics +=
      "# HELP wayfinder_ping_initialized Whether the ping service is initialized\n";
    metrics += "# TYPE wayfinder_ping_initialized gauge\n";
    metrics += `wayfinder_ping_initialized ${stats.initialized ? 1 : 0}\n`;

    if (stats.lastPingRoundAt !== null) {
      metrics +=
        "# HELP wayfinder_ping_last_round_timestamp_seconds Timestamp of last ping round\n";
      metrics += "# TYPE wayfinder_ping_last_round_timestamp_seconds gauge\n";
      metrics += `wayfinder_ping_last_round_timestamp_seconds ${Math.floor(stats.lastPingRoundAt / 1000)}\n`;
    }

    if (stats.nextPingInMs !== null) {
      metrics +=
        "# HELP wayfinder_ping_next_round_seconds Seconds until next ping round\n";
      metrics += "# TYPE wayfinder_ping_next_round_seconds gauge\n";
      metrics += `wayfinder_ping_next_round_seconds ${Math.max(0, Math.floor(stats.nextPingInMs / 1000))}\n`;
    }

    return metrics;
  }

  /**
   * Manually trigger a ping round (for testing/debugging)
   */
  async triggerPingRound(): Promise<void> {
    await this.pingGateways();
  }

  // --- Private methods ---

  /**
   * Run a ping round - select random gateways and ping them
   */
  private async pingGateways(): Promise<void> {
    // Deduplicate concurrent ping requests
    if (this.pingPromise) {
      return this.pingPromise;
    }

    this.pingPromise = this.doPingGateways();

    try {
      await this.pingPromise;
    } finally {
      this.pingPromise = null;
    }
  }

  private async doPingGateways(): Promise<void> {
    const startTime = Date.now();

    // Get all gateways from network manager
    let allGateways: GatewayInfo[];
    try {
      allGateways = await this.networkManager.getAllGatewaysWithInfo();
    } catch (error) {
      this.logger.warn("Failed to get gateways for ping round", {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (allGateways.length === 0) {
      this.logger.warn("No gateways available for ping round");
      return;
    }

    // Select random gateways
    const selected = this.selectRandom(allGateways, this.gatewayCount);

    this.logger.debug("Starting ping round", {
      totalGateways: allGateways.length,
      selectedCount: selected.length,
    });

    // Ping in batches with concurrency limit
    let roundSuccesses = 0;
    let roundFailures = 0;

    for (let i = 0; i < selected.length; i += this.concurrency) {
      const batch = selected.slice(i, i + this.concurrency);
      const results = await Promise.allSettled(
        batch.map((gw) => this.pingOne(gw)),
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          roundSuccesses++;
        } else {
          roundFailures++;
        }
      }
    }

    // Update stats
    this.roundsCompleted++;
    this.totalPings += selected.length;
    this.successfulPings += roundSuccesses;
    this.failedPings += roundFailures;
    this.lastPingRoundAt = Date.now();

    this.logger.info("Ping round completed", {
      round: this.roundsCompleted,
      gatewaysPinged: selected.length,
      successes: roundSuccesses,
      failures: roundFailures,
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Select N random gateways using Fisher-Yates shuffle
   */
  private selectRandom(gateways: GatewayInfo[], count: number): GatewayInfo[] {
    // Don't select more than available
    const selectCount = Math.min(count, gateways.length);

    // Fisher-Yates shuffle (partial - only shuffle what we need)
    const shuffled = [...gateways];
    for (let i = 0; i < selectCount; i++) {
      const j = i + Math.floor(Math.random() * (shuffled.length - i));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, selectCount);
  }

  /**
   * Ping a single gateway and record result
   * Returns true if successful, false if failed
   */
  private async pingOne(gateway: GatewayInfo): Promise<boolean> {
    const url = new URL("/ar-io/info", gateway.url);
    const startTime = Date.now();

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.ok) {
        const latencyMs = Date.now() - startTime;
        this.temperatureCache.recordPing(gateway.url.origin, latencyMs);
        // Mark gateway as healthy in circuit breaker
        this.gatewaySelector.markHealthy(gateway.url);

        this.logger.debug("Gateway ping success", {
          gateway: gateway.fqdn,
          latencyMs,
        });

        return true;
      } else {
        // Non-200 response - record failure to both circuit breaker and temperature cache
        this.gatewaySelector.recordFailure(gateway.url);
        this.temperatureCache.recordFailure(gateway.url.origin);
        this.logger.debug("Gateway ping failed (non-200)", {
          gateway: gateway.fqdn,
          status: response.status,
        });
        return false;
      }
    } catch (error) {
      // Ping failed - record failure to both circuit breaker and temperature cache
      this.gatewaySelector.recordFailure(gateway.url);
      this.temperatureCache.recordFailure(gateway.url.origin);
      this.logger.debug("Gateway ping failed", {
        gateway: gateway.fqdn,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Schedule periodic ping refresh
   */
  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    const intervalMs = this.intervalHours * 60 * 60 * 1000;
    this.nextPingAt = Date.now() + intervalMs;

    this.refreshTimer = setInterval(async () => {
      this.nextPingAt = Date.now() + intervalMs;

      try {
        this.logger.debug("Starting scheduled ping round");
        await this.pingGateways();
      } catch (error) {
        this.logger.warn("Scheduled ping round failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, intervalMs);

    // Don't prevent process exit
    this.refreshTimer.unref();

    this.logger.debug("Ping refresh scheduled", {
      intervalHours: this.intervalHours,
      nextPingAt: new Date(this.nextPingAt).toISOString(),
    });
  }
}

/**
 * Factory function to create ping service
 */
export function createGatewayPingService(
  options: GatewayPingServiceOptions,
): GatewayPingService {
  return new GatewayPingService(options);
}
