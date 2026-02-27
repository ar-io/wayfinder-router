import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, validateConfig } from "./config.js";
import type { RouterConfig } from "./types/index.js";

/**
 * Create a minimal valid config for testing validation.
 * Override specific fields in individual tests.
 */
function createValidConfig(overrides?: Partial<RouterConfig>): RouterConfig {
  const base: RouterConfig = {
    server: {
      port: 3000,
      host: "0.0.0.0",
      baseDomain: "localhost",
      rootHostContent: "",
      restrictToRootHost: false,
      graphqlProxyUrl: "",
    },
    mode: { default: "proxy", allowOverride: true },
    verification: {
      enabled: true,
      gatewaySource: "top-staked",
      gatewayCount: 3,
      staticGateways: [
        new URL("https://turbo-gateway.com"),
        new URL("https://ardrive.net"),
      ],
      consensusThreshold: 2,
      retryAttempts: 3,
    },
    routing: {
      strategy: "fastest",
      gatewaySource: "network",
      trustedPeerGateway: new URL("https://turbo-gateway.com"),
      staticGateways: [new URL("https://turbo-gateway.com")],
      trustedArioGateways: [],
      retryAttempts: 3,
      retryDelayMs: 100,
      temperatureWindowMs: 300_000,
      temperatureMaxSamples: 100,
    },
    networkGateways: {
      refreshIntervalMs: 86_400_000,
      minGateways: 3,
      fallbackGateways: [new URL("https://turbo-gateway.com")],
    },
    resilience: {
      gatewayHealthTtlMs: 300_000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 60_000,
      gatewayHealthMaxEntries: 1000,
      streamTimeoutMs: 120_000,
    },
    cache: {
      arnsTtlMs: 300_000,
      contentEnabled: true,
      contentMaxSizeBytes: 50 * 1024 * 1024 * 1024,
      contentMaxItemSizeBytes: 2 * 1024 * 1024 * 1024,
      contentPath: "",
    },
    logging: { level: "info" },
    telemetry: {
      enabled: true,
      routerId: "test-router",
      sampling: {
        successfulRequests: 0.1,
        errors: 1.0,
        latencyMeasurements: 0.1,
      },
      storage: {
        type: "sqlite",
        path: "./data/telemetry.db",
        retentionDays: 30,
      },
      export: {
        enabled: false,
        intervalHours: 24,
        path: "./data/telemetry-export.json",
      },
    },
    rateLimit: { enabled: false, windowMs: 60_000, maxRequests: 1000 },
    ping: {
      enabled: true,
      intervalHours: 4,
      gatewayCount: 50,
      timeoutMs: 5000,
      concurrency: 10,
    },
    errorHandling: {
      exitOnUnhandledRejection: true,
      exitOnUncaughtException: true,
      exitGracePeriodMs: 3000,
    },
    shutdown: { drainTimeoutMs: 15_000, shutdownTimeoutMs: 30_000 },
    http: {
      connectionsPerHost: 10,
      connectTimeoutMs: 30_000,
      requestTimeoutMs: 30_000,
      keepAliveTimeoutMs: 60_000,
    },
    arweaveApi: {
      enabled: false,
      readNodes: [],
      writeNodes: [],
      cache: {
        enabled: true,
        immutableTtlMs: 86_400_000,
        dynamicTtlMs: 30_000,
        maxEntries: 10_000,
        maxSizeBytes: 100 * 1024 * 1024,
      },
      retryAttempts: 3,
      retryDelayMs: 100,
      timeoutMs: 30_000,
    },
    moderation: {
      enabled: false,
      blocklistPath: "./data/blocklist.json",
      adminToken: "",
    },
    admin: {
      enabled: true,
      port: 3001,
      host: "127.0.0.1",
      token: "",
      openBrowser: true,
    },
  };
  return { ...base, ...overrides } as RouterConfig;
}

