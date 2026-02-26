/**
 * Wayfinder Router Server
 * Main Hono server setup with all middleware and handlers
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { logger as honoLogger } from "hono/logger";
import packageJson from "../package.json" with { type: "json" };

const ROUTER_VERSION: string = packageJson.version;

import type {
  RouterConfig,
  Logger,
  RequestInfo,
  RouterMode,
} from "./types/index.js";
import { createRequestParserMiddleware } from "./middleware/request-parser.js";
import { createModeSelectorMiddleware } from "./middleware/mode-selector.js";
import { createRateLimitMiddleware } from "./middleware/rate-limiter.js";
import { createErrorResponse } from "./middleware/error-handler.js";
import { requestTrackingMiddleware } from "./middleware/request-tracking.js";
import { RequestTracker } from "./utils/request-tracker.js";
import { HttpClient, createHttpClient } from "./http/http-client.js";

import {
  createWayfinderServices,
  createNetworkManager,
  type WayfinderServices,
} from "./services/wayfinder-client.js";
import type { NetworkGatewayManager } from "./services/network-gateway-manager.js";
import {
  createArnsResolver,
  type ArnsResolver,
} from "./services/arns-resolver.js";
import {
  createGatewaySelector,
  type GatewaySelector,
} from "./services/gateway-selector.js";
import { createVerifier, type Verifier } from "./services/verifier.js";
import {
  createContentFetcher,
  type ContentFetcher,
} from "./services/content-fetcher.js";
import {
  createManifestResolver,
  type ManifestResolver,
} from "./services/manifest-resolver.js";
import {
  GatewayPingService,
  createGatewayPingService,
} from "./services/gateway-ping-service.js";

import { createProxyHandler } from "./handlers/proxy.js";
import { createRouteHandler } from "./handlers/route.js";
import {
  createArweaveApiProxyHandler,
  createArweaveApiRouteHandler,
} from "./handlers/arweave-api.js";
import {
  createHealthHandler,
  createReadyHandler,
  createMetricsHandler,
} from "./handlers/health.js";
import {
  createGatewayStatsHandler,
  createGatewayDetailHandler,
  createGatewayListHandler,
  createRewardExportHandler,
} from "./handlers/stats.js";
import {
  TelemetryService,
  createDisabledTelemetryService,
} from "./telemetry/service.js";
import { ContentCache } from "./cache/content-cache.js";
import { ArweaveApiCache } from "./cache/arweave-api-cache.js";
import {
  createArweaveNodeSelector,
  ArweaveNodeSelector,
} from "./services/arweave-node-selector.js";
import {
  createArweaveApiFetcher,
  ArweaveApiFetcher,
} from "./services/arweave-api-fetcher.js";
import {
  BlocklistService,
  createBlocklistService,
} from "./moderation/blocklist-service.js";
import {
  createModerationAuthMiddleware,
  createListBlocklistHandler,
  createBlockHandler,
  createUnblockHandler,
  createStatsHandler as createModerationStatsHandler,
  createReloadHandler,
  createCheckHandler,
} from "./moderation/handlers.js";

// Extend Hono context with our custom variables
declare module "hono" {
  interface ContextVariableMap {
    requestInfo: RequestInfo;
    routerMode: RouterMode;
  }
}

export interface RouterServices {
  arnsResolver: ArnsResolver;
  gatewaySelector: GatewaySelector;
  verifier: Verifier;
  contentFetcher: ContentFetcher;
  manifestResolver: ManifestResolver;
  telemetryService: TelemetryService | null;
  contentCache: ContentCache;
  wayfinderServices: WayfinderServices;
  networkGatewayManager: NetworkGatewayManager | null;
  pingService: GatewayPingService | null;
  /** Request tracker for graceful shutdown */
  requestTracker: RequestTracker;
  /** HTTP client with connection pooling */
  httpClient: HttpClient;
  /** Arweave API cache (null if disabled) */
  arweaveApiCache: ArweaveApiCache | null;
  /** Arweave node selector (null if disabled) */
  arweaveNodeSelector: ArweaveNodeSelector | null;
  /** Arweave API fetcher (null if disabled) */
  arweaveApiFetcher: ArweaveApiFetcher | null;
  /** Blocklist service for content moderation (null if disabled) */
  blocklistService: BlocklistService | null;
}

export interface CreateServerOptions {
  config: RouterConfig;
  logger: Logger;
}

/**
 * Create and configure the Hono server
 */
