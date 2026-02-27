/**
 * Manifest Resolver Service
 * Handles fetching, verifying, parsing, and resolving Arweave manifests
 *
 * NOTE: Manifests require special verification handling. The SDK's HashVerificationStrategy
 * fetches expected hashes from /{txId} which returns index content for manifests, not
 * the raw manifest JSON. We implement custom verification using /raw/{txId} endpoints.
 */

import { createHash } from "node:crypto";
import type { GatewaysProvider } from "@ar.io/wayfinder-core";
import type { Logger, RouterConfig } from "../types/index.js";
import type {
  ArweaveManifest,
  VerifiedManifest,
  ManifestPathResolution,
} from "../types/manifest.js";
import { isArweaveManifest, normalizeManifestPath } from "../types/manifest.js";
import { ManifestCache } from "../cache/manifest-cache.js";
import { WayfinderError } from "../middleware/error-handler.js";
import { RequestDeduplicator } from "../utils/deduplicator.js";

/** Valid Arweave transaction ID pattern (43 chars, base64url) */
const TXID_REGEX = /^[a-zA-Z0-9_-]{43}$/;

/** Maximum manifest size (10MB) */
const MAX_MANIFEST_SIZE = 10 * 1024 * 1024;

/**
 * Error thrown when manifest operations fail
 */
export class ManifestError extends WayfinderError {
  public readonly manifestTxId: string;

  constructor(manifestTxId: string, message: string, statusCode: number = 502) {
    super(message, statusCode, "MANIFEST_ERROR");
    this.name = "ManifestError";
    this.manifestTxId = manifestTxId;
  }
}

/**
 * Error thrown when a path is not found in a manifest
 */
export class ManifestPathNotFoundError extends WayfinderError {
  public readonly manifestTxId: string;
  public readonly path: string;

  constructor(manifestTxId: string, path: string) {
    super(
      `Path "${path}" not found in manifest ${manifestTxId}`,
      404,
      "MANIFEST_PATH_NOT_FOUND",
    );
    this.name = "ManifestPathNotFoundError";
    this.manifestTxId = manifestTxId;
    this.path = path;
  }
}

/**
 * Internal error for hash mismatch detection during parallel verification
 * This allows us to distinguish security issues (hash mismatch) from
 * network issues (gateway unavailable) when using Promise.allSettled
 */
class HashMismatchError extends Error {
  constructor(
    public readonly gateway: string,
    public readonly computedHash: string,
    public readonly expectedHash: string,
  ) {
    super(
      `Hash mismatch from ${gateway}: computed ${computedHash}, expected ${expectedHash}`,
    );
    this.name = "HashMismatchError";
  }
}

export interface ManifestResolverOptions {
  /** Provider for trusted verification gateways */
  gatewaysProvider: GatewaysProvider;
  /** Static fallback gateways (used if provider returns empty) */
  fallbackGateways: URL[];
  cache: ManifestCache;
  logger: Logger;
  fetchTimeoutMs?: number;
}

export class ManifestResolver {
  private gatewaysProvider: GatewaysProvider;
  private fallbackGateways: URL[];
  private cache: ManifestCache;
  private logger: Logger;
  private fetchTimeoutMs: number;

  /** Request deduplicator for in-flight manifest fetches */
  private deduplicator: RequestDeduplicator<VerifiedManifest>;

  constructor(options: ManifestResolverOptions) {
    this.gatewaysProvider = options.gatewaysProvider;
    this.fallbackGateways = options.fallbackGateways;
    this.cache = options.cache;
    this.logger = options.logger;
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? 30000;
    this.deduplicator = new RequestDeduplicator<VerifiedManifest>({
      logger: options.logger,
      name: "manifest-resolver",
    });

    this.logger.info("ManifestResolver initialized", {
      hasFallbackGateways: this.fallbackGateways.length > 0,
    });
  }

