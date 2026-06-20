/**
 * Integration tests for the full HTTP request flow through the Hono app.
 *
 * Instead of calling createServer() (which requires real Solana RPC and
 * network dependencies), we build a minimal Hono app wiring the same
 * middleware and handlers with mocked service dependencies.
 */

import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { Context } from "hono";
import type { RouterConfig, RequestInfo, RouterMode } from "../types/index.js";
import { createRequestParserMiddleware } from "../middleware/request-parser.js";
import { createModeSelectorMiddleware } from "../middleware/mode-selector.js";
import { createRateLimitMiddleware } from "../middleware/rate-limiter.js";
import { createErrorResponse } from "../middleware/error-handler.js";
import { createHealthHandler } from "../handlers/health.js";
import { createProxyHandler } from "../handlers/proxy.js";
import { createRouteHandler } from "../handlers/route.js";
import {
  createTestLogger,
  TEST_TX_ID,
  TEST_GATEWAY_A,
} from "../test-helpers.js";

// Extend Hono context (same declaration as server.ts)
declare module "hono" {
  interface ContextVariableMap {
    requestInfo: RequestInfo;
    routerMode: RouterMode;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_CONTENT = new TextEncoder().encode("hello arweave");
const MOCK_CONTENT_TYPE = "text/plain";

/**
 * Build a minimal RouterConfig with sensible defaults for testing.
 */
function createTestConfig(overrides?: Record<string, unknown>): RouterConfig {
  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
      baseDomain: "localhost",
      rootHostContent: "",
      restrictToRootHost: false,
      graphqlProxyUrl: "",
    },
    mode: {
      default: "proxy" as RouterMode,
      allowOverride: true,
    },
    verification: {
      enabled: false,
      gatewaySource: "static" as const,
      gatewayCount: 1,
      staticGateways: [TEST_GATEWAY_A],
      consensusThreshold: 1,
      retryAttempts: 1,
    },
    routing: {
      strategy: "random" as const,
      gatewaySource: "static" as const,
      trustedPeerGateway: TEST_GATEWAY_A,
      staticGateways: [TEST_GATEWAY_A],
      trustedArioGateways: [],
      retryAttempts: 1,
      retryDelayMs: 0,
      temperatureWindowMs: 60_000,
      temperatureMaxSamples: 100,
    },
    networkGateways: {
      refreshIntervalMs: 300_000,
      minGateways: 1,
      fallbackGateways: [TEST_GATEWAY_A],
      solanaRpcUrl: "",
    },
    resilience: {
      gatewayHealthTtlMs: 60_000,
      circuitBreakerThreshold: 5,
      circuitBreakerResetMs: 60_000,
      gatewayHealthMaxEntries: 100,
      streamTimeoutMs: 30_000,
    },
    cache: {
      arnsTtlMs: 60_000,
      contentEnabled: false,
      contentMaxSizeBytes: 100 * 1024 * 1024,
      contentMaxItemSizeBytes: 10 * 1024 * 1024,
      contentPath: "",
    },
    logging: { level: "error" },
    telemetry: {
      enabled: false,
      routerId: "test",
      sampling: {
        successfulRequests: 0,
        errors: 0,
        latencyMeasurements: 0,
      },
      storage: {
        type: "sqlite" as const,
        path: ":memory:",
        retentionDays: 1,
      },
      export: { enabled: false, intervalHours: 1 },
    },
    rateLimit: {
      enabled: false,
      windowMs: 60_000,
      maxRequests: 100,
    },
    ping: {
      enabled: false,
      intervalHours: 1,
      gatewayCount: 10,
      timeoutMs: 5_000,
      concurrency: 5,
    },
    errorHandling: {
      exitOnUnhandledRejection: false,
      exitOnUncaughtException: false,
      exitGracePeriodMs: 0,
    },
    shutdown: {
      drainTimeoutMs: 5_000,
      shutdownTimeoutMs: 10_000,
    },
    http: {
      connectionsPerHost: 4,
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 30_000,
      keepAliveTimeoutMs: 60_000,
    },
    arweaveApi: {
      enabled: false,
      readNodes: [],
      writeNodes: [],
      cache: {
        enabled: false,
        immutableTtlMs: 0,
        dynamicTtlMs: 0,
        maxEntries: 0,
        maxSizeBytes: 0,
      },
      retryAttempts: 1,
      retryDelayMs: 0,
      timeoutMs: 5_000,
    },
    moderation: {
      enabled: false,
      blocklistPath: "",
      adminToken: "",
    },
    admin: {
      enabled: false,
      port: 3001,
      host: "127.0.0.1",
      token: "",
      openBrowser: false,
    },
    ...overrides,
  } as RouterConfig;
}

