/**
 * Wayfinder Router Types
 */

// Request types
export type RequestType =
  | "arns"
  | "txid"
  | "reserved"
  | "blocked"
  | "arweave-api";

export interface ArnsRequestInfo {
  type: "arns";
  arnsName: string;
  path: string;
}

export interface TxIdRequestInfo {
  type: "txid";
  txId: string;
  path: string;
  /** Sandbox subdomain if request came via sandbox URL */
  sandboxSubdomain?: string;
}

export interface ReservedRequestInfo {
  type: "reserved";
  path: string;
}

export interface BlockedRequestInfo {
  type: "blocked";
  reason: "subdomain_restricted" | "txid_path_restricted" | "content_moderated";
  path: string;
  /** For content_moderated: the blocked ArNS name */
  blockedArnsName?: string;
  /** For content_moderated: the blocked txId */
  blockedTxId?: string;
}

// Re-export Arweave API types
export type {
  ArweaveApiEndpoint,
  ArweaveApiCategory,
  ArweaveApiRequestInfo,
} from "./arweave-api.js";
export {
  VALID_TX_FIELDS,
  ENDPOINT_CATEGORIES,
  getEndpointCategory,
  constructArweaveApiPath,
} from "./arweave-api.js";

// Import for union type
import type { ArweaveApiRequestInfo } from "./arweave-api.js";

export type RequestInfo =
  | ArnsRequestInfo
  | TxIdRequestInfo
  | ReservedRequestInfo
  | BlockedRequestInfo
  | ArweaveApiRequestInfo;

// Router modes
export type RouterMode = "proxy" | "route";

// Routing strategies
export type RoutingStrategy =
  | "fastest"
  | "random"
  | "round-robin"
  | "temperature";

// Gateway sources for ROUTING (where to fetch data - trust not required)
// "trusted-ario" uses TRUSTED_ARIO_GATEWAYS directly, bypassing routing strategies
export type RoutingGatewaySource =
  | "network"
  | "trusted-peers"
  | "static"
  | "trusted-ario";

// Gateway sources for VERIFICATION (who to ask for hashes - trust required)
export type VerificationGatewaySource = "top-staked" | "static";

// Configuration
export interface RouterConfig {
  server: {
    port: number;
    host: string;
    baseDomain: string;
    /**
     * Content to serve at root domain. Can be ArNS name OR transaction ID.
     * Auto-detected: 43-char base64url = txId, otherwise = ArNS name.
     * Empty string = show info page at root.
     */
    rootHostContent: string;
    /**
     * When true, restricts router to ONLY serve root host content.
     * Blocks subdomain requests and txId path requests with 404.
     * Management endpoints (/wayfinder/*) still work.
     */
    restrictToRootHost: boolean;
    /**
     * Optional GraphQL proxy URL. When set, /graphql proxies to this endpoint.
     * Empty string = disabled (404 on /graphql).
     */
    graphqlProxyUrl: string;
  };

  mode: {
    default: RouterMode;
    allowOverride: boolean;
  };

  // Verification settings - determines how we verify data integrity
  verification: {
    enabled: boolean;
    // Where to get trusted gateways for hash verification
    gatewaySource: VerificationGatewaySource;
    // Number of top staked gateways to use (when source is 'top-staked')
    gatewayCount: number;
    // Static trusted gateways (fallback or when source is 'static')
    staticGateways: URL[];
    // ArNS consensus threshold
    consensusThreshold: number;
    // Number of different gateways to try before giving up on verification
    retryAttempts: number;
  };

  // Routing settings - determines where we fetch data from
  routing: {
    // How to select a gateway from the pool
    strategy: RoutingStrategy;
    // Where to get the list of gateways for routing
    gatewaySource: RoutingGatewaySource;
    // Gateway to query for trusted peers (when source is 'trusted-peers')
    trustedPeerGateway: URL;
    // Static gateways (when source is 'static')
    staticGateways: URL[];
    // Trusted ar.io gateways (when source is 'trusted-ario')
    // These bypass routing strategies and are used directly for content fetching
    trustedArioGateways: URL[];
    // Retry settings
    retryAttempts: number;
    retryDelayMs: number;
    // Temperature strategy settings
    temperatureWindowMs: number;
    temperatureMaxSamples: number;
  };

  // Network gateway settings (shared by routing and verification when using network sources)
  networkGateways: {
    // How often to refresh gateway lists from the network
    refreshIntervalMs: number;
    // Minimum gateways required to operate (fail-safe)
    minGateways: number;
    // Fallback gateways if network fetch fails
    fallbackGateways: URL[];
  };

  resilience: {
    gatewayHealthTtlMs: number;
    circuitBreakerThreshold: number;
    circuitBreakerResetMs: number;
    /** Maximum entries in gateway health cache (prevents memory leaks) */
    gatewayHealthMaxEntries: number;
    /** Timeout for stream reads (per-chunk, prevents zombie connections) */
    streamTimeoutMs: number;
  };

