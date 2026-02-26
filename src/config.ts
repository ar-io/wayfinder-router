/**
 * Configuration management for Wayfinder Router
 */

import { resolve } from "node:path";
import type {
  RouterConfig,
  RouterMode,
  RoutingStrategy,
  RoutingGatewaySource,
  VerificationGatewaySource,
} from "./types/index.js";

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvFloat(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  // Use Number() to handle large values that parseInt can't
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvWithFallback(
  primaryKey: string,
  fallbackKey: string,
  defaultValue: string,
): string {
  if (process.env[primaryKey] !== undefined) {
    return process.env[primaryKey] ?? defaultValue;
  }
  if (process.env[fallbackKey] !== undefined) {
    return process.env[fallbackKey] ?? defaultValue;
  }
  return defaultValue;
}

function parseUrls(value: string): URL[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const url = new URL(s);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(
          `Invalid URL scheme "${url.protocol}" in "${s}". Only http: and https: are allowed.`,
        );
      }
      return url;
    });
}

export function loadConfig(): RouterConfig {
  // Verification gateways (static, used when VERIFICATION_GATEWAY_SOURCE=static)
  const verificationStaticGatewaysStr = getEnv(
    "VERIFICATION_STATIC_GATEWAYS",
    "https://turbo-gateway.com,https://ardrive.net,https://permagate.io",
  );

  // Routing gateways (static, used when ROUTING_GATEWAY_SOURCE=static)
  const routingStaticGatewaysStr = getEnv(
    "ROUTING_STATIC_GATEWAYS",
    "https://turbo-gateway.com,https://ardrive.net,https://permagate.io",
  );

  // Trusted peer gateway (used when ROUTING_GATEWAY_SOURCE=trusted-peers)
  const trustedPeerGatewayStr = getEnv(
    "TRUSTED_PEER_GATEWAY",
    "https://turbo-gateway.com",
  );

  // Fallback gateways (used when network fetch fails)
  const fallbackGatewaysStr = getEnv(
    "NETWORK_FALLBACK_GATEWAYS",
    "https://turbo-gateway.com,https://ardrive.net,https://permagate.io",
  );

  // Trusted ar.io gateways (used when ROUTING_GATEWAY_SOURCE=trusted-ario)
  // When set, bypasses routing strategies and uses these gateways directly
  const trustedArioGatewaysStr = getEnv("TRUSTED_ARIO_GATEWAYS", "");

  // Arweave nodes for GET requests (chain state queries)
  const arweaveReadNodesStr = getEnv(
    "ARWEAVE_READ_NODES",
    "http://tip-1.arweave.xyz:1984,http://tip-2.arweave.xyz:1984,http://tip-3.arweave.xyz:1984,http://tip-4.arweave.xyz:1984,http://tip-5.arweave.xyz:1984",
  );

  // Arweave nodes for POST requests (tx submission) - falls back to read nodes if empty
  const arweaveWriteNodesStr = getEnv("ARWEAVE_WRITE_NODES", "");

  return {
    server: {
      port: getEnvInt("PORT", 3000),
      host: getEnv("HOST", "0.0.0.0"),
      baseDomain: getEnv("BASE_DOMAIN", "localhost"),
      // Content to serve at root domain - can be ArNS name OR txId (auto-detected)
      // Backwards compatible: checks ROOT_HOST_CONTENT first, then ARNS_ROOT_HOST
      rootHostContent: getEnvWithFallback(
        "ROOT_HOST_CONTENT",
        "ARNS_ROOT_HOST",
        "",
      ),
      // When true, restricts router to ONLY serve root host content
      // Blocks: subdomain requests, txId path requests
      // Allows: root domain paths, /wayfinder/* management endpoints
      restrictToRootHost: getEnvBool("RESTRICT_TO_ROOT_HOST", false),
      // GraphQL proxy URL - when set, /graphql proxies to this endpoint
      graphqlProxyUrl: getEnv("GRAPHQL_PROXY_URL", ""),
    },

    mode: {
      default: getEnv("DEFAULT_MODE", "proxy") as RouterMode,
      allowOverride: getEnvBool("ALLOW_MODE_OVERRIDE", true),
    },

    // Verification settings - determines how we verify data integrity
    verification: {
      enabled: getEnvBool("VERIFICATION_ENABLED", true),
      // Where to get trusted gateways for hash verification
      gatewaySource: getEnv(
        "VERIFICATION_GATEWAY_SOURCE",
        "top-staked",
      ) as VerificationGatewaySource,
      // Number of top staked gateways to use (when source is 'top-staked')
      gatewayCount: getEnvInt("VERIFICATION_GATEWAY_COUNT", 3),
      // Static trusted gateways (fallback or when source is 'static')
      staticGateways: parseUrls(verificationStaticGatewaysStr),
      // ArNS consensus threshold
      consensusThreshold: getEnvInt("ARNS_CONSENSUS_THRESHOLD", 2),
      // Number of different gateways to try before giving up on verification
      retryAttempts: getEnvInt("VERIFICATION_RETRY_ATTEMPTS", 3),
    },

    // Routing settings - determines where we fetch data from
    routing: {
      // How to select a gateway from the pool
      strategy: getEnv("ROUTING_STRATEGY", "fastest") as RoutingStrategy,
      // Where to get the list of gateways for routing
      gatewaySource: getEnv(
        "ROUTING_GATEWAY_SOURCE",
        "network",
      ) as RoutingGatewaySource,
      // Gateway to query for trusted peers (when source is 'trusted-peers')
      trustedPeerGateway: new URL(trustedPeerGatewayStr),
      // Static gateways (when source is 'static')
      staticGateways: parseUrls(routingStaticGatewaysStr),
      // Trusted ar.io gateways (when source is 'trusted-ario')
      trustedArioGateways: parseUrls(trustedArioGatewaysStr),
      // Retry settings
      retryAttempts: getEnvInt("RETRY_ATTEMPTS", 3),
      retryDelayMs: getEnvInt("RETRY_DELAY_MS", 100),
      // Temperature strategy settings
      temperatureWindowMs: getEnvInt("TEMPERATURE_WINDOW_MS", 5 * 60 * 1000), // 5 minutes
      temperatureMaxSamples: getEnvInt("TEMPERATURE_MAX_SAMPLES", 100),
    },

    // Network gateway settings (shared by routing and verification when using network sources)
    networkGateways: {
      // How often to refresh gateway lists from the network
      refreshIntervalMs: getEnvInt(
        "NETWORK_GATEWAY_REFRESH_MS",
        24 * 60 * 60 * 1000,
      ), // 24 hours
      // Minimum gateways required to operate (fail-safe)
      minGateways: getEnvInt("NETWORK_MIN_GATEWAYS", 3),
      // Fallback gateways if network fetch fails
      fallbackGateways: parseUrls(fallbackGatewaysStr),
    },

    resilience: {
      gatewayHealthTtlMs: getEnvInt("GATEWAY_HEALTH_TTL_MS", 300_000),
      circuitBreakerThreshold: getEnvInt("CIRCUIT_BREAKER_THRESHOLD", 3),
      circuitBreakerResetMs: getEnvInt("CIRCUIT_BREAKER_RESET_MS", 60_000),
      gatewayHealthMaxEntries: getEnvInt("GATEWAY_HEALTH_MAX_ENTRIES", 1000),
      streamTimeoutMs: getEnvInt("STREAM_TIMEOUT_MS", 120_000), // 2 minutes per chunk
    },

    cache: {
      arnsTtlMs: getEnvInt("ARNS_CACHE_TTL_MS", 300_000),
      contentEnabled: getEnvBool("CONTENT_CACHE_ENABLED", true), // Enable by default
      contentMaxSizeBytes: getEnvNumber(
        "CONTENT_CACHE_MAX_SIZE_BYTES",
        50 * 1024 * 1024 * 1024, // 50GB default
      ),
      contentMaxItemSizeBytes: getEnvNumber(
        "CONTENT_CACHE_MAX_ITEM_SIZE_BYTES",
        2 * 1024 * 1024 * 1024, // 2GB max per item
      ),
      contentPath: getEnv("CONTENT_CACHE_PATH", ""), // Empty = in-memory only
    },

    logging: {
      level: getEnv("LOG_LEVEL", "info"),
    },

    telemetry: {
      enabled: getEnvBool("TELEMETRY_ENABLED", true),
      routerId: getEnv("TELEMETRY_ROUTER_ID", `router-${Date.now()}`),
      sampling: {
        successfulRequests: getEnvFloat("TELEMETRY_SAMPLE_SUCCESS", 0.1),
        errors: getEnvFloat("TELEMETRY_SAMPLE_ERRORS", 1.0),
        latencyMeasurements: getEnvFloat("TELEMETRY_SAMPLE_LATENCY", 0.1),
      },
      storage: {
        type: "sqlite" as const,
        path: resolve(getEnv("TELEMETRY_DB_PATH", "./data/telemetry.db")),
        retentionDays: getEnvInt("TELEMETRY_RETENTION_DAYS", 30),
      },
      export: {
        enabled: getEnvBool("TELEMETRY_EXPORT_ENABLED", false),
        intervalHours: getEnvInt("TELEMETRY_EXPORT_INTERVAL_HOURS", 24),
        path: resolve(
          getEnv("TELEMETRY_EXPORT_PATH", "./data/telemetry-export.json"),
        ),
      },
    },

    rateLimit: {
      enabled: getEnvBool("RATE_LIMIT_ENABLED", false),
      windowMs: getEnvInt("RATE_LIMIT_WINDOW_MS", 60_000), // 1 minute default
      maxRequests: getEnvInt("RATE_LIMIT_MAX_REQUESTS", 1000),
    },

    // Gateway ping settings (for temperature strategy)
    ping: {
      enabled: getEnvBool("PING_ENABLED", true),
      intervalHours: getEnvInt("PING_INTERVAL_HOURS", 4),
      gatewayCount: getEnvInt("PING_GATEWAY_COUNT", 50),
      timeoutMs: getEnvInt("PING_TIMEOUT_MS", 5000),
      concurrency: getEnvInt("PING_CONCURRENCY", 10),
    },

    // Error handling settings
    errorHandling: {
      exitOnUnhandledRejection: getEnvBool("EXIT_ON_UNHANDLED_REJECTION", true),
      exitOnUncaughtException: getEnvBool("EXIT_ON_UNCAUGHT_EXCEPTION", true),
      exitGracePeriodMs: getEnvInt("EXIT_GRACE_PERIOD_MS", 3000),
    },

    // Shutdown settings
    shutdown: {
      drainTimeoutMs: getEnvInt("SHUTDOWN_DRAIN_TIMEOUT_MS", 15_000), // 15 seconds
      shutdownTimeoutMs: getEnvInt("SHUTDOWN_TIMEOUT_MS", 30_000), // 30 seconds
    },

    // HTTP connection pool settings
    http: {
      connectionsPerHost: getEnvInt("HTTP_CONNECTIONS_PER_HOST", 10),
      connectTimeoutMs: getEnvInt("HTTP_CONNECT_TIMEOUT_MS", 30_000),
      requestTimeoutMs: getEnvInt("HTTP_REQUEST_TIMEOUT_MS", 30_000),
      keepAliveTimeoutMs: getEnvInt("HTTP_KEEPALIVE_TIMEOUT_MS", 60_000),
    },

    // Arweave HTTP API proxy settings
    arweaveApi: {
      enabled: getEnvBool("ARWEAVE_API_ENABLED", false),
      // Read nodes for GET requests (chain state, tx info, blocks)
      readNodes: parseUrls(arweaveReadNodesStr),
      // Write nodes for POST requests (tx submission, chunks)
      // Falls back to readNodes if not specified
      writeNodes:
        arweaveWriteNodesStr.trim().length > 0
          ? parseUrls(arweaveWriteNodesStr)
          : parseUrls(arweaveReadNodesStr),
      cache: {
        enabled: getEnvBool("ARWEAVE_API_CACHE_ENABLED", true),
        // 24 hours for immutable data (transactions, blocks)
        immutableTtlMs: getEnvInt(
          "ARWEAVE_API_CACHE_IMMUTABLE_TTL_MS",
          24 * 60 * 60 * 1000,
        ),
        // 30 seconds for dynamic data (info, balances, status)
        dynamicTtlMs: getEnvInt("ARWEAVE_API_CACHE_DYNAMIC_TTL_MS", 30_000),
        maxEntries: getEnvInt("ARWEAVE_API_CACHE_MAX_ENTRIES", 10_000),
        maxSizeBytes: getEnvNumber(
          "ARWEAVE_API_CACHE_MAX_SIZE_BYTES",
          100 * 1024 * 1024, // 100MB default
        ),
      },
      retryAttempts: getEnvInt("ARWEAVE_API_RETRY_ATTEMPTS", 3),
      retryDelayMs: getEnvInt("ARWEAVE_API_RETRY_DELAY_MS", 100),
      timeoutMs: getEnvInt("ARWEAVE_API_TIMEOUT_MS", 30_000),
    },

    // Content moderation settings
    moderation: {
      enabled: getEnvBool("MODERATION_ENABLED", false),
      blocklistPath: getEnv(
        "MODERATION_BLOCKLIST_PATH",
        "./data/blocklist.json",
      ),
      adminToken: getEnv("MODERATION_ADMIN_TOKEN", ""),
    },

    // Admin UI settings (runs on separate port, localhost-only by default)
    admin: {
      enabled: getEnvBool("ADMIN_UI_ENABLED", true),
      port: getEnvInt("ADMIN_PORT", 3001),
      host: getEnv("ADMIN_HOST", "127.0.0.1"),
      token: getEnv("ADMIN_TOKEN", ""),
    },
  };
}