export function createServer(options: CreateServerOptions) {
  const { config, logger } = options;
  const startTime = Date.now();

  // Create request tracker for graceful shutdown
  const requestTracker = new RequestTracker({ logger });

  // Create HTTP client with connection pooling for content fetching
  const httpClient = createHttpClient({
    connectionsPerHost: config.http.connectionsPerHost,
    connectTimeoutMs: config.http.connectTimeoutMs,
    keepAliveTimeoutMs: config.http.keepAliveTimeoutMs,
    logger,
  });

  logger.info("HTTP client with connection pooling created", {
    connectionsPerHost: config.http.connectionsPerHost,
    connectTimeoutMs: config.http.connectTimeoutMs,
    keepAliveTimeoutMs: config.http.keepAliveTimeoutMs,
  });

  // Create network gateway manager if needed (for network/top-staked sources)
  const networkGatewayManager = createNetworkManager(config, logger);

  // Initialize Wayfinder SDK services (network manager must be initialized later)
  const wayfinderServices = createWayfinderServices(
    config,
    logger,
    networkGatewayManager,
  );

  // Initialize application services
  // ArNS resolver uses verification gateways for consensus
  const arnsResolver = createArnsResolver(
    config,
    logger,
    wayfinderServices.verificationGatewaysProvider,
  );

  const gatewaySelector = createGatewaySelector(
    wayfinderServices.routingStrategy,
    wayfinderServices.routingGatewaysProvider,
    config,
    logger,
  );

  const verifier = createVerifier(
    wayfinderServices.verificationStrategy,
    wayfinderServices.verificationGatewaysProvider,
    config,
    logger,
  );

  // Pass temperature cache and HTTP client to content fetcher for performance tracking
  // (temperature cache only used when routing strategy is "temperature")
  // (HTTP client provides connection pooling for efficient gateway requests)
  const contentFetcher = createContentFetcher(
    gatewaySelector,
    config,
    logger,
    wayfinderServices.temperatureCache ?? undefined,
    httpClient,
  );

  // Initialize manifest resolver for verifying path manifests
  // Uses the same verification gateways as ArNS resolver for trust
  const manifestResolver = createManifestResolver(
    config,
    logger,
    wayfinderServices.verificationGatewaysProvider,
  );

  // Initialize verified content cache
  const contentCache = new ContentCache({
    enabled: config.cache.contentEnabled,
    maxSizeBytes: config.cache.contentMaxSizeBytes,
    maxItemSizeBytes: config.cache.contentMaxItemSizeBytes,
    contentPath: config.cache.contentPath,
    ttlMs: 0, // No TTL - Arweave content is immutable
    logger,
  });

  // Initialize telemetry service
  let telemetryService: TelemetryService | null = null;
  if (config.telemetry.enabled) {
    telemetryService = new TelemetryService({
      config: config.telemetry,
      logger,
      routerId: config.telemetry.routerId,
      routerVersion: ROUTER_VERSION,
      baseDomain: config.server.baseDomain,
    });
    logger.info("Telemetry service initialized", {
      routerId: config.telemetry.routerId,
      samplingRate: config.telemetry.sampling.successfulRequests,
    });
  } else {
    createDisabledTelemetryService(logger);
  }

  // Create ping service if enabled and conditions are met:
  // - ping.enabled is true
  // - routing strategy is "temperature" (needs temperature cache)
  // - network manager exists (needs gateway list)
  // - temperature cache exists
  let pingService: GatewayPingService | null = null;
  if (
    config.ping.enabled &&
    config.routing.strategy === "temperature" &&
    networkGatewayManager &&
    wayfinderServices.temperatureCache
  ) {
    pingService = createGatewayPingService({
      networkManager: networkGatewayManager,
      temperatureCache: wayfinderServices.temperatureCache,
      gatewaySelector, // For health tracking (circuit breaker)
      intervalHours: config.ping.intervalHours,
      gatewayCount: config.ping.gatewayCount,
      timeoutMs: config.ping.timeoutMs,
      concurrency: config.ping.concurrency,
      logger,
    });
    logger.info("Gateway ping service created", {
      intervalHours: config.ping.intervalHours,
      gatewayCount: config.ping.gatewayCount,
    });
  } else if (config.ping.enabled && config.routing.strategy !== "temperature") {
    logger.debug(
      "Gateway ping service disabled: requires temperature routing strategy",
    );
  }

  // Initialize Arweave API services if enabled
  let arweaveApiCache: ArweaveApiCache | null = null;
  let arweaveNodeSelector: ArweaveNodeSelector | null = null;
  let arweaveApiFetcher: ArweaveApiFetcher | null = null;

  if (config.arweaveApi.enabled) {
    // Create Arweave API cache
    if (config.arweaveApi.cache.enabled) {
      arweaveApiCache = new ArweaveApiCache({
        enabled: true,
        immutableTtlMs: config.arweaveApi.cache.immutableTtlMs,
        dynamicTtlMs: config.arweaveApi.cache.dynamicTtlMs,
        maxEntries: config.arweaveApi.cache.maxEntries,
        maxSizeBytes: config.arweaveApi.cache.maxSizeBytes,
        logger,
      });
      logger.info("Arweave API cache initialized", {
        immutableTtlMs: config.arweaveApi.cache.immutableTtlMs,
        dynamicTtlMs: config.arweaveApi.cache.dynamicTtlMs,
        maxEntries: config.arweaveApi.cache.maxEntries,
      });
    }

    // Create Arweave node selector
    arweaveNodeSelector = createArweaveNodeSelector(config, logger);

    // Create Arweave API fetcher
    if (arweaveNodeSelector) {
      arweaveApiFetcher = createArweaveApiFetcher(
        arweaveNodeSelector,
        arweaveApiCache,
        config,
        logger,
        (url, options) => httpClient.fetch(url, options),
      );
      logger.info("Arweave API proxy enabled", {
        readNodes: config.arweaveApi.readNodes.map((n) => n.hostname),
        writeNodes: config.arweaveApi.writeNodes.map((n) => n.hostname),
        cacheEnabled: config.arweaveApi.cache.enabled,
      });
    }
  }

  // Initialize content moderation blocklist service
  const blocklistService = createBlocklistService({
    config: config.moderation,
    logger,
    arnsResolver: {
      resolve: async (arnsName: string) => {
        const resolution = await arnsResolver.resolve(arnsName);
        return resolution !== null ? { txId: resolution.txId } : null;
      },
    },
    cachePurger: {
      purgeArns: (arnsName: string) => {
        arnsResolver.invalidate(arnsName);
      },
      purgeTxId: (txId: string) => {
        contentCache.invalidate(txId);
      },
      purgeManifest: (txId: string) => {
        manifestResolver.invalidate(txId);
      },
    },
  });

  if (blocklistService) {
    logger.info("Content moderation enabled", {
      blocklistPath: config.moderation.blocklistPath,
    });
  }

  const services: RouterServices = {
    arnsResolver,
    gatewaySelector,
    verifier,
    contentFetcher,
    manifestResolver,
    telemetryService,
    contentCache,
    wayfinderServices,
    networkGatewayManager,
    pingService,
    requestTracker,
    httpClient,
    arweaveApiCache,
    arweaveNodeSelector,
    arweaveApiFetcher,
    blocklistService,
  };

  // Create Hono app
  const app = new Hono();

  // Global middleware
  app.use("*", secureHeaders());
  // CORS: Allow all origins — intentional for a content proxy.
  // Browsers must be able to fetch Arweave content from any origin.
  app.use("*", cors());

  // Request tracking for graceful shutdown (applied very early)
  // Returns 503 when shutting down, tracks in-flight requests
  app.use("*", requestTrackingMiddleware(requestTracker));

  // Rate limiting (applied early, but skips health endpoints internally)
  app.use("*", createRateLimitMiddleware(config));

  // Request logging (only in development)
  if (config.logging.level === "debug") {
    app.use("*", honoLogger());
  }

  // Request parsing middleware
  app.use("*", createRequestParserMiddleware(config));

  // Mode selection middleware
  app.use("*", createModeSelectorMiddleware(config));

  // Health check endpoints (before main routing)
  const healthDeps = {
    gatewaySelector,
    arnsResolver,
    config,
    logger,
    startTime,
    version: ROUTER_VERSION,
  };

  // All router endpoints are under /wayfinder/ prefix
  app.get("/wayfinder/health", createHealthHandler(healthDeps));
  app.get("/wayfinder/ready", createReadyHandler(healthDeps));

  // Metrics endpoint (enhanced with telemetry and cache metrics)
  const baseMetricsHandler = createMetricsHandler(healthDeps);
  app.get("/wayfinder/metrics", async (c) => {
    const baseResponse = await baseMetricsHandler(c);
    let metrics = await baseResponse.text();

    // Add content cache metrics
    if (contentCache.isEnabled()) {
      metrics += contentCache.getPrometheusMetrics();
    }

    // Add telemetry metrics if enabled
    if (telemetryService) {
      metrics += telemetryService.getPrometheusMetrics();
    }

    // Add ping service metrics if enabled
    if (pingService) {
      metrics += pingService.getPrometheusMetrics();
    }

    // Add HTTP connection pool metrics
    metrics += httpClient.getPrometheusMetrics();

    // Add Arweave API cache metrics if enabled
    if (arweaveApiCache) {
      metrics += arweaveApiCache.getPrometheusMetrics();
    }

    return new Response(metrics, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4",
      },
    });
  });

  // Stats API endpoints (only when telemetry enabled)
  const statsDeps = { telemetryService, logger };
  app.get("/wayfinder/stats/gateways", createGatewayStatsHandler(statsDeps));
  app.get(
    "/wayfinder/stats/gateways/list",
    createGatewayListHandler(statsDeps),
  );
  app.get(
    "/wayfinder/stats/gateways/:gateway",
    createGatewayDetailHandler(statsDeps),
  );
  app.get("/wayfinder/stats/export", createRewardExportHandler(statsDeps));

  // Content moderation API endpoints (protected by auth middleware)
  if (blocklistService && config.moderation.enabled) {
    const moderationDeps = {
      blocklistService,
      config: config.moderation,
      logger,
    };
    const authMiddleware = createModerationAuthMiddleware(config.moderation);

    // Public check endpoint (no auth required)
    app.get(
      "/wayfinder/moderation/check/:type/:value",
      createCheckHandler(moderationDeps),
    );

    // Protected admin endpoints
    app.get(
      "/wayfinder/moderation/blocklist",
      authMiddleware,
      createListBlocklistHandler(moderationDeps),
    );
    app.post(
      "/wayfinder/moderation/block",
      authMiddleware,
      createBlockHandler(moderationDeps),
    );
    app.delete(
      "/wayfinder/moderation/block/:type/:value",
      authMiddleware,
      createUnblockHandler(moderationDeps),
    );
    app.get(
      "/wayfinder/moderation/stats",
      authMiddleware,
      createModerationStatsHandler(moderationDeps),
    );
    app.post(
      "/wayfinder/moderation/reload",
      authMiddleware,
      createReloadHandler(moderationDeps),
    );

    logger.info("Content moderation API endpoints registered");
  }

  // GraphQL proxy handler
  app.all("/graphql", async (c) => {
    if (!config.server.graphqlProxyUrl) {
      return c.json({ error: "GraphQL proxy not configured" }, 404);
    }

    try {
      // Read request body with size limit (1MB max for GraphQL queries)
      let body: string | undefined;
      if (c.req.method !== "GET") {
        body = await c.req.text();
        if (body.length > 1024 * 1024) {
          return c.json({ error: "Request body too large" }, 413);
        }
      }

      // Proxy the request to configured URL with timeout and no redirects
      const response = await fetch(config.server.graphqlProxyUrl, {
        method: c.req.method,
        headers: {
          "Content-Type": c.req.header("content-type") || "application/json",
          Accept: c.req.header("accept") || "application/json",
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(config.http.requestTimeoutMs),
      });

      // Return proxied response with upstream header
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type":
            response.headers.get("content-type") || "application/json",
          "x-wayfinder-graphql-upstream": config.server.graphqlProxyUrl,
        },
      });
    } catch (error) {
      logger.error("GraphQL proxy error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json({ error: "GraphQL proxy request failed" }, 502);
    }
  });

  // Main request handler
  app.all("*", async (c) => {
    const requestInfo = c.get("requestInfo");
    const routerMode = c.get("routerMode");

    // Handle blocked requests
    if (requestInfo.type === "blocked") {
      // Content moderation blocking (403 Forbidden)
      if (requestInfo.reason === "content_moderated") {
        logger.info("Request blocked by content moderation", {
          reason: requestInfo.reason,
          path: requestInfo.path,
          blockedArnsName: requestInfo.blockedArnsName,
          blockedTxId: requestInfo.blockedTxId,
        });
        return c.json(
          {
            error: "Forbidden",
            message: "This content is not available",
            code: "CONTENT_BLOCKED",
          },
          403,
        );
      }

      // Restriction mode blocking (404 Not Found)
      logger.debug("Request blocked by restriction mode", {
        reason: requestInfo.reason,
        path: requestInfo.path,
      });
      return c.json(
        {
          error: "Not Found",
          message:
            "This router is configured to serve root domain content only.",
        },
        404,
      );
    }

    // Handle reserved paths
    if (requestInfo.type === "reserved") {
      // Wayfinder info page - available at /wayfinder/info or /wayfinder
      if (
        requestInfo.path === "/wayfinder/info" ||
        requestInfo.path === "/wayfinder"
      ) {
        return c.json({
          name: "Wayfinder Router",
          version: ROUTER_VERSION,
          description: "Lightweight proxy router for ar.io network gateways",
          endpoints: {
            arns: config.server.restrictToRootHost
              ? null
              : "https://{arnsName}." + config.server.baseDomain,
            txid: config.server.restrictToRootHost
              ? null
              : "https://" + config.server.baseDomain + "/{txId}",
            health: "/wayfinder/health",
            ready: "/wayfinder/ready",
            metrics: "/wayfinder/metrics",
            stats: "/wayfinder/stats/gateways",
            info: "/wayfinder/info",
          },
          mode: config.mode.default,
          verification: {
            enabled: config.verification.enabled,
          },
          rootHostContent: config.server.rootHostContent || null,
          restrictToRootHost: config.server.restrictToRootHost,
        });
      }

      // Root path without root host content configured - show info page
      if (
        (requestInfo.path === "/" || requestInfo.path === "") &&
        !config.server.rootHostContent
      ) {
        return c.json({
          name: "Wayfinder Router",
          version: ROUTER_VERSION,
          description: "Lightweight proxy router for ar.io network gateways",
          endpoints: {
            arns: config.server.restrictToRootHost
              ? null
              : "https://{arnsName}." + config.server.baseDomain,
            txid: config.server.restrictToRootHost
              ? null
              : "https://" + config.server.baseDomain + "/{txId}",
            health: "/wayfinder/health",
            ready: "/wayfinder/ready",
            metrics: "/wayfinder/metrics",
            stats: "/wayfinder/stats/gateways",
            info: "/wayfinder/info",
          },
          mode: config.mode.default,
          verification: {
            enabled: config.verification.enabled,
          },
          restrictToRootHost: config.server.restrictToRootHost,
        });
      }

      return c.json({ error: "Not Found", path: requestInfo.path }, 404);
    }

    // Handle Arweave API requests
    if (requestInfo.type === "arweave-api") {
      if (!arweaveApiFetcher || !arweaveNodeSelector) {
        return c.json(
          {
            error: "Arweave API proxy not configured",
            message:
              "Set ARWEAVE_API_ENABLED=true and configure ARWEAVE_READ_NODES",
          },
          404,
        );
      }

      try {
        const arweaveApiDeps = {
          fetcher: arweaveApiFetcher,
          nodeSelector: arweaveNodeSelector,
          config,
          logger,
          telemetryService,
        };

        if (routerMode === "route") {
          const handler = createArweaveApiRouteHandler(arweaveApiDeps);
          return await handler(c);
        } else {
          const handler = createArweaveApiProxyHandler(arweaveApiDeps);
          return await handler(c);
        }
      } catch (error) {
        return createErrorResponse(
          c,
          error instanceof Error ? error : new Error(String(error)),
          logger,
        );
      }
    }

    // Check content moderation blocklist for ArNS and txId requests
    if (blocklistService && config.moderation.enabled) {
      if (requestInfo.type === "arns") {
        if (blocklistService.isArnsBlocked(requestInfo.arnsName)) {
          logger.info("Request blocked by content moderation (ArNS)", {
            arnsName: requestInfo.arnsName,
            path: requestInfo.path,
          });
          return c.json(
            {
              error: "Forbidden",
              message: "This content is not available",
              code: "CONTENT_BLOCKED",
            },
            403,
          );
        }
      } else if (requestInfo.type === "txid") {
        if (blocklistService.isTxIdBlocked(requestInfo.txId)) {
          logger.info("Request blocked by content moderation (txId)", {
            txId: requestInfo.txId,
            path: requestInfo.path,
          });
          return c.json(
            {
              error: "Forbidden",
              message: "This content is not available",
              code: "CONTENT_BLOCKED",
            },
            403,
          );
        }
      }
    }

    // Route to appropriate handler based on mode
    try {
      if (routerMode === "route") {
        const routeHandler = createRouteHandler({
          arnsResolver,
          gatewaySelector,
          config,
          logger,
          telemetryService,
        });
        return await routeHandler(c);
      } else {
        const proxyHandler = createProxyHandler({
          arnsResolver,
          contentFetcher,
          verifier,
          manifestResolver,
          config,
          logger,
          telemetryService,
          contentCache,
          gatewaySelector,
          temperatureCache: wayfinderServices.temperatureCache ?? undefined,
        });
        return await proxyHandler(c);
      }
    } catch (error) {
      return createErrorResponse(
        c,
        error instanceof Error ? error : new Error(String(error)),
        logger,
      );
    }
  });

  // Global error handler
  app.onError((err, c) => {
    return createErrorResponse(c, err, logger);
  });

  logger.info("Server created", {
    baseDomain: config.server.baseDomain,
    mode: config.mode.default,
    verificationEnabled: config.verification.enabled,
    routingStrategy: config.routing.strategy,
    rateLimitEnabled: config.rateLimit.enabled,
  });

  return { app, services, startTime };
}