  /**
   * Get trusted gateways from provider or fallback
   */
  private async getTrustedGateways(): Promise<URL[]> {
    try {
      const gateways = await this.gatewaysProvider.getGateways();
      if (gateways.length > 0) {
        return gateways;
      }
    } catch (error) {
      this.logger.warn("Failed to get gateways from provider, using fallback", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return this.fallbackGateways;
  }

  /**
   * Validate transaction ID format
   */
  private validateTxId(txId: string): void {
    if (!TXID_REGEX.test(txId)) {
      throw new ManifestError(txId, "Invalid transaction ID format", 400);
    }
  }

  /**
   * Get a verified manifest, fetching and verifying if not cached.
   * Includes deduplication of concurrent requests for the same manifest.
   */
  async getManifest(manifestTxId: string): Promise<VerifiedManifest> {
    // Validate txId format first
    this.validateTxId(manifestTxId);

    // Check cache first
    const cached = this.cache.get(manifestTxId);
    if (cached) {
      this.logger.debug("Manifest found in cache", { manifestTxId });
      return cached;
    }

    // Use deduplicator to ensure only one fetch happens for concurrent requests
    return this.deduplicator.dedupe(manifestTxId, async () => {
      // Double-check cache (in case another request cached it while we waited)
      const cachedAfterWait = this.cache.get(manifestTxId);
      if (cachedAfterWait) {
        return cachedAfterWait;
      }

      // Fetch and verify from trusted gateways
      this.logger.debug("Fetching manifest from trusted gateways", {
        manifestTxId,
      });

      const verified = await this.fetchAndVerifyManifest(manifestTxId);
      this.cache.set(verified);
      return verified;
    });
  }

  /**
   * Resolve a path within a manifest to its content txId
   */
  async resolvePath(
    manifestTxId: string,
    path: string,
  ): Promise<ManifestPathResolution> {
    const verified = await this.getManifest(manifestTxId);
    const manifest = verified.manifest;

    // Normalize the path
    const normalizedPath = normalizeManifestPath(path);

    this.logger.debug("Resolving manifest path", {
      manifestTxId,
      originalPath: path,
      normalizedPath,
    });

    // Handle empty path or index
    if (normalizedPath === "" || normalizedPath === "/") {
      if (!manifest.index?.path) {
        throw new ManifestPathNotFoundError(manifestTxId, path || "/");
      }

      const indexPath = normalizeManifestPath(manifest.index.path);
      const indexEntry = manifest.paths[indexPath];

      if (indexEntry === undefined) {
        throw new ManifestPathNotFoundError(manifestTxId, manifest.index.path);
      }

      return {
        manifestTxId,
        path: indexPath,
        contentTxId: indexEntry.id,
        isIndex: true,
      };
    }

    // Look up the path in manifest
    let entry = manifest.paths[normalizedPath];
    let resolvedPath = normalizedPath;

    if (entry === undefined) {
      // Try with and without leading slash
      const altPath = normalizedPath.startsWith("/")
        ? normalizedPath.slice(1)
        : `/${normalizedPath}`;
      entry = manifest.paths[altPath];
      resolvedPath = altPath;
    }

    if (entry === undefined) {
      // Use fallback if available
      if (manifest.fallback?.id) {
        this.logger.debug("Path not found, using manifest fallback", {
          manifestTxId,
          path: normalizedPath,
          fallbackTxId: manifest.fallback.id,
        });

        return {
          manifestTxId,
          path: normalizedPath,
          contentTxId: manifest.fallback.id,
          isIndex: false,
        };
      }

      throw new ManifestPathNotFoundError(manifestTxId, path);
    }

    return {
      manifestTxId,
      path: resolvedPath,
      contentTxId: entry.id,
      isIndex: false,
    };
  }

  /**
   * Check if we have a verified manifest cached
   */
  hasCached(manifestTxId: string): boolean {
    return this.cache.has(manifestTxId);
  }

  /**
   * Get cache statistics
   */
  stats(): ReturnType<ManifestCache["stats"]> {
    return this.cache.stats();
  }

  /**
   * Invalidate a cached manifest
   */
  invalidate(manifestTxId: string): void {
    this.cache.delete(manifestTxId);
  }

  /**
   * Fetch raw manifest from trusted gateways and verify
   *
   * NOTE: We use custom verification instead of the SDK's HashVerificationStrategy
   * because the SDK fetches hashes from /{txId} which returns index content for
   * manifests, not the raw manifest JSON. We fetch from /raw/{txId} instead.
   *
   * Uses Promise.any() to fetch from all gateways in parallel for better performance.
   * Returns as soon as any gateway successfully fetches and verifies the manifest.
   */
  private async fetchAndVerifyManifest(
    manifestTxId: string,
  ): Promise<VerifiedManifest> {
    // Get trusted gateways from provider
    const trustedGateways = await this.getTrustedGateways();

    if (trustedGateways.length === 0) {
      throw new ManifestError(
        manifestTxId,
        "No trusted gateways available for manifest verification",
      );
    }

    // Try all gateways in parallel, return first success
    const fetchPromises = trustedGateways.map(async (gateway) => {
      try {
        const result = await this.fetchRawManifest(gateway, manifestTxId);

        // Custom verification for manifests using /raw/ endpoint
        // The SDK's HashVerificationStrategy doesn't work for manifests because
        // it fetches from /{txId} which returns the index content hash, not manifest hash
        const verificationResult = await this.verifyManifestHash(
          result.data,
          manifestTxId,
          result.headers,
          gateway,
          trustedGateways,
        );

        if (!verificationResult.verified) {
          throw new ManifestError(
            manifestTxId,
            `Manifest verification failed: ${verificationResult.error || "unknown error"}`,
          );
        }

        // Parse the manifest JSON
        const manifest = this.parseManifest(result.data, manifestTxId);

        this.logger.info("Manifest fetched and verified", {
          manifestTxId,
          gateway: gateway.origin,
          pathCount: Object.keys(manifest.paths).length,
          hasIndex: !!manifest.index,
          verifiedBy: verificationResult.verifiedBy,
        });

        return {
          txId: manifestTxId,
          manifest,
          verifiedAt: Date.now(),
          sizeBytes: result.data.length,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.warn("Failed to fetch manifest from gateway", {
          manifestTxId,
          gateway: gateway.origin,
          error: errorMessage,
        });
        // Re-throw to let Promise.any() handle it
        throw error;
      }
    });

    try {
      // Return the first successful result
      return await Promise.any(fetchPromises);
    } catch (error) {
      // All promises rejected - AggregateError contains all errors
      if (error instanceof AggregateError) {
        const lastError = error.errors[error.errors.length - 1];
        const errorMessage =
          lastError instanceof Error ? lastError.message : String(lastError);
        throw new ManifestError(
          manifestTxId,
          `Failed to fetch manifest from any trusted gateway: ${errorMessage}`,
        );
      }
      throw error;
    }
  }

  /**
   * Verify manifest hash using /raw/ endpoint (PARALLEL)
   *
   * SECURITY: We ALWAYS fetch the expected hash from trusted gateways.
   * Never trust the source gateway's x-ar-io-digest header - a malicious
   * gateway could serve bad content with a matching bad digest.
   *
   * 1. Compute SHA-256 hash of received data
   * 2. Fetch expected hash from ALL trusted gateways in parallel
   * 3. Return success on first matching hash (Promise.any pattern)
   * 4. Detect hash mismatches as security concerns
   */
  private async verifyManifestHash(
    data: Uint8Array,
    manifestTxId: string,
    _headers: Record<string, string>,
    sourceGateway: URL,
    trustedGateways: URL[],
  ): Promise<{ verified: boolean; error?: string; verifiedBy?: string }> {
    // Compute hash of the manifest data we received
    const computedHash = createHash("sha256").update(data).digest("base64url");

    // Filter out source gateway - we need independent verification
    const eligibleGateways = trustedGateways.filter(
      (gw) => gw.toString() !== sourceGateway.toString(),
    );

    if (eligibleGateways.length === 0) {
      return {
        verified: false,
        error:
          "No trusted gateways available for verification (source gateway excluded)",
      };
    }

    this.logger.debug(
      "Verifying manifest hash against trusted gateways (parallel)",
      {
        manifestTxId,
        sourceGateway: sourceGateway.toString(),
        computedHash,
        eligibleGatewayCount: eligibleGateways.length,
      },
    );

    // Query all trusted gateways in parallel
    const verifyPromises = eligibleGateways.map(async (gateway) => {
      const expectedHash = await this.fetchRawDigest(gateway, manifestTxId);

      if (!expectedHash) {
        throw new Error(`No digest header from ${gateway}`);
      }

      if (computedHash !== expectedHash) {
        // Hash mismatch is a security concern - mark it specially
        throw new HashMismatchError(gateway.origin, computedHash, expectedHash);
      }

      // Hash matches!
      return { verified: true as const, verifiedBy: gateway.origin };
    });

    // Use Promise.allSettled to check for hash mismatches vs network failures
    const results = await Promise.allSettled(verifyPromises);

    // Check for any successful verification
    const success = results.find(
      (
        r,
      ): r is PromiseFulfilledResult<{ verified: true; verifiedBy: string }> =>
        r.status === "fulfilled",
    );

    if (success) {
      this.logger.debug("Manifest verified against trusted gateway", {
        manifestTxId,
        verifyGateway: success.value.verifiedBy,
        hash: computedHash,
      });
      return success.value;
    }

    // No success - check if any gateway reported a hash MISMATCH (security issue)
    // vs all gateways just being unavailable (network issue)
    const mismatch = results.find(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" && r.reason instanceof HashMismatchError,
    );

    if (mismatch) {
      const err = mismatch.reason as HashMismatchError;
      this.logger.warn("Manifest hash mismatch - possible tampering", {
        manifestTxId,
        sourceGateway: sourceGateway.toString(),
        computedHash: err.computedHash,
        expectedHash: err.expectedHash,
        trustedGateway: err.gateway,
      });
      return {
        verified: false,
        error: `Hash mismatch: computed ${err.computedHash}, trusted gateway ${err.gateway} returned ${err.expectedHash}`,
      };
    }

    // All gateways failed with network/timeout errors
    return {
      verified: false,
      error:
        "No trusted gateway provided x-ar-io-digest header for manifest verification. " +
        "Manifest verification requires trusted gateways that return the x-ar-io-digest header on /raw/ endpoints.",
    };
  }

  /**
   * Fetch the x-ar-io-digest header from a gateway's /raw/ endpoint
   */
  private async fetchRawDigest(
    gateway: URL,
    txId: string,
  ): Promise<string | null> {
    const url = new URL(gateway);
    url.pathname = `/raw/${txId}`;

    const response = await fetch(url.toString(), {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });

    if (!response.ok) {
      return null;
    }

    return response.headers.get("x-ar-io-digest");
  }

  /**
   * Fetch raw manifest content from a gateway
   */
  private async fetchRawManifest(
    gateway: URL,
    manifestTxId: string,
  ): Promise<{ data: Uint8Array; headers: Record<string, string> }> {
    // Construct raw manifest URL
    const url = new URL(gateway);
    url.pathname = `/raw/${manifestTxId}`;

    this.logger.debug("Fetching raw manifest", {
      url: url.toString(),
      manifestTxId,
    });

    const response = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(this.fetchTimeoutMs),
      redirect: "error",
    });

    if (!response.ok) {
      throw new ManifestError(
        manifestTxId,
        `Gateway returned ${response.status}: ${response.statusText}`,
      );
    }

    // Check content-length before buffering to prevent memory exhaustion
    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
      10,
    );
    if (Number.isNaN(contentLength) || contentLength > MAX_MANIFEST_SIZE) {
      throw new ManifestError(
        manifestTxId,
        `Manifest too large: ${contentLength} bytes (max ${MAX_MANIFEST_SIZE})`,
        400,
      );
    }

    // Read the response body
    const data = new Uint8Array(await response.arrayBuffer());

    // Double-check actual size (in case content-length was wrong or missing)
    if (data.length > MAX_MANIFEST_SIZE) {
      throw new ManifestError(
        manifestTxId,
        `Manifest too large: ${data.length} bytes (max ${MAX_MANIFEST_SIZE})`,
        400,
      );
    }

    // Extract relevant headers for verification
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return { data, headers };
  }