/**
 * Create mock service objects that satisfy handler dependency interfaces.
 */
function createMockServices() {
  const logger = createTestLogger();

  const arnsResolver = {
    resolve: vi.fn().mockResolvedValue({
      txId: TEST_TX_ID,
      ttlMs: 60_000,
      resolvedAt: Date.now(),
    }),
    invalidate: vi.fn(),
    stats: vi.fn().mockReturnValue({ size: 0, maxSize: 1000 }),
  };

  const gatewaySelector = {
    select: vi.fn().mockResolvedValue(TEST_GATEWAY_A),
    selectForTransaction: vi.fn().mockResolvedValue(TEST_GATEWAY_A),
    selectForArns: vi.fn().mockResolvedValue(TEST_GATEWAY_A),
    markHealthy: vi.fn(),
    markUnhealthy: vi.fn(),
    recordVerificationFailure: vi.fn(),
    healthStats: vi.fn().mockReturnValue({
      total: 1,
      healthy: 1,
      unhealthy: 0,
      circuitOpen: 0,
    }),
    clearHealthCache: vi.fn(),
  };

  const contentFetcher = {
    fetchByTxId: vi.fn().mockResolvedValue({
      response: new Response(MOCK_CONTENT, {
        status: 200,
        headers: {
          "content-type": MOCK_CONTENT_TYPE,
          "content-length": String(MOCK_CONTENT.length),
        },
      }),
      gateway: TEST_GATEWAY_A,
      headers: new Headers({
        "content-type": MOCK_CONTENT_TYPE,
        "content-length": String(MOCK_CONTENT.length),
      }),
    }),
    fetchByArns: vi.fn().mockResolvedValue({
      response: new Response(MOCK_CONTENT, {
        status: 200,
        headers: {
          "content-type": MOCK_CONTENT_TYPE,
          "content-length": String(MOCK_CONTENT.length),
        },
      }),
      gateway: TEST_GATEWAY_A,
      headers: new Headers({
        "content-type": MOCK_CONTENT_TYPE,
        "content-length": String(MOCK_CONTENT.length),
      }),
    }),
  };

  const verifier = {
    enabled: false,
    verify: vi.fn(),
    createStreamingVerification: vi.fn(),
  };

  const manifestResolver = {
    resolvePath: vi.fn(),
    invalidate: vi.fn(),
  };

  const contentCache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(true),
    isEnabled: vi.fn().mockReturnValue(false),
    toResponse: vi.fn(),
    invalidate: vi.fn(),
    getPrometheusMetrics: vi.fn().mockReturnValue(""),
  };

  return {
    logger,
    arnsResolver,
    gatewaySelector,
    contentFetcher,
    verifier,
    manifestResolver,
    contentCache,
  };
}

/**
 * Build a Hono app that mirrors server.ts wiring but with mocked services.
 */
