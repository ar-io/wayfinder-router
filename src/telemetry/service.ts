/**
 * Telemetry Service
 * Main service that coordinates telemetry collection, storage, and export
 */

import type { Logger } from "../types/index.js";
import type {
  TelemetryConfig,
  GatewayRequestEvent,
  GatewayStatsSummary,
  GatewayRewardExport,
  GatewayHourlyStats,
} from "../types/telemetry.js";
import { TelemetryCollector, RequestTracker } from "./collector.js";
import { TelemetryStorage } from "./storage.js";

export interface TelemetryServiceOptions {
  config: TelemetryConfig;
  logger: Logger;
  routerId: string;
  routerVersion: string;
  baseDomain: string;
}

export class TelemetryService {
  private logger: Logger;
  private collector: TelemetryCollector;
  private storage: TelemetryStorage;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // In-memory counters for Prometheus (always updated, no sampling)
  private counters = {
    requests: new Map<string, number>(), // gateway:status -> count
    verifications: new Map<string, number>(), // gateway:outcome -> count
    latencySum: new Map<string, number>(), // gateway -> sum
    latencyCount: new Map<string, number>(), // gateway -> count
    bytesServed: new Map<string, number>(), // gateway -> bytes
  };

  constructor(options: TelemetryServiceOptions) {
    this.logger = options.logger;

    // Initialize storage
    this.storage = new TelemetryStorage({
      config: options.config,
      logger: options.logger,
      routerId: options.routerId,
      routerVersion: options.routerVersion,
      baseDomain: options.baseDomain,
    });

    // Initialize collector
    this.collector = new TelemetryCollector({
      config: options.config,
      logger: options.logger,
      onEvent: (event) => this.handleEvent(event),
    });

    // Start cleanup job (daily)
    this.cleanupInterval = setInterval(
      () => this.storage.cleanup(),
      24 * 60 * 60 * 1000,
    );

    this.logger.info("Telemetry service initialized", {
      enabled: options.config.enabled,
      samplingRate: options.config.sampling.successfulRequests,
      retentionDays: options.config.storage.retentionDays,
    });
  }

  /**
   * Create a request tracker for a new request
   */
  track(params: {
    traceId: string;
    gateway: string;
    requestType: "arns" | "txid";
    identifier: string;
    path: string;
    mode: "proxy" | "route";
  }): RequestTracker {
    return this.collector.createTracker(params);
  }

  /**
   * Record a gateway request (for simple cases where tracker isn't needed)
   */
  recordRequest(event: GatewayRequestEvent): void {
    // Always update in-memory counters (for Prometheus)
    this.updateCounters(event);

    // Record to collector (applies sampling)
    this.collector.record(event);
  }

  /**
   * Handle event from collector (after sampling)
   */
  private handleEvent(event: GatewayRequestEvent): void {
    // Store in database
    this.storage.recordEvent(event);
  }

  /**
   * Update in-memory counters (always, no sampling)
   */
  private updateCounters(event: GatewayRequestEvent): void {
    const gateway = event.gateway;

    // Request counter by status (use \0 delimiter to avoid collision with URL colons)
    const statusKey = `${gateway}\0${event.outcome}`;
    this.counters.requests.set(
      statusKey,
      (this.counters.requests.get(statusKey) || 0) + 1,
    );

    // Verification counter
    if (event.verification) {
      const verifyKey = `${gateway}\0${event.verification.outcome}`;
      this.counters.verifications.set(
        verifyKey,
        (this.counters.verifications.get(verifyKey) || 0) + 1,
      );
    }

    // Latency
    this.counters.latencySum.set(
      gateway,
      (this.counters.latencySum.get(gateway) || 0) + event.latency.totalMs,
    );
    this.counters.latencyCount.set(
      gateway,
      (this.counters.latencyCount.get(gateway) || 0) + 1,
    );

    // Bytes
    if (event.bytesReceived) {
      this.counters.bytesServed.set(
        gateway,
        (this.counters.bytesServed.get(gateway) || 0) + event.bytesReceived,
      );
    }
  }

