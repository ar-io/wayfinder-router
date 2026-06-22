/**
 * Telemetry Storage
 * SQLite-based persistent storage for gateway telemetry
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import type { Logger } from "../types/index.js";
import type {
  GatewayRequestEvent,
  GatewayHourlyStats,
  GatewayStatsSummary,
  GatewayRewardExport,
  TelemetryConfig,
} from "../types/telemetry.js";
import {
  getHourBucket,
  getLatencyBucket,
  calculatePercentile,
} from "../types/telemetry.js";

export interface TelemetryStorageOptions {
  config: TelemetryConfig;
  logger: Logger;
  routerId: string;
  routerVersion: string;
  baseDomain: string;
}

export class TelemetryStorage {
  private db: Database;
  private config: TelemetryConfig;
  private logger: Logger;
  private routerId: string;
  private routerVersion: string;
  private baseDomain: string;

  constructor(options: TelemetryStorageOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.routerId = options.routerId;
    this.routerVersion = options.routerVersion;
    this.baseDomain = options.baseDomain;

    // Ensure directory exists
    const dbPath = this.config.storage.path;
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    // Initialize database with error handling
    try {
      this.db = new Database(dbPath);
      this.db.run("PRAGMA journal_mode = WAL");
      this.initializeSchema();
      this.logger.info("Telemetry storage initialized", { path: dbPath });
    } catch (error) {
      this.logger.error("Failed to initialize telemetry database", {
        path: dbPath,
        error: error instanceof Error ? error.message : String(error),
      });
      // Re-throw to let caller handle - telemetry should not silently fail
      throw error;
    }
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.run(`
      -- Hourly aggregated stats per gateway
      CREATE TABLE IF NOT EXISTS gateway_hourly_stats (
        gateway TEXT NOT NULL,
        hour_bucket TEXT NOT NULL,

        -- Request counts
        total_requests INTEGER DEFAULT 0,
        successful_requests INTEGER DEFAULT 0,
        client_errors INTEGER DEFAULT 0,
        server_errors INTEGER DEFAULT 0,
        timeouts INTEGER DEFAULT 0,
        connection_errors INTEGER DEFAULT 0,

        -- Verification counts
        verification_attempts INTEGER DEFAULT 0,
        verification_success INTEGER DEFAULT 0,
        verification_failed INTEGER DEFAULT 0,
        verification_skipped INTEGER DEFAULT 0,

        -- Consensus counts
        consensus_participations INTEGER DEFAULT 0,
        consensus_agreements INTEGER DEFAULT 0,
        consensus_disagreements INTEGER DEFAULT 0,

        -- Latency aggregates
        latency_sum REAL DEFAULT 0,
        latency_count INTEGER DEFAULT 0,
        latency_buckets TEXT DEFAULT '{}',

        -- Bandwidth
        bytes_served INTEGER DEFAULT 0,

        -- Metadata
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (gateway, hour_bucket)
      );

      -- Indexes for efficient queries
      CREATE INDEX IF NOT EXISTS idx_hourly_stats_hour ON gateway_hourly_stats(hour_bucket);
      CREATE INDEX IF NOT EXISTS idx_hourly_stats_gateway ON gateway_hourly_stats(gateway);

      -- Raw events (optional, for detailed analysis)
      CREATE TABLE IF NOT EXISTS gateway_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        gateway TEXT NOT NULL,
        request_type TEXT NOT NULL,
        identifier TEXT NOT NULL,
        path TEXT,
        mode TEXT NOT NULL,
        outcome TEXT NOT NULL,
        http_status INTEGER,
        verification_outcome TEXT,
        verification_duration_ms INTEGER,
        latency_total_ms INTEGER,
        latency_ttfb_ms INTEGER,
        bytes_received INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON gateway_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_gateway ON gateway_events(gateway);
    `);
  }

  /**
   * Record a gateway request event
   */
  recordEvent(event: GatewayRequestEvent): void {
    const hourBucket = getHourBucket(event.timestamp);

    // Update hourly stats
    this.updateHourlyStats(event, hourBucket);

    // Optionally store raw event (for detailed analysis)
    this.storeRawEvent(event);
  }

  /**
   * Update hourly aggregated stats
   */
  private updateHourlyStats(
    event: GatewayRequestEvent,
    hourBucket: string,
  ): void {
    const latencyBucketKey = getLatencyBucket(event.latency.totalMs);

    // Prepare values
    const isSuccess = event.outcome === "success" ? 1 : 0;
    const isClientError = event.outcome === "client_error" ? 1 : 0;
    const isServerError = event.outcome === "server_error" ? 1 : 0;
    const isTimeout = event.outcome === "timeout" ? 1 : 0;
    const isConnectionError = event.outcome === "connection_error" ? 1 : 0;

    const hasVerification = event.verification ? 1 : 0;
    const verifySuccess = event.verification?.outcome === "verified" ? 1 : 0;
    const verifyFailed = event.verification?.outcome === "failed" ? 1 : 0;
    const verifySkipped = event.verification?.outcome === "skipped" ? 1 : 0;

    const hasConsensus = event.consensus ? 1 : 0;
    const consensusAgreed = event.consensus?.outcome === "agreed" ? 1 : 0;
    const consensusDisagreed = event.consensus?.outcome === "disagreed" ? 1 : 0;

    // First, try to get existing record for latency bucket merge
    const existingStmt = this.db.prepare(`
      SELECT latency_buckets FROM gateway_hourly_stats
      WHERE gateway = ? AND hour_bucket = ?
    `);
    const existing = existingStmt.get(event.gateway, hourBucket) as
      | { latency_buckets: string }
      | undefined;

    // Merge latency buckets in JavaScript
    let mergedBuckets: Record<string, number>;
    if (existing) {
      const existingBuckets = JSON.parse(existing.latency_buckets || "{}");
      mergedBuckets = {
        ...existingBuckets,
        [latencyBucketKey]: (existingBuckets[latencyBucketKey] || 0) + 1,
      };
    } else {
      mergedBuckets = { [latencyBucketKey]: 1 };
    }

    // Upsert hourly stats
    const stmt = this.db.prepare(`
      INSERT INTO gateway_hourly_stats (
        gateway, hour_bucket, total_requests, successful_requests,
        client_errors, server_errors, timeouts, connection_errors,
        verification_attempts, verification_success, verification_failed, verification_skipped,
        consensus_participations, consensus_agreements, consensus_disagreements,
        latency_sum, latency_count, latency_buckets, bytes_served
      ) VALUES (
        ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
      )
      ON CONFLICT(gateway, hour_bucket) DO UPDATE SET
        total_requests = total_requests + 1,
        successful_requests = successful_requests + excluded.successful_requests,
        client_errors = client_errors + excluded.client_errors,
        server_errors = server_errors + excluded.server_errors,
        timeouts = timeouts + excluded.timeouts,
        connection_errors = connection_errors + excluded.connection_errors,
        verification_attempts = verification_attempts + excluded.verification_attempts,
        verification_success = verification_success + excluded.verification_success,
        verification_failed = verification_failed + excluded.verification_failed,
        verification_skipped = verification_skipped + excluded.verification_skipped,
        consensus_participations = consensus_participations + excluded.consensus_participations,
        consensus_agreements = consensus_agreements + excluded.consensus_agreements,
        consensus_disagreements = consensus_disagreements + excluded.consensus_disagreements,
        latency_sum = latency_sum + excluded.latency_sum,
        latency_count = latency_count + 1,
        latency_buckets = excluded.latency_buckets,
        bytes_served = bytes_served + excluded.bytes_served,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
      event.gateway,
      hourBucket,
      isSuccess,
      isClientError,
      isServerError,
      isTimeout,
      isConnectionError,
      hasVerification,
      verifySuccess,
      verifyFailed,
      verifySkipped,
      hasConsensus,
      consensusAgreed,
      consensusDisagreed,
      event.latency.totalMs,
      JSON.stringify(mergedBuckets),
      event.bytesReceived || 0,
    );
  }

  /**
   * Store raw event for detailed analysis
   */
  private storeRawEvent(event: GatewayRequestEvent): void {
    const stmt = this.db.prepare(`
      INSERT INTO gateway_events (
        trace_id, timestamp, gateway, request_type, identifier, path, mode,
        outcome, http_status, verification_outcome, verification_duration_ms,
        latency_total_ms, latency_ttfb_ms, bytes_received
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.traceId,
      event.timestamp,
      event.gateway,
      event.requestType,
      event.identifier,
      event.path,
      event.mode,
      event.outcome,
      event.httpStatus || null,
      event.verification?.outcome || null,
      event.verification?.durationMs || null,
      event.latency.totalMs,
      event.latency.ttfbMs || null,
      event.bytesReceived || null,
    );
  }

  /**
   * Get hourly stats for a gateway
   */
  getHourlyStats(
    gateway: string,
    startHour: string,
    endHour: string,
  ): GatewayHourlyStats[] {
    const stmt = this.db.prepare(`
      SELECT * FROM gateway_hourly_stats
      WHERE gateway = ? AND hour_bucket >= ? AND hour_bucket < ?
      ORDER BY hour_bucket ASC
    `);

    const rows = stmt.all(gateway, startHour, endHour) as any[];

    return rows.map((row) => this.rowToHourlyStats(row));
  }

  /**
   * Get all gateways' stats for a time range
   */
  getAllGatewayStats(startHour: string, endHour: string): GatewayHourlyStats[] {
    const stmt = this.db.prepare(`
      SELECT * FROM gateway_hourly_stats
      WHERE hour_bucket >= ? AND hour_bucket < ?
      ORDER BY gateway, hour_bucket ASC
    `);

    const rows = stmt.all(startHour, endHour) as any[];

    return rows.map((row) => this.rowToHourlyStats(row));
  }

  /**
   * Get summary stats for all gateways in a time range
   */
  getGatewaySummaries(
    startHour: string,
    endHour: string,
  ): GatewayStatsSummary[] {
    const stmt = this.db.prepare(`
      SELECT
        gateway,
        SUM(total_requests) as total_requests,
        SUM(successful_requests) as successful_requests,
        SUM(client_errors) as client_errors,
        SUM(server_errors) as server_errors,
        SUM(timeouts) as timeouts,
        SUM(connection_errors) as connection_errors,
        SUM(verification_attempts) as verification_attempts,
        SUM(verification_success) as verification_success,
        SUM(verification_failed) as verification_failed,
        SUM(consensus_participations) as consensus_participations,
        SUM(consensus_agreements) as consensus_agreements,
        SUM(consensus_disagreements) as consensus_disagreements,
        SUM(latency_sum) as latency_sum,
        SUM(latency_count) as latency_count,
        SUM(bytes_served) as bytes_served,
        COUNT(DISTINCT hour_bucket) as hours_active
      FROM gateway_hourly_stats
      WHERE hour_bucket >= ? AND hour_bucket < ?
      GROUP BY gateway
      ORDER BY total_requests DESC
    `);

    const rows = stmt.all(startHour, endHour) as any[];

    // Fetch latency histogram buckets per gateway (need raw rows to merge)
    const bucketStmt = this.db.prepare(`
      SELECT gateway, latency_buckets FROM gateway_hourly_stats
      WHERE hour_bucket >= ? AND hour_bucket < ?
    `);
    const bucketRows = bucketStmt.all(startHour, endHour) as any[];

    // Merge latency buckets per gateway across all hours
    const mergedBuckets = new Map<string, Record<string, number>>();
    for (const row of bucketRows) {
      const existing = mergedBuckets.get(row.gateway) || {};
      const hourBuckets = JSON.parse(row.latency_buckets || "{}");
      for (const [key, count] of Object.entries(hourBuckets)) {
        existing[key] = (existing[key] || 0) + (count as number);
      }
      mergedBuckets.set(row.gateway, existing);
    }

    // Calculate total hours in range
    const startDate = new Date(startHour);
    const endDate = new Date(endHour);
    const totalHours = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60),
    );

    return rows.map((row) => {
      const totalRequests = row.total_requests || 0;
      const successfulRequests = row.successful_requests || 0;
      const verificationAttempts = row.verification_attempts || 0;
      const verificationSuccess = row.verification_success || 0;
      const consensusParticipations = row.consensus_participations || 0;
      const consensusAgreements = row.consensus_agreements || 0;
      const latencyCount = row.latency_count || 0;
      const latencySum = row.latency_sum || 0;
      const hoursActive = row.hours_active || 0;

      // Calculate percentiles from merged histogram buckets
      const gatewayBuckets = mergedBuckets.get(row.gateway) || {};

      return {
        gateway: row.gateway,
        period: { start: startHour, end: endHour },
        totalRequests,
        successfulRequests,
        bytesServed: row.bytes_served || 0,
        successRate: totalRequests > 0 ? successfulRequests / totalRequests : 0,
        verificationSuccessRate:
          verificationAttempts > 0
            ? verificationSuccess / verificationAttempts
            : 0,
        consensusAgreementRate:
          consensusParticipations > 0
            ? consensusAgreements / consensusParticipations
            : 0,
        errorRate:
          totalRequests > 0
            ? (row.server_errors + row.timeouts + row.connection_errors) /
              totalRequests
            : 0,
        avgLatencyMs: latencyCount > 0 ? latencySum / latencyCount : 0,
        p50LatencyMs: calculatePercentile(gatewayBuckets, latencyCount, 50),
        p95LatencyMs: calculatePercentile(gatewayBuckets, latencyCount, 95),
        p99LatencyMs: calculatePercentile(gatewayBuckets, latencyCount, 99),
        hoursActive,
        hoursMissing: Math.max(0, totalHours - hoursActive),
        availabilityRate: totalHours > 0 ? hoursActive / totalHours : 0,
      };
    });
  }

  /**
   * Export reward data for a time range
   */
  exportRewardData(startHour: string, endHour: string): GatewayRewardExport {
    const gateways = this.getGatewaySummaries(startHour, endHour);

    const totals = gateways.reduce(
      (acc, gw) => ({
        totalRequests: acc.totalRequests + gw.totalRequests,
        totalBytesServed: acc.totalBytesServed + gw.bytesServed,
        totalGateways: acc.totalGateways + 1,
        activeGateways: acc.activeGateways + (gw.totalRequests > 0 ? 1 : 0),
      }),
      {
        totalRequests: 0,
        totalBytesServed: 0,
        totalGateways: 0,
        activeGateways: 0,
      },
    );

    return {
      exportedAt: new Date().toISOString(),
      period: { start: startHour, end: endHour },
      routerInfo: {
        routerId: this.routerId,
        version: this.routerVersion,
        baseDomain: this.baseDomain,
      },
      gateways,
      totals,
    };
  }

  /**
   * Get list of known gateways
   */
  getKnownGateways(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT gateway FROM gateway_hourly_stats ORDER BY gateway
    `);

    return stmt.all().map((row: any) => row.gateway);
  }

  /**
   * Clean up old data based on retention policy
   */
  cleanup(): number {
    const retentionDays = this.config.storage.retentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffHour = cutoffDate
      .toISOString()
      .replace(/:\d{2}\.\d{3}Z$/, ":00:00.000Z");

    // Delete old hourly stats
    const deleteStats = this.db.prepare(`
      DELETE FROM gateway_hourly_stats WHERE hour_bucket < ?
    `);
    const statsResult = deleteStats.run(cutoffHour);

    // Delete old raw events
    const cutoffTimestamp = cutoffDate.getTime();
    const deleteEvents = this.db.prepare(`
      DELETE FROM gateway_events WHERE timestamp < ?
    `);
    const eventsResult = deleteEvents.run(cutoffTimestamp);

    const totalDeleted = statsResult.changes + eventsResult.changes;

    if (totalDeleted > 0) {
      this.logger.info("Cleaned up old telemetry data", {
        statsDeleted: statsResult.changes,
        eventsDeleted: eventsResult.changes,
        retentionDays,
      });
    }

    return totalDeleted;
  }

  /**
   * Convert database row to GatewayHourlyStats
   */
  private rowToHourlyStats(row: any): GatewayHourlyStats {
    return {
      gateway: row.gateway,
      hourBucket: row.hour_bucket,
      totalRequests: row.total_requests,
      successfulRequests: row.successful_requests,
      clientErrors: row.client_errors,
      serverErrors: row.server_errors,
      timeouts: row.timeouts,
      connectionErrors: row.connection_errors,
      verificationAttempts: row.verification_attempts,
      verificationSuccess: row.verification_success,
      verificationFailed: row.verification_failed,
      verificationSkipped: row.verification_skipped,
      consensusParticipations: row.consensus_participations,
      consensusAgreements: row.consensus_agreements,
      consensusDisagreements: row.consensus_disagreements,
      latencySum: row.latency_sum,
      latencyCount: row.latency_count,
      latencyBuckets: JSON.parse(row.latency_buckets || "{}"),
      bytesServed: row.bytes_served,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
    this.logger.info("Telemetry storage closed");
  }
}
