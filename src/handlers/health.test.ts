import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import {
  createHealthHandler,
  createMetricsHandler,
  type HealthHandlerDeps,
} from "./health.js";
import { createTestLogger } from "../test-helpers.js";
import type { NetworkGatewayManager } from "../services/network-gateway-manager.js";

type NetworkStats = ReturnType<NetworkGatewayManager["getStats"]>;

function createNetworkStats(
  overrides: Partial<NetworkStats> = {},
): NetworkStats {
  return {
    initialized: true,
    gatewayCount: 315,
    cacheAge: 60_000,
    isFallback: false,
    fetchAttempts: 1,
    fetchSuccesses: 1,
    fetchFailures: 0,
    lastFetchDurationMs: 1400,
    lastError: null,
    nextRefreshMs: 86_340_000,
    ...overrides,
  };
}

function createDeps(
  networkStats: NetworkStats | null = createNetworkStats(),
): HealthHandlerDeps {
  return {
    gatewaySelector: {
      healthStats: vi.fn().mockReturnValue({
        total: 0,
        healthy: 0,
        unhealthy: 0,
        circuitOpen: 0,
        maxGateways: 1000,
      }),
    } as any,
    arnsResolver: { stats: vi.fn().mockReturnValue({ size: 0 }) } as any,
    config: {} as any,
    logger: createTestLogger(),
    startTime: Date.now() - 5_000,
    version: "0.1.3",
    networkGatewayManager: networkStats
      ? ({ getStats: () => networkStats } as any)
      : null,
  };
}

async function getMetrics(deps: HealthHandlerDeps): Promise<string> {
  const app = new Hono();
  app.get("/metrics", createMetricsHandler(deps));
  const res = await app.request("/metrics");
  return res.text();
}

async function getHealth(deps: HealthHandlerDeps): Promise<any> {
  const app = new Hono();
  app.get("/health", createHealthHandler(deps));
  const res = await app.request("/health");
  return { status: res.status, body: await res.json() };
}

describe("health handler", () => {
  it("reports healthy without a degraded flag under normal operation", async () => {
    const { status, body } = await getHealth(createDeps());

    expect(status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.degraded).toBeUndefined();
  });

  // The router keeps serving from hardcoded gateways when the registry fetch
  // fails, so this must stay 200 while still being distinguishable from healthy.
  it("flags degraded when serving from fallback gateways", async () => {
    const { status, body } = await getHealth(
      createDeps(
        createNetworkStats({
          isFallback: true,
          gatewayCount: 3,
          fetchFailures: 2,
          lastError: "No gateways returned from ar.io network",
        }),
      ),
    );

    expect(status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.degraded).toBe(true);
    expect(body.degradedReason).toMatch(/fallback/i);
    expect(body.network.gatewayCount).toBe(3);
    expect(body.network.fetchFailures).toBe(2);
    expect(body.network.lastError).toBe(
      "No gateways returned from ar.io network",
    );
  });

  it("omits the degraded block when there is no network manager", async () => {
    const { body } = await getHealth(createDeps(null));
    expect(body.degraded).toBeUndefined();
  });
});

describe("metrics handler", () => {
  it("exposes the network registry size", async () => {
    const metrics = await getMetrics(createDeps());
    expect(metrics).toContain("wayfinder_router_network_gateways_total 315");
  });

  it("reports using_fallback as 0 when the registry was fetched", async () => {
    const metrics = await getMetrics(createDeps());
    expect(metrics).toContain("wayfinder_router_network_using_fallback 0");
  });

  // This is the alertable signal: without it, a broken registry is invisible.
  it("reports using_fallback as 1 while degraded", async () => {
    const metrics = await getMetrics(
      createDeps(createNetworkStats({ isFallback: true, gatewayCount: 3 })),
    );

    expect(metrics).toContain("wayfinder_router_network_using_fallback 1");
    expect(metrics).toContain("wayfinder_router_network_gateways_total 3");
  });

  it("exposes fetch success and failure counters", async () => {
    const metrics = await getMetrics(
      createDeps(createNetworkStats({ fetchSuccesses: 4, fetchFailures: 2 })),
    );

    expect(metrics).toContain(
      "wayfinder_router_network_fetch_successes_total 4",
    );
    expect(metrics).toContain(
      "wayfinder_router_network_fetch_failures_total 2",
    );
  });

  it("converts cache age and fetch duration to seconds", async () => {
    const metrics = await getMetrics(
      createDeps(
        createNetworkStats({ cacheAge: 120_000, lastFetchDurationMs: 1500 }),
      ),
    );

    expect(metrics).toContain("wayfinder_router_network_cache_age_seconds 120");
    expect(metrics).toContain(
      "wayfinder_router_network_last_fetch_duration_seconds 1.5",
    );
  });

  it("omits cache age before the first fetch completes", async () => {
    const metrics = await getMetrics(
      createDeps(createNetworkStats({ cacheAge: null, initialized: false })),
    );

    expect(metrics).not.toContain("wayfinder_router_network_cache_age_seconds");
    expect(metrics).toContain("wayfinder_router_network_initialized 0");
  });

  // Absence must be meaningful: static/trusted-peer sources have no registry,
  // so emitting zeros would look like a registry that found no gateways.
  it("omits all network metrics when routing does not use the registry", async () => {
    const metrics = await getMetrics(createDeps(null));

    expect(metrics).not.toContain("wayfinder_router_network_");
    expect(metrics).toContain("wayfinder_router_uptime_seconds");
  });

  it("documents that health-cache gateway counts are not the registry size", async () => {
    const metrics = await getMetrics(createDeps());
    const helpLine = metrics
      .split("\n")
      .find((l) => l.startsWith("# HELP wayfinder_router_gateways_total"));

    expect(helpLine).toBeDefined();
    expect(helpLine).toMatch(/not the registry size/);
  });
});