describe("validateConfig", () => {
  describe("verification validation", () => {
    it("accepts valid config", () => {
      expect(() => validateConfig(createValidConfig())).not.toThrow();
    });

    it("rejects invalid verification gateway source", () => {
      const config = createValidConfig();
      (config.verification as any).gatewaySource = "invalid";
      expect(() => validateConfig(config)).toThrow(
        "Invalid VERIFICATION_GATEWAY_SOURCE",
      );
    });

    it("rejects consensus threshold below 2", () => {
      const config = createValidConfig();
      config.verification.consensusThreshold = 1;
      expect(() => validateConfig(config)).toThrow(
        "ARNS_CONSENSUS_THRESHOLD must be at least 2",
      );
    });

    it("rejects consensus threshold exceeding gateway count", () => {
      const config = createValidConfig();
      config.verification.consensusThreshold = 10;
      config.verification.gatewayCount = 3;
      expect(() => validateConfig(config)).toThrow("ARNS_CONSENSUS_THRESHOLD");
    });

    it("rejects verification retry attempts out of range", () => {
      const config = createValidConfig();
      config.verification.retryAttempts = 0;
      expect(() => validateConfig(config)).toThrow(
        "VERIFICATION_RETRY_ATTEMPTS must be between 1 and 10",
      );
    });
  });

  describe("routing validation", () => {
    it("rejects invalid routing strategy", () => {
      const config = createValidConfig();
      (config.routing as any).strategy = "invalid";
      expect(() => validateConfig(config)).toThrow("Invalid ROUTING_STRATEGY");
    });

    it("rejects invalid routing gateway source", () => {
      const config = createValidConfig();
      (config.routing as any).gatewaySource = "invalid";
      expect(() => validateConfig(config)).toThrow(
        "Invalid ROUTING_GATEWAY_SOURCE",
      );
    });

    it("rejects static source with no gateways", () => {
      const config = createValidConfig();
      config.routing.gatewaySource = "static";
      config.routing.staticGateways = [];
      expect(() => validateConfig(config)).toThrow(
        "no ROUTING_STATIC_GATEWAYS configured",
      );
    });

    it("rejects trusted-ario source with no gateways", () => {
      const config = createValidConfig();
      config.routing.gatewaySource = "trusted-ario";
      config.routing.trustedArioGateways = [];
      expect(() => validateConfig(config)).toThrow(
        "no TRUSTED_ARIO_GATEWAYS configured",
      );
    });
  });

  describe("network gateway validation", () => {
    it("rejects refresh interval below 1 minute", () => {
      const config = createValidConfig();
      config.networkGateways.refreshIntervalMs = 30_000;
      expect(() => validateConfig(config)).toThrow(
        "NETWORK_GATEWAY_REFRESH_MS must be at least 60000",
      );
    });

    it("rejects empty fallback gateways with network source", () => {
      const config = createValidConfig();
      config.networkGateways.fallbackGateways = [];
      expect(() => validateConfig(config)).toThrow(
        "no NETWORK_FALLBACK_GATEWAYS configured",
      );
    });
  });

  describe("shutdown validation", () => {
    it("rejects shutdown timeout <= drain timeout", () => {
      const config = createValidConfig();
      config.shutdown.drainTimeoutMs = 30_000;
      config.shutdown.shutdownTimeoutMs = 30_000;
      expect(() => validateConfig(config)).toThrow("SHUTDOWN_TIMEOUT_MS");
    });
  });

  describe("admin UI validation", () => {
    it("rejects non-localhost admin without token", () => {
      const config = createValidConfig();
      config.admin.host = "0.0.0.0";
      config.admin.token = "";
      expect(() => validateConfig(config)).toThrow("ADMIN_TOKEN is not set");
    });

    it("accepts non-localhost admin with token", () => {
      const config = createValidConfig();
      config.admin.host = "0.0.0.0";
      config.admin.token = "my-secret-token-12345";
      expect(() => validateConfig(config)).not.toThrow();
    });

    it("rejects admin port same as public port", () => {
      const config = createValidConfig();
      config.admin.port = 3000;
      config.server.port = 3000;
      expect(() => validateConfig(config)).toThrow("ADMIN_PORT");
    });
  });

  describe("moderation validation", () => {
    it("rejects moderation enabled without token", () => {
      const config = createValidConfig();
      config.moderation.enabled = true;
      config.moderation.adminToken = "";
      expect(() => validateConfig(config)).toThrow(
        "MODERATION_ADMIN_TOKEN is not set",
      );
    });
  });

  describe("restrict to root host validation", () => {
    it("rejects restrictToRootHost without rootHostContent", () => {
      const config = createValidConfig();
      config.server.restrictToRootHost = true;
      config.server.rootHostContent = "";
      expect(() => validateConfig(config)).toThrow(
        "RESTRICT_TO_ROOT_HOST is enabled but ROOT_HOST_CONTENT",
      );
    });

    it("accepts restrictToRootHost with rootHostContent", () => {
      const config = createValidConfig();
      config.server.restrictToRootHost = true;
      config.server.rootHostContent = "ardrive";
      expect(() => validateConfig(config)).not.toThrow();
    });
  });

  describe("arweave API validation", () => {
    it("rejects arweave API enabled with no read nodes", () => {
      const config = createValidConfig();
      config.arweaveApi.enabled = true;
      config.arweaveApi.readNodes = [];
      expect(() => validateConfig(config)).toThrow(
        "no ARWEAVE_READ_NODES configured",
      );
    });
  });
});

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads default config without env vars", () => {
    const config = loadConfig();
    expect(config.server.port).toBe(3000);
    expect(config.mode.default).toBe("proxy");
    expect(config.verification.enabled).toBe(true);
    expect(config.routing.strategy).toBe("fastest");
  });

  it("reads PORT from environment", () => {
    process.env.PORT = "8080";
    const config = loadConfig();
    expect(config.server.port).toBe(8080);
  });

  it("reads boolean values", () => {
    process.env.VERIFICATION_ENABLED = "false";
    const config = loadConfig();
    expect(config.verification.enabled).toBe(false);
  });

  it("falls back ROOT_HOST_CONTENT to ARNS_ROOT_HOST", () => {
    process.env.ARNS_ROOT_HOST = "myapp";
    const config = loadConfig();
    expect(config.server.rootHostContent).toBe("myapp");
  });

  it("prefers ROOT_HOST_CONTENT over ARNS_ROOT_HOST", () => {
    process.env.ROOT_HOST_CONTENT = "newapp";
    process.env.ARNS_ROOT_HOST = "oldapp";
    const config = loadConfig();
    expect(config.server.rootHostContent).toBe("newapp");
  });
});

describe("parseUrls scheme validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("rejects file:// URLs in gateway config", () => {
    process.env.ROUTING_GATEWAY_SOURCE = "static";
    process.env.ROUTING_STATIC_GATEWAYS = "file:///etc/passwd";
    expect(() => loadConfig()).toThrow("Invalid URL scheme");
  });

  it("rejects ftp:// URLs in gateway config", () => {
    process.env.VERIFICATION_STATIC_GATEWAYS = "ftp://evil.com";
    expect(() => loadConfig()).toThrow("Invalid URL scheme");
  });

  it("accepts https:// URLs", () => {
    process.env.ROUTING_STATIC_GATEWAYS = "https://ar-io.dev";
    expect(() => loadConfig()).not.toThrow();
  });

  it("accepts http:// URLs", () => {
    process.env.ROUTING_STATIC_GATEWAYS = "http://localhost:3000";
    expect(() => loadConfig()).not.toThrow();
  });
});
