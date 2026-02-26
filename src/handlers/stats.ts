/**
 * Stats API Handlers
 * REST API for querying gateway telemetry and stats
 */

import type { Context } from "hono";
import type { Logger } from "../types/index.js";
import type { TelemetryService } from "../telemetry/service.js";

export interface StatsHandlerDeps {
  telemetryService: TelemetryService | null;
  logger: Logger;
}

/**
 * Create handler for GET /stats/gateways
 * Returns summary stats for all gateways
 */
export function createGatewayStatsHandler(deps: StatsHandlerDeps) {
  return async (c: Context): Promise<Response> => {
    const { telemetryService, logger } = deps;

    if (!telemetryService) {
      return c.json({ error: "Telemetry not enabled" }, 503);
    }

    try {
      // Parse query parameters
      const startHour = c.req.query("start");
      const endHour = c.req.query("end");

      const stats = telemetryService.getGatewayStats(startHour, endHour);

      return c.json({
        period: {
          start: startHour || "last 24 hours",
          end: endHour || "now",
        },
        gateways: stats,
        count: stats.length,
      });
    } catch (error) {
      logger.error("Failed to get gateway stats", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json({ error: "Failed to retrieve stats" }, 500);
    }
  };
}

/**
 * Create handler for GET /stats/gateways/:gateway
 * Returns detailed stats for a specific gateway
 */
export function createGatewayDetailHandler(deps: StatsHandlerDeps) {
  return async (c: Context): Promise<Response> => {
    const { telemetryService, logger } = deps;

    if (!telemetryService) {
      return c.json({ error: "Telemetry not enabled" }, 503);
    }

    try {
      let gateway: string;
      try {
        gateway = decodeURIComponent(c.req.param("gateway"));
      } catch {
        return c.json({ error: "Invalid gateway parameter encoding" }, 400);
      }
      const startHour = c.req.query("start");
      const endHour = c.req.query("end");

      const hourlyStats = telemetryService.getGatewayHourlyStats(
        gateway,
        startHour,
        endHour,
      );

      if (hourlyStats.length === 0) {
        return c.json({ error: "Gateway not found or no data", gateway }, 404);
      }

      // Calculate summary from hourly data
      const summary = hourlyStats.reduce(
        (acc, hour) => ({
          totalRequests: acc.totalRequests + hour.totalRequests,
          successfulRequests: acc.successfulRequests + hour.successfulRequests,
          verificationSuccess:
            acc.verificationSuccess + hour.verificationSuccess,
          verificationFailed: acc.verificationFailed + hour.verificationFailed,
          bytesServed: acc.bytesServed + hour.bytesServed,
          latencySum: acc.latencySum + hour.latencySum,
          latencyCount: acc.latencyCount + hour.latencyCount,
        }),
        {
          totalRequests: 0,
          successfulRequests: 0,
          verificationSuccess: 0,
          verificationFailed: 0,
          bytesServed: 0,
          latencySum: 0,
          latencyCount: 0,
        },
      );

      return c.json({
        gateway,
        period: {
          start: startHour || "last 24 hours",
          end: endHour || "now",
        },
        summary: {
          ...summary,
          successRate:
            summary.totalRequests > 0
              ? summary.successfulRequests / summary.totalRequests
              : 0,
          avgLatencyMs:
            summary.latencyCount > 0
              ? summary.latencySum / summary.latencyCount
              : 0,
        },
        hourlyStats,
      });
    } catch (error) {
      logger.error("Failed to get gateway detail", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json({ error: "Failed to retrieve gateway stats" }, 500);
    }
  };
}

/**
 * Create handler for GET /stats/export
 * Returns reward export data
 */
export function createRewardExportHandler(deps: StatsHandlerDeps) {
  return async (c: Context): Promise<Response> => {
    const { telemetryService, logger } = deps;

    if (!telemetryService) {
      return c.json({ error: "Telemetry not enabled" }, 503);
    }

    try {
      const startHour = c.req.query("start");
      const endHour = c.req.query("end");
      const format = c.req.query("format") || "json";

      const exportData = telemetryService.exportRewardData(startHour, endHour);

      if (format === "csv") {
        // CSV format for easy import
        const csvLines = [
          "gateway,total_requests,successful_requests,bytes_served,success_rate,verification_success_rate,avg_latency_ms,availability_rate",
        ];

        const csvEscape = (val: string | number): string => {
          const s = String(val);
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        };

        for (const gw of exportData.gateways) {
          csvLines.push(
            [
              csvEscape(gw.gateway),
              gw.totalRequests,
              gw.successfulRequests,
              gw.bytesServed,
              gw.successRate.toFixed(4),
              gw.verificationSuccessRate.toFixed(4),
              gw.avgLatencyMs.toFixed(2),
              gw.availabilityRate.toFixed(4),
            ].join(","),
          );
        }

        return new Response(csvLines.join("\n"), {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="gateway-stats-${exportData.period.start}-${exportData.period.end}.csv"`,
          },
        });
      }

      return c.json(exportData);
    } catch (error) {
      logger.error("Failed to export reward data", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json({ error: "Failed to export data" }, 500);
    }
  };
}

/**
 * Create handler for GET /stats/gateways/list
 * Returns list of known gateways
 */
export function createGatewayListHandler(deps: StatsHandlerDeps) {
  return async (c: Context): Promise<Response> => {
    const { telemetryService } = deps;

    if (!telemetryService) {
      return c.json({ error: "Telemetry not enabled" }, 503);
    }

    const gateways = telemetryService.getKnownGateways();

    return c.json({
      gateways,
      count: gateways.length,
    });
  };
}

/**
 * Create handler for enhanced /metrics endpoint
 * Returns Prometheus metrics including gateway-specific metrics
 */
export function createEnhancedMetricsHandler(
  deps: StatsHandlerDeps & { baseMetrics: string },
) {
  return async (_c: Context): Promise<Response> => {
    const { telemetryService, baseMetrics } = deps;

    let metrics = baseMetrics;

    if (telemetryService) {
      const gatewayMetrics = telemetryService.getPrometheusMetrics();
      metrics = `${baseMetrics}\n${gatewayMetrics}`;
    }

    return new Response(metrics, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4",
      },
    });
  };
}