  /**
   * Get Prometheus metrics
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];

    // Escape label values per Prometheus exposition format
    const escLabel = (s: string): string =>
      s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

    // Gateway request counters
    lines.push(
      "# HELP wayfinder_gateway_requests_total Total requests per gateway",
    );
    lines.push("# TYPE wayfinder_gateway_requests_total counter");
    for (const [key, count] of this.counters.requests) {
      const sepIdx = key.lastIndexOf("\0");
      const gateway = key.substring(0, sepIdx);
      const outcome = key.substring(sepIdx + 1);
      lines.push(
        `wayfinder_gateway_requests_total{gateway="${escLabel(gateway)}",outcome="${escLabel(outcome)}"} ${count}`,
      );
    }
    lines.push("");

    // Gateway verification counters
    lines.push(
      "# HELP wayfinder_gateway_verifications_total Verification results per gateway",
    );
    lines.push("# TYPE wayfinder_gateway_verifications_total counter");
    for (const [key, count] of this.counters.verifications) {
      const sepIdx = key.lastIndexOf("\0");
      const gateway = key.substring(0, sepIdx);
      const outcome = key.substring(sepIdx + 1);
      lines.push(
        `wayfinder_gateway_verifications_total{gateway="${escLabel(gateway)}",outcome="${escLabel(outcome)}"} ${count}`,
      );
    }
    lines.push("");

    // Gateway latency
    lines.push(
      "# HELP wayfinder_gateway_latency_seconds_sum Sum of request latencies",
    );
    lines.push("# TYPE wayfinder_gateway_latency_seconds_sum counter");
    for (const [gateway, sum] of this.counters.latencySum) {
      lines.push(
        `wayfinder_gateway_latency_seconds_sum{gateway="${escLabel(gateway)}"} ${sum / 1000}`,
      );
    }
    lines.push("");

    lines.push(
      "# HELP wayfinder_gateway_latency_seconds_count Count of latency measurements",
    );
    lines.push("# TYPE wayfinder_gateway_latency_seconds_count counter");
    for (const [gateway, count] of this.counters.latencyCount) {
      lines.push(
        `wayfinder_gateway_latency_seconds_count{gateway="${escLabel(gateway)}"} ${count}`,
      );
    }
    lines.push("");

    // Gateway bytes served
    lines.push(
      "# HELP wayfinder_gateway_bytes_served_total Total bytes served per gateway",
    );
    lines.push("# TYPE wayfinder_gateway_bytes_served_total counter");
    for (const [gateway, bytes] of this.counters.bytesServed) {
      lines.push(
        `wayfinder_gateway_bytes_served_total{gateway="${escLabel(gateway)}"} ${bytes}`,
      );
    }
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Get gateway stats summary for a time range
   */
  getGatewayStats(startHour?: string, endHour?: string): GatewayStatsSummary[] {
    // Default to last 24 hours
    const end = endHour || new Date().toISOString();
    const start =
      startHour || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    return this.storage.getGatewaySummaries(start, end);
  }

  /**
   * Get hourly stats for a specific gateway
   */
  getGatewayHourlyStats(
    gateway: string,
    startHour?: string,
    endHour?: string,
  ): GatewayHourlyStats[] {
    const end = endHour || new Date().toISOString();
    const start =
      startHour || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    return this.storage.getHourlyStats(gateway, start, end);
  }

  /**
   * Export reward data for a time range
   */
  exportRewardData(startHour?: string, endHour?: string): GatewayRewardExport {
    const end = endHour || new Date().toISOString();
    const start =
      startHour || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    return this.storage.exportRewardData(start, end);
  }

  /**
   * Get list of known gateways
   */
  getKnownGateways(): string[] {
    return this.storage.getKnownGateways();
  }

  /**
   * Manually trigger cleanup
   */
  cleanup(): number {
    return this.storage.cleanup();
  }

  /**
   * Flush pending events
   */
  flush(): void {
    this.collector.flush();
  }

  /**
   * Stop the telemetry service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.collector.stop();
    this.storage.close();

    this.logger.info("Telemetry service stopped");
  }
}

/**
 * Create a disabled telemetry service (no-op)
 */
export function createDisabledTelemetryService(
  logger: Logger,
): TelemetryService | null {
  logger.info("Telemetry disabled");
  return null;
}