  cache: {
    arnsTtlMs: number;
    contentEnabled: boolean;
    contentMaxSizeBytes: number;
    contentMaxItemSizeBytes: number;
    contentPath: string; // Empty = in-memory only
  };

  logging: {
    level: string;
  };

  telemetry: {
    enabled: boolean;
    routerId: string;
    sampling: {
      successfulRequests: number;
      errors: number;
      latencyMeasurements: number;
    };
    storage: {
      type: "sqlite";
      path: string;
      retentionDays: number;
    };
    export: {
      enabled: boolean;
      intervalHours: number;
      path?: string;
    };
  };

  rateLimit: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };

  // Gateway ping settings (for temperature strategy)
  ping: {
    enabled: boolean;
    intervalHours: number;
    gatewayCount: number;
    timeoutMs: number;
    concurrency: number;
  };

  // Error handling settings
  errorHandling: {
    /** Exit process on unhandled promise rejection (recommended: true) */
    exitOnUnhandledRejection: boolean;
    /** Exit process on uncaught exception (recommended: true) */
    exitOnUncaughtException: boolean;
    /** Grace period before forced exit to allow logs to flush (ms) */
    exitGracePeriodMs: number;
  };

  // Shutdown settings
  shutdown: {
    /** Grace period for requests to drain (ms) */
    drainTimeoutMs: number;
    /** Total shutdown timeout before force exit (ms) */
    shutdownTimeoutMs: number;
  };

  // HTTP connection pool settings
  http: {
    /** Maximum connections per gateway host */
    connectionsPerHost: number;
    /** Connection timeout in ms (TCP handshake) */
    connectTimeoutMs: number;
    /** Request timeout in ms (entire request lifecycle) */
    requestTimeoutMs: number;
    /** Keep-alive timeout in ms */
    keepAliveTimeoutMs: number;
  };

  // Arweave HTTP API proxy settings
  arweaveApi: {
    /** Enable Arweave API proxy/routing */
    enabled: boolean;
    /** Arweave node URLs for GET requests (chain state, tx info, blocks) */
    readNodes: URL[];
    /** Arweave node URLs for POST requests (tx submission, chunks)
     * Falls back to readNodes if not specified */
    writeNodes: URL[];
    /** Cache settings */
    cache: {
      enabled: boolean;
      /** TTL for immutable data (tx, blocks) in ms */
      immutableTtlMs: number;
      /** TTL for dynamic data (info, balances, status) in ms */
      dynamicTtlMs: number;
      /** Maximum cache entries */
      maxEntries: number;
      /** Maximum cache size in bytes */
      maxSizeBytes: number;
    };
    /** Retry attempts for failed requests */
    retryAttempts: number;
    /** Delay between retries in ms */
    retryDelayMs: number;
    /** Request timeout in ms */
    timeoutMs: number;
  };

  // Content moderation settings
  moderation: {
    /** Enable content moderation */
    enabled: boolean;
    /** Path to blocklist JSON file */
    blocklistPath: string;
    /** Admin API token for authentication */
    adminToken: string;
  };

  // Admin UI settings
  admin: {
    /** Enable admin UI server */
    enabled: boolean;
    /** Admin server port (separate from public port) */
    port: number;
    /** Admin server host (default: 127.0.0.1 — localhost only) */
    host: string;
    /** Token for admin UI authentication (required when host is not localhost) */
    token: string;
    /** Auto-open admin UI in browser on startup */
    openBrowser: boolean;
  };
}

// Gateway health tracking
export interface GatewayHealth {
  healthy: boolean;
  lastChecked: number;
  failures: number;
  circuitOpen: boolean;
  circuitOpenUntil: number;
}

// ArNS resolution
export interface ArnsResolution {
  txId: string;
  ttlMs: number;
  resolvedAt: number;
  processId?: string;
}

// Verification result
export interface VerificationResult {
  verified: boolean;
  txId: string;
  hash?: string;
  expectedHash?: string;
  durationMs: number;
  error?: string;
  /** URLs of gateways that provided verification hashes */
  verifiedByGateways?: string[];
}

// Proxy response metadata
export interface ProxyMetadata {
  mode: RouterMode;
  verified: boolean;
  txId: string;
  /** Gateway URL that served the data */
  routedVia: string;
  /** Gateway URLs that provided verification hashes */
  verifiedBy?: string[];
  verificationTimeMs?: number;
  cached?: boolean;
}

// Logger interface (compatible with pino)
export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
}

// Re-export telemetry types
export type { TelemetryConfig } from "./telemetry.js";

// Re-export manifest types
export type {
  ArweaveManifest,
  ManifestPathEntry,
  VerifiedManifest,
  ManifestPathResolution,
} from "./manifest.js";
export { isArweaveManifest, normalizeManifestPath } from "./manifest.js";
