/**
 * Health Check Handlers
 * Provides health, readiness, and metrics endpoints
 */

import type { Context } from "hono";
import type { Logger, RouterConfig } from "../types/index.js";
import type { GatewaySelector } from "../services/gateway-selector.js";
import type { ArnsResolver } from "../services/arns-resolver.js";
import type { NetworkGatewayManager } from "../services/network-gateway-manager.js";

export interface HealthHandlerDeps {
  gatewaySelector: GatewaySelector;
  arnsResolver: ArnsResolver;
  config: RouterConfig;
  logger: Logger;
  startTime: number;
  version: string;
  /**
   * Present only when routing gateways come from the ar.io network registry.
   * Null for static/trusted-peer sources, where a registry fetch (and so a
   * fallback to hardcoded gateways) is not a concept that applies.
   */
  networkGatewayManager?: NetworkGatewayManager | null;
}

/**
 * Create health check handler
 */
export function createHealthHandler(deps: HealthHandlerDeps) {
  return async (c: Context): Promise<Response> => {
    const uptimeMs = Date.now() - deps.startTime;

    // A failed registry fetch leaves the router serving from a small hardcoded
    // gateway list. It can still serve content, so this stays 200 and does not
    // affect readiness -- but it must not look indistinguishable from healthy.
    const networkStats = deps.networkGatewayManager?.getStats();
    const usingFallback = networkStats?.isFallback === true;

    return c.json({
      status: "healthy",
      ...(usingFallback
        ? {
            degraded: true,
            degradedReason:
              "Using fallback gateways; the ar.io network registry could not be fetched",
            network: {
              gatewayCount: networkStats.gatewayCount,
              fetchFailures: networkStats.fetchFailures,
              lastError: networkStats.lastError,
            },
          }
        : {}),
      uptime: {
        ms: uptimeMs,
        human: formatUptime(uptimeMs),
      },
      version: deps.version,
    });
  };
}

/**
 * Create readiness check handler
 * Returns 200 if the service is ready to accept traffic
 */
export function createReadyHandler(deps: HealthHandlerDeps) {
  return async (c: Context): Promise<Response> => {
    const { gatewaySelector, logger } = deps;

    try {
      // Check if we can reach at least one gateway
      const healthStats = gatewaySelector.healthStats();

      // Consider ready if we have gateway health tracking active
      // or if no gateways have been marked unhealthy yet
      const ready = healthStats.total === 0 || healthStats.healthy > 0;

      if (ready) {
        return c.json({
          status: "ready",
          gateways: healthStats,
        });
      }

      logger.warn("Readiness check failed - no healthy gateways");

      return c.json(
        {
          status: "not_ready",
          reason: "No healthy gateways available",
          gateways: healthStats,
        },
        503,
      );
    } catch (error) {
      logger.error("Readiness check error", {
        error: error instanceof Error ? error.message : String(error),
      });

      return c.json(
        {
          status: "error",
          reason: error instanceof Error ? error.message : "Unknown error",
        },
        503,
      );
    }
  };
}

/**
 * Create metrics handler
 * Returns Prometheus-compatible metrics
 */