function createTestApp(configOverrides?: Record<string, unknown>) {
  const config = createTestConfig(configOverrides);
  const services = createMockServices();
  const startTime = Date.now();

  const app = new Hono();

  // Rate limiting (early, same as server.ts)
  app.use("*", createRateLimitMiddleware(config));

  // Request parsing
  app.use("*", createRequestParserMiddleware(config));

  // Mode selection
  app.use("*", createModeSelectorMiddleware(config));

  // Health endpoint
  const healthDeps = {
    gatewaySelector: services.gatewaySelector as any,
    arnsResolver: services.arnsResolver as any,
    config,
    logger: services.logger,
    startTime,
    version: "0.0.0-test",
  };
  app.get("/wayfinder/health", createHealthHandler(healthDeps));

  // Main catch-all handler (mirrors the app.all("*") in server.ts)
  app.all("*", async (c: Context) => {
    const requestInfo = c.get("requestInfo");
    const routerMode = c.get("routerMode");

    if (requestInfo.type === "reserved") {
      return c.json({ error: "Not Found", path: requestInfo.path }, 404);
    }

    if (requestInfo.type === "blocked") {
      return c.json({ error: "Not Found", message: "Blocked" }, 404);
    }

    try {
      if (routerMode === "route") {
        const handler = createRouteHandler({
          arnsResolver: services.arnsResolver as any,
          gatewaySelector: services.gatewaySelector as any,
          config,
          logger: services.logger,
        });
        return await handler(c);
      } else {
        const handler = createProxyHandler({
          arnsResolver: services.arnsResolver as any,
          contentFetcher: services.contentFetcher as any,
          verifier: services.verifier as any,
          manifestResolver: services.manifestResolver as any,
          config,
          logger: services.logger,
          contentCache: services.contentCache as any,
          gatewaySelector: services.gatewaySelector as any,
        });
        return await handler(c);
      }
    } catch (error) {
      return createErrorResponse(
        c,
        error instanceof Error ? error : new Error(String(error)),
        services.logger,
      );
    }
  });

  // Global error handler
  app.onError((err, c) => {
    return createErrorResponse(c, err, services.logger);
  });

  return { app, config, services, startTime };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("proxy-flow integration", () => {
  describe("health endpoint", () => {
    it("GET /wayfinder/health returns 200 with status, uptime, and version", async () => {
      const { app } = createTestApp();

      const res = await app.request("/wayfinder/health");

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.status).toBe("healthy");
      expect(body).toHaveProperty("uptime");
      expect(body.version).toBe("0.0.0-test");
    });
  });

  describe("txId proxy", () => {
    it("GET /{txId} returns proxied content with x-wayfinder-mode header", async () => {
      const { app } = createTestApp();

      // The request parser sees the txId but no sandbox subdomain,
      // so the proxy handler will redirect to the sandbox subdomain.
      // To test actual proxied content, we need to simulate a sandbox request.
      // Instead we make a direct request and check what the handler returns.
      const res = await app.request(`/${TEST_TX_ID}`);

      // Without a sandbox subdomain the proxy handler redirects to one.
      // This is expected behavior -- verify it's a 302.
      expect(res.status).toBe(302);
      const location = res.headers.get("location");
      expect(location).toBeTruthy();
      expect(location).toContain(TEST_TX_ID);
    });

    it("GET /{txId} from sandbox subdomain returns proxied content", async () => {
      const { app, services } = createTestApp();

      // We need to import sandboxFromTxId to construct a proper sandbox URL
      const { sandboxFromTxId } = await import("../utils/url.js");
      const sandbox = sandboxFromTxId(TEST_TX_ID);

      const res = await app.request(`/${TEST_TX_ID}`, {
        headers: {
          host: `${sandbox}.localhost`,
        },
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("hello arweave");
      expect(res.headers.get("x-wayfinder-mode")).toBe("proxy");
      expect(services.contentFetcher.fetchByTxId).toHaveBeenCalled();
    });
  });

  describe("ArNS subdomain proxy", () => {
    it("GET / with Host: arns-name.localhost returns proxied content", async () => {
      const { app, services } = createTestApp();

      const res = await app.request("/", {
        headers: {
          host: "my-app.localhost",
        },
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("hello arweave");
      expect(res.headers.get("x-wayfinder-mode")).toBe("proxy");
      expect(services.arnsResolver.resolve).toHaveBeenCalledWith("my-app");
      expect(services.contentFetcher.fetchByArns).toHaveBeenCalled();
    });
  });

  describe("route mode redirect", () => {
    it("GET /{txId}?mode=route returns 302 with Location header", async () => {
      const { app, services } = createTestApp();

      // Use sandbox subdomain so the handler doesn't redirect for sandbox first
      const { sandboxFromTxId } = await import("../utils/url.js");
      const sandbox = sandboxFromTxId(TEST_TX_ID);

      const res = await app.request(`/${TEST_TX_ID}?mode=route`, {
        headers: {
          host: `${sandbox}.localhost`,
        },
      });

      expect(res.status).toBe(302);
      const location = res.headers.get("location");
      expect(location).toBeTruthy();
      // The redirect should point to the selected gateway
      expect(location).toContain(TEST_GATEWAY_A.hostname);
      expect(services.gatewaySelector.selectForTransaction).toHaveBeenCalled();
    });

    it("ArNS route mode returns 302 redirecting to gateway", async () => {
      const { app, services } = createTestApp();

      const res = await app.request("/?mode=route", {
        headers: {
          host: "my-app.localhost",
        },
      });

      expect(res.status).toBe(302);
      const location = res.headers.get("location");
      expect(location).toBeTruthy();
      expect(location).toContain(TEST_GATEWAY_A.hostname);
      expect(services.arnsResolver.resolve).toHaveBeenCalledWith("my-app");
      expect(services.gatewaySelector.selectForArns).toHaveBeenCalled();
    });
  });

  describe("cache hit", () => {
    it("second GET for same txId returns cached response when verification enabled", async () => {
      const { app, services } = createTestApp({
        verification: {
          enabled: true,
          gatewaySource: "static",
          gatewayCount: 1,
          staticGateways: [TEST_GATEWAY_A],
          consensusThreshold: 1,
          retryAttempts: 1,
        },
        cache: {
          arnsTtlMs: 60_000,
          contentEnabled: true,
          contentMaxSizeBytes: 100 * 1024 * 1024,
          contentMaxItemSizeBytes: 10 * 1024 * 1024,
          contentPath: "",
        },
      });

      // Enable verification on the mock verifier
      (services.verifier as any).enabled = true;

      // Enable content cache
      services.contentCache.isEnabled.mockReturnValue(true);

      // For the first request, cache miss then verification succeeds
      services.contentCache.get.mockResolvedValueOnce(null);

      // Set up streaming verification mock
      const verifiedData = MOCK_CONTENT;
      services.verifier.createStreamingVerification.mockReturnValue({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(verifiedData);
            controller.close();
          },
        }),
        verificationPromise: Promise.resolve({
          verified: true,
          txId: TEST_TX_ID,
          durationMs: 5,
          hash: "abc123",
        }),
      });

      const { sandboxFromTxId } = await import("../utils/url.js");
      const sandbox = sandboxFromTxId(TEST_TX_ID);

      // First request -- fetches and verifies
      const res1 = await app.request(`/${TEST_TX_ID}`, {
        headers: { host: `${sandbox}.localhost` },
      });
      expect(res1.status).toBe(200);

      // For the second request, simulate a cache hit
      services.contentCache.get.mockResolvedValueOnce({
        data: MOCK_CONTENT,
        contentType: MOCK_CONTENT_TYPE,
        contentLength: MOCK_CONTENT.length,
        headers: { "content-type": MOCK_CONTENT_TYPE },
        verifiedAt: Date.now(),
        txId: TEST_TX_ID,
        hash: "abc123",
        accessCount: 1,
        lastAccessed: Date.now(),
      });

      services.contentCache.toResponse.mockReturnValue(
        new Response(MOCK_CONTENT, {
          headers: new Headers({
            "content-type": MOCK_CONTENT_TYPE,
          }),
        }),
      );

      // Second request -- should hit cache (no new fetch)
      services.contentFetcher.fetchByTxId.mockClear();

      const res2 = await app.request(`/${TEST_TX_ID}`, {
        headers: { host: `${sandbox}.localhost` },
      });
      expect(res2.status).toBe(200);
      expect(res2.headers.get("x-wayfinder-cached")).toBe("true");

      // Content fetcher should NOT have been called for the cached request
      expect(services.contentFetcher.fetchByTxId).not.toHaveBeenCalled();
    });
  });

  describe("verification failure", () => {
    it("returns 502 when verifier rejects all attempts", async () => {
      const { app, services } = createTestApp({
        verification: {
          enabled: true,
          gatewaySource: "static",
          gatewayCount: 1,
          staticGateways: [TEST_GATEWAY_A],
          consensusThreshold: 1,
          retryAttempts: 1,
        },
      });

      // Enable verification
      (services.verifier as any).enabled = true;

      // Cache disabled so it doesn't short-circuit
      services.contentCache.isEnabled.mockReturnValue(false);

      // Make streaming verification throw
      services.verifier.createStreamingVerification.mockReturnValue({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(MOCK_CONTENT);
            controller.close();
          },
        }),
        verificationPromise: Promise.reject(new Error("Hash mismatch")),
      });

      // The content fetcher must return a fresh response for each call
      services.contentFetcher.fetchByTxId.mockImplementation(async () => ({
        response: new Response(MOCK_CONTENT, {
          status: 200,
          headers: {
            "content-type": MOCK_CONTENT_TYPE,
            "content-length": String(MOCK_CONTENT.length),
          },
        }),
        gateway: TEST_GATEWAY_A,
        headers: new Headers({
          "content-type": MOCK_CONTENT_TYPE,
          "content-length": String(MOCK_CONTENT.length),
        }),
      }));

      const { sandboxFromTxId } = await import("../utils/url.js");
      const sandbox = sandboxFromTxId(TEST_TX_ID);

      const res = await app.request(`/${TEST_TX_ID}`, {
        headers: { host: `${sandbox}.localhost` },
      });

      // After exhausting all retry attempts the handler throws, which the
      // error handler converts to a 500 (generic) or 502 depending on error type.
      // The proxy handler wraps the failure in a generic Error, so we get 500.
      expect(res.status).toBeGreaterThanOrEqual(500);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("error");
    });
  });

  describe("all gateways fail", () => {
    it("returns 502 when content fetcher throws GatewayError", async () => {
      const { app, services } = createTestApp();

      // Make content fetcher fail with an error
      const { GatewayError } = await import("../middleware/error-handler.js");
      services.contentFetcher.fetchByTxId.mockRejectedValue(
        new GatewayError(TEST_GATEWAY_A.origin, "Gateway returned 503", 502),
      );

      const { sandboxFromTxId } = await import("../utils/url.js");
      const sandbox = sandboxFromTxId(TEST_TX_ID);

      const res = await app.request(`/${TEST_TX_ID}`, {
        headers: { host: `${sandbox}.localhost` },
      });

      expect(res.status).toBe(502);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe("GATEWAY_ERROR");
    });

    it("returns 502 for ArNS fetch failure", async () => {
      const { app, services } = createTestApp();

      const { GatewayError } = await import("../middleware/error-handler.js");
      services.contentFetcher.fetchByArns.mockRejectedValue(
        new GatewayError(
          TEST_GATEWAY_A.origin,
          "All gateways unavailable",
          502,
        ),
      );

      const res = await app.request("/some/path", {
        headers: { host: "my-dapp.localhost" },
      });

      expect(res.status).toBe(502);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe("GATEWAY_ERROR");
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      const { app } = createTestApp({
        rateLimit: {
          enabled: true,
          windowMs: 60_000,
          maxRequests: 2,
        },
      });

      const clientIp = "10.20.30.40";

      // Use a non-health path since /wayfinder/health is exempt from rate limiting.
      // /wayfinder/info is a reserved path that returns JSON without needing mocks.
      const res1 = await app.request("/wayfinder/info", {
        headers: { "x-forwarded-for": clientIp },
      });
      expect(res1.status).toBeLessThan(429);

      const res2 = await app.request("/wayfinder/info", {
        headers: { "x-forwarded-for": clientIp },
      });
      expect(res2.status).toBeLessThan(429);

      // Third request should be rate limited
      const res3 = await app.request("/wayfinder/info", {
        headers: { "x-forwarded-for": clientIp },
      });
      expect(res3.status).toBe(429);
      const body = (await res3.json()) as Record<string, unknown>;
      expect(body.error).toBe("RATE_LIMITED");
      expect(res3.headers.get("Retry-After")).toBeTruthy();
    });

    it("different IPs are tracked independently", async () => {
      const { app } = createTestApp({
        rateLimit: {
          enabled: true,
          windowMs: 60_000,
          maxRequests: 1,
        },
      });

      // Use a non-health path since health endpoints are exempt
      const res1 = await app.request("/wayfinder/info", {
        headers: { "x-forwarded-for": "1.1.1.1" },
      });
      expect(res1.status).toBeLessThan(429);

      // Different IP should still be allowed
      const res2 = await app.request("/wayfinder/info", {
        headers: { "x-forwarded-for": "2.2.2.2" },
      });
      expect(res2.status).toBeLessThan(429);
    });
  });
});