export function validateConfig(config: RouterConfig): void {
  // === VERIFICATION VALIDATION ===

  // Validate verification gateway source
  const validVerificationSources: VerificationGatewaySource[] = [
    "top-staked",
    "static",
  ];
  if (!validVerificationSources.includes(config.verification.gatewaySource)) {
    throw new Error(
      `Invalid VERIFICATION_GATEWAY_SOURCE: ${config.verification.gatewaySource}. Must be one of: ${validVerificationSources.join(", ")}`,
    );
  }

  // Validate static gateways required when verification source is 'static'
  if (
    config.verification.enabled &&
    config.verification.gatewaySource === "static" &&
    config.verification.staticGateways.length === 0
  ) {
    throw new Error(
      "VERIFICATION_ENABLED is true with VERIFICATION_GATEWAY_SOURCE=static but no VERIFICATION_STATIC_GATEWAYS configured.",
    );
  }

  // Validate gateway count for top-staked verification
  if (config.verification.gatewaySource === "top-staked") {
    if (
      config.verification.gatewayCount < 1 ||
      config.verification.gatewayCount > 50
    ) {
      throw new Error(
        `VERIFICATION_GATEWAY_COUNT must be between 1 and 50, got ${config.verification.gatewayCount}`,
      );
    }
  }

  // Validate consensus threshold
  // SECURITY: Require at least 2 gateways for consensus to prevent single-gateway attacks
  if (
    config.verification.enabled &&
    config.verification.consensusThreshold < 2
  ) {
    throw new Error(
      `ARNS_CONSENSUS_THRESHOLD must be at least 2 for security (got ${config.verification.consensusThreshold}). ` +
        "A single gateway could otherwise dictate ArNS resolutions.",
    );
  }

  // Validate verification retry attempts
  if (
    config.verification.retryAttempts < 1 ||
    config.verification.retryAttempts > 10
  ) {
    throw new Error(
      `VERIFICATION_RETRY_ATTEMPTS must be between 1 and 10, got ${config.verification.retryAttempts}`,
    );
  }

  // Validate consensus threshold against gateway count
  if (config.verification.gatewaySource === "top-staked") {
    if (
      config.verification.consensusThreshold > config.verification.gatewayCount
    ) {
      throw new Error(
        `ARNS_CONSENSUS_THRESHOLD (${config.verification.consensusThreshold}) cannot be greater than VERIFICATION_GATEWAY_COUNT (${config.verification.gatewayCount})`,
      );
    }
  } else if (config.verification.gatewaySource === "static") {
    if (
      config.verification.consensusThreshold >
      config.verification.staticGateways.length
    ) {
      throw new Error(
        `ARNS_CONSENSUS_THRESHOLD (${config.verification.consensusThreshold}) cannot be greater than number of VERIFICATION_STATIC_GATEWAYS (${config.verification.staticGateways.length})`,
      );
    }
  }

  // === ROUTING VALIDATION ===

  // Validate routing strategy
  const validStrategies = ["fastest", "random", "round-robin", "temperature"];
  if (!validStrategies.includes(config.routing.strategy)) {
    throw new Error(
      `Invalid ROUTING_STRATEGY: ${config.routing.strategy}. Must be one of: ${validStrategies.join(", ")}`,
    );
  }

  // Validate routing gateway source
  const validRoutingSources: RoutingGatewaySource[] = [
    "network",
    "trusted-peers",
    "static",
    "trusted-ario",
  ];
  if (!validRoutingSources.includes(config.routing.gatewaySource)) {
    throw new Error(
      `Invalid ROUTING_GATEWAY_SOURCE: ${config.routing.gatewaySource}. Must be one of: ${validRoutingSources.join(", ")}`,
    );
  }

  // Validate static gateways required when routing source is 'static'
  if (
    config.routing.gatewaySource === "static" &&
    config.routing.staticGateways.length === 0
  ) {
    throw new Error(
      "ROUTING_GATEWAY_SOURCE is static but no ROUTING_STATIC_GATEWAYS configured",
    );
  }

  // Validate trusted ar.io gateways required when routing source is 'trusted-ario'
  if (
    config.routing.gatewaySource === "trusted-ario" &&
    config.routing.trustedArioGateways.length === 0
  ) {
    throw new Error(
      "ROUTING_GATEWAY_SOURCE is trusted-ario but no TRUSTED_ARIO_GATEWAYS configured",
    );
  }

  // === NETWORK GATEWAY VALIDATION ===

  // Validate network settings when using network sources
  const usesNetwork =
    config.routing.gatewaySource === "network" ||
    config.verification.gatewaySource === "top-staked";

  if (usesNetwork) {
    if (config.networkGateways.minGateways < 1) {
      throw new Error(
        `NETWORK_MIN_GATEWAYS must be at least 1, got ${config.networkGateways.minGateways}`,
      );
    }

    if (config.networkGateways.refreshIntervalMs < 60_000) {
      throw new Error(
        `NETWORK_GATEWAY_REFRESH_MS must be at least 60000 (1 minute), got ${config.networkGateways.refreshIntervalMs}`,
      );
    }

    if (config.networkGateways.fallbackGateways.length === 0) {
      throw new Error(
        "Using network gateway source but no NETWORK_FALLBACK_GATEWAYS configured for failover",
      );
    }
  }

  // === RESILIENCE VALIDATION ===

  if (config.resilience.gatewayHealthMaxEntries < 10) {
    throw new Error(
      `GATEWAY_HEALTH_MAX_ENTRIES must be at least 10, got ${config.resilience.gatewayHealthMaxEntries}`,
    );
  }

  if (
    config.resilience.streamTimeoutMs < 10_000 ||
    config.resilience.streamTimeoutMs > 600_000
  ) {
    throw new Error(
      `STREAM_TIMEOUT_MS must be between 10000 (10s) and 600000 (10 min), got ${config.resilience.streamTimeoutMs}`,
    );
  }

  // === PING VALIDATION ===

  if (config.ping.enabled) {
    if (config.ping.intervalHours < 1) {
      throw new Error(
        `PING_INTERVAL_HOURS must be at least 1, got ${config.ping.intervalHours}`,
      );
    }

    if (config.ping.gatewayCount < 1 || config.ping.gatewayCount > 200) {
      throw new Error(
        `PING_GATEWAY_COUNT must be between 1 and 200, got ${config.ping.gatewayCount}`,
      );
    }

    if (config.ping.timeoutMs < 1000 || config.ping.timeoutMs > 30000) {
      throw new Error(
        `PING_TIMEOUT_MS must be between 1000 and 30000, got ${config.ping.timeoutMs}`,
      );
    }

    if (config.ping.concurrency < 1 || config.ping.concurrency > 50) {
      throw new Error(
        `PING_CONCURRENCY must be between 1 and 50, got ${config.ping.concurrency}`,
      );
    }
  }

  // === ERROR HANDLING VALIDATION ===

  if (config.errorHandling.exitGracePeriodMs < 0) {
    throw new Error(
      `EXIT_GRACE_PERIOD_MS must be >= 0, got ${config.errorHandling.exitGracePeriodMs}`,
    );
  }

  if (config.errorHandling.exitGracePeriodMs > 30000) {
    throw new Error(
      `EXIT_GRACE_PERIOD_MS must be <= 30000 (30 seconds), got ${config.errorHandling.exitGracePeriodMs}`,
    );
  }

  // === SHUTDOWN VALIDATION ===

  if (
    config.shutdown.drainTimeoutMs < 1000 ||
    config.shutdown.drainTimeoutMs > 120_000
  ) {
    throw new Error(
      `SHUTDOWN_DRAIN_TIMEOUT_MS must be between 1000 (1s) and 120000 (2 min), got ${config.shutdown.drainTimeoutMs}`,
    );
  }

  if (
    config.shutdown.shutdownTimeoutMs < 5000 ||
    config.shutdown.shutdownTimeoutMs > 300_000
  ) {
    throw new Error(
      `SHUTDOWN_TIMEOUT_MS must be between 5000 (5s) and 300000 (5 min), got ${config.shutdown.shutdownTimeoutMs}`,
    );
  }

  if (config.shutdown.shutdownTimeoutMs <= config.shutdown.drainTimeoutMs) {
    throw new Error(
      `SHUTDOWN_TIMEOUT_MS (${config.shutdown.shutdownTimeoutMs}) must be greater than SHUTDOWN_DRAIN_TIMEOUT_MS (${config.shutdown.drainTimeoutMs})`,
    );
  }

  // === HTTP POOL VALIDATION ===

  if (
    config.http.connectionsPerHost < 1 ||
    config.http.connectionsPerHost > 100
  ) {
    throw new Error(
      `HTTP_CONNECTIONS_PER_HOST must be between 1 and 100, got ${config.http.connectionsPerHost}`,
    );
  }

  if (
    config.http.connectTimeoutMs < 1000 ||
    config.http.connectTimeoutMs > 120_000
  ) {
    throw new Error(
      `HTTP_CONNECT_TIMEOUT_MS must be between 1000 (1s) and 120000 (2 min), got ${config.http.connectTimeoutMs}`,
    );
  }

  if (
    config.http.requestTimeoutMs < 5000 ||
    config.http.requestTimeoutMs > 300_000
  ) {
    throw new Error(
      `HTTP_REQUEST_TIMEOUT_MS must be between 5000 (5s) and 300000 (5 min), got ${config.http.requestTimeoutMs}`,
    );
  }

  if (
    config.http.keepAliveTimeoutMs < 10_000 ||
    config.http.keepAliveTimeoutMs > 300_000
  ) {
    throw new Error(
      `HTTP_KEEPALIVE_TIMEOUT_MS must be between 10000 (10s) and 300000 (5 min), got ${config.http.keepAliveTimeoutMs}`,
    );
  }

  // === ARWEAVE API VALIDATION ===

  if (config.arweaveApi.enabled) {
    if (config.arweaveApi.readNodes.length === 0) {
      throw new Error(
        "ARWEAVE_API_ENABLED is true but no ARWEAVE_READ_NODES configured",
      );
    }

    if (
      config.arweaveApi.retryAttempts < 1 ||
      config.arweaveApi.retryAttempts > 10
    ) {
      throw new Error(
        `ARWEAVE_API_RETRY_ATTEMPTS must be between 1 and 10, got ${config.arweaveApi.retryAttempts}`,
      );
    }

    if (
      config.arweaveApi.timeoutMs < 1000 ||
      config.arweaveApi.timeoutMs > 120_000
    ) {
      throw new Error(
        `ARWEAVE_API_TIMEOUT_MS must be between 1000 (1s) and 120000 (2 min), got ${config.arweaveApi.timeoutMs}`,
      );
    }

    if (config.arweaveApi.cache.enabled) {
      if (config.arweaveApi.cache.maxEntries < 100) {
        throw new Error(
          `ARWEAVE_API_CACHE_MAX_ENTRIES must be at least 100, got ${config.arweaveApi.cache.maxEntries}`,
        );
      }

      if (config.arweaveApi.cache.dynamicTtlMs < 1000) {
        throw new Error(
          `ARWEAVE_API_CACHE_DYNAMIC_TTL_MS must be at least 1000 (1s), got ${config.arweaveApi.cache.dynamicTtlMs}`,
        );
      }

      if (config.arweaveApi.cache.immutableTtlMs < 60_000) {
        throw new Error(
          `ARWEAVE_API_CACHE_IMMUTABLE_TTL_MS must be at least 60000 (1 min), got ${config.arweaveApi.cache.immutableTtlMs}`,
        );
      }
    }
  }

  // === ROOT HOST RESTRICTION VALIDATION ===

  // RESTRICT_TO_ROOT_HOST requires ROOT_HOST_CONTENT to be set
  if (config.server.restrictToRootHost && !config.server.rootHostContent) {
    throw new Error(
      "RESTRICT_TO_ROOT_HOST is enabled but ROOT_HOST_CONTENT (or ARNS_ROOT_HOST) is not set. " +
        "You must configure root host content when using restricted mode.",
    );
  }

  // Warn if both old and new env var names are set with different values
  const rootHostNew = process.env["ROOT_HOST_CONTENT"];
  const rootHostOld = process.env["ARNS_ROOT_HOST"];
  if (rootHostNew && rootHostOld && rootHostNew !== rootHostOld) {
    console.warn(
      `Warning: Both ROOT_HOST_CONTENT ("${rootHostNew}") and ARNS_ROOT_HOST ("${rootHostOld}") are set. ` +
        `Using ROOT_HOST_CONTENT value.`,
    );
  }

  // === MODERATION VALIDATION ===

  if (config.moderation.enabled) {
    if (!config.moderation.adminToken) {
      throw new Error(
        "MODERATION_ENABLED is true but MODERATION_ADMIN_TOKEN is not set. " +
          "An admin token is required for the moderation API.",
      );
    }

    if (config.moderation.adminToken.length < 16) {
      console.warn(
        "Warning: MODERATION_ADMIN_TOKEN is very short. " +
          "Consider using a longer token for better security.",
      );
    }
  }

  // === GRAPHQL PROXY VALIDATION ===

  if (config.server.graphqlProxyUrl) {
    try {
      const gqlUrl = new URL(config.server.graphqlProxyUrl);
      if (gqlUrl.protocol !== "https:" && gqlUrl.protocol !== "http:") {
        throw new Error(
          `GRAPHQL_PROXY_URL must use http or https scheme, got: ${gqlUrl.protocol}`,
        );
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(
          `GRAPHQL_PROXY_URL is not a valid URL: ${config.server.graphqlProxyUrl}`,
        );
      }
      throw e;
    }
  }

  // === ADMIN UI VALIDATION ===

  if (config.admin.enabled) {
    const isLocalhost =
      config.admin.host === "127.0.0.1" || config.admin.host === "::1";

    // Require ADMIN_TOKEN when binding to non-localhost (exposed to network)
    if (!isLocalhost && !config.admin.token) {
      throw new Error(
        "ADMIN_HOST is set to a non-localhost address but ADMIN_TOKEN is not set. " +
          "An admin token is required when the admin UI is accessible over the network.",
      );
    }

    // Warn if admin port conflicts with public port
    if (config.admin.port === config.server.port) {
      throw new Error(
        `ADMIN_PORT (${config.admin.port}) must be different from PORT (${config.server.port}). ` +
          "The admin UI runs on a separate port for security.",
      );
    }
  }
}