export function createMetricsHandler(deps: HealthHandlerDeps) {
  return async (_c: Context): Promise<Response> => {
    const { gatewaySelector, arnsResolver, startTime } = deps;

    const uptimeMs = Date.now() - startTime;
    const gatewayStats = gatewaySelector.healthStats();
    const arnsStats = arnsResolver.stats();

    // These four count entries in the gateway health cache, which is populated
    // lazily -- a gateway appears only once it has actually been contacted on a
    // cache miss (or pinged, which only runs under the "temperature" strategy).
    // They are therefore 0 on a freshly started router and are NOT a measure of
    // how many gateways the network registry knows about; see the
    // wayfinder_router_network_* metrics below for that.
    const metrics = [
      "# HELP wayfinder_router_uptime_seconds Uptime in seconds",
      "# TYPE wayfinder_router_uptime_seconds gauge",
      `wayfinder_router_uptime_seconds ${uptimeMs / 1000}`,
      "",
      "# HELP wayfinder_router_gateways_total Gateways tracked in the health cache (populated lazily as gateways are contacted; not the registry size)",
      "# TYPE wayfinder_router_gateways_total gauge",
      `wayfinder_router_gateways_total ${gatewayStats.total}`,
      "",
      "# HELP wayfinder_router_gateways_healthy Tracked gateways currently considered healthy",
      "# TYPE wayfinder_router_gateways_healthy gauge",
      `wayfinder_router_gateways_healthy ${gatewayStats.healthy}`,
      "",
      "# HELP wayfinder_router_gateways_unhealthy Tracked gateways currently considered unhealthy",
      "# TYPE wayfinder_router_gateways_unhealthy gauge",
      `wayfinder_router_gateways_unhealthy ${gatewayStats.unhealthy}`,
      "",
      "# HELP wayfinder_router_gateways_circuit_open Number of gateways with open circuits",
      "# TYPE wayfinder_router_gateways_circuit_open gauge",
      `wayfinder_router_gateways_circuit_open ${gatewayStats.circuitOpen}`,
      "",
      "# HELP wayfinder_router_arns_cache_size Number of cached ArNS resolutions",
      "# TYPE wayfinder_router_arns_cache_size gauge",
      `wayfinder_router_arns_cache_size ${arnsStats.size}`,
      "",
      ...buildNetworkRegistryMetrics(deps),
    ].join("\n");

    return new Response(metrics, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4",
      },
    });
  };
}

/**
 * Metrics describing the ar.io network gateway registry.
 *
 * NetworkGatewayManager degrades silently by design: when the registry fetch
 * fails it keeps serving from a stale cache or a small hardcoded fallback list,
 * so requests still succeed and nothing in the request path looks wrong. Without
 * these metrics the only evidence is a log line, which makes a broken registry
 * indistinguishable from a healthy router.
 *
 * `wayfinder_router_network_using_fallback` is the alertable signal.
 *
 * Emitted only when routing gateways come from the network, so that the absence
 * of these series is itself meaningful rather than a silent zero.
 */
function buildNetworkRegistryMetrics(deps: HealthHandlerDeps): string[] {
  const stats = deps.networkGatewayManager?.getStats();
  if (!stats) return [];

  const lines = [
    "# HELP wayfinder_router_network_gateways_total Gateways in the ar.io network registry",
    "# TYPE wayfinder_router_network_gateways_total gauge",
    `wayfinder_router_network_gateways_total ${stats.gatewayCount}`,
    "",
    "# HELP wayfinder_router_network_using_fallback 1 when serving from hardcoded fallback gateways because the registry could not be fetched",
    "# TYPE wayfinder_router_network_using_fallback gauge",
    `wayfinder_router_network_using_fallback ${stats.isFallback ? 1 : 0}`,
    "",
    "# HELP wayfinder_router_network_initialized 1 once the gateway manager has completed its first fetch attempt",
    "# TYPE wayfinder_router_network_initialized gauge",
    `wayfinder_router_network_initialized ${stats.initialized ? 1 : 0}`,
    "",
    "# HELP wayfinder_router_network_fetch_successes_total Successful registry fetches since startup",
    "# TYPE wayfinder_router_network_fetch_successes_total counter",
    `wayfinder_router_network_fetch_successes_total ${stats.fetchSuccesses}`,
    "",
    "# HELP wayfinder_router_network_fetch_failures_total Failed registry fetches since startup",
    "# TYPE wayfinder_router_network_fetch_failures_total counter",
    `wayfinder_router_network_fetch_failures_total ${stats.fetchFailures}`,
    "",
    "# HELP wayfinder_router_network_last_fetch_duration_seconds Duration of the most recent registry fetch",
    "# TYPE wayfinder_router_network_last_fetch_duration_seconds gauge",
    `wayfinder_router_network_last_fetch_duration_seconds ${stats.lastFetchDurationMs / 1000}`,
    "",
  ];

  // Null before the first fetch completes; omit rather than report a
  // misleading age of zero.
  if (stats.cacheAge !== null) {
    lines.push(
      "# HELP wayfinder_router_network_cache_age_seconds Age of the cached gateway registry",
      "# TYPE wayfinder_router_network_cache_age_seconds gauge",
      `wayfinder_router_network_cache_age_seconds ${stats.cacheAge / 1000}`,
      "",
    );
  }

  return lines;
}

/**
 * Format uptime in human-readable form
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