  /**
   * Parse manifest JSON
   */
  private parseManifest(
    data: Uint8Array,
    manifestTxId: string,
  ): ArweaveManifest {
    let parsed: unknown;

    try {
      const text = new TextDecoder().decode(data);
      parsed = JSON.parse(text);
    } catch {
      throw new ManifestError(manifestTxId, "Failed to parse manifest JSON");
    }

    if (!isArweaveManifest(parsed)) {
      throw new ManifestError(
        manifestTxId,
        "Invalid manifest format: not a valid arweave/paths manifest",
      );
    }

    return parsed;
  }
}

/**
 * Create manifest resolver from configuration
 * @param config Router configuration
 * @param logger Logger instance
 * @param verificationProvider Provider for verification gateways
 */
export function createManifestResolver(
  config: RouterConfig,
  logger: Logger,
  verificationProvider: GatewaysProvider | null,
): ManifestResolver {
  const cache = new ManifestCache({
    maxSize: 1000, // Cache up to 1000 manifests
    logger,
  });

  // Create a provider that uses the verification provider or static gateways
  const gatewaysProvider: GatewaysProvider = verificationProvider || {
    getGateways: async () => config.verification.staticGateways,
  };

  return new ManifestResolver({
    gatewaysProvider,
    fallbackGateways:
      config.verification.staticGateways.length > 0
        ? config.verification.staticGateways
        : config.networkGateways.fallbackGateways,
    cache,
    logger,
  });
}
