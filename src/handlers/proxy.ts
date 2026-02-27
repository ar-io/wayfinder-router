/**
 * Proxy Handler
 * Fetches content from gateways, verifies it (if enabled), and serves to client
 *
 * When verification is enabled: buffers, verifies, caches, then serves only verified data
 * When verification is disabled: streams directly from gateway
 *
 * Manifest Support:
 * - Detects manifest requests (txId with subpath or ArNS resolving to manifest)
 * - Fetches and verifies manifest from trusted gateways
 * - Verifies path mapping against authentic manifest
 * - Verifies content against expected txId from manifest
 */

import type { Context } from "hono";
import type {
  Logger,
  RouterConfig,
  RequestInfo,
  TxIdRequestInfo,
} from "../types/index.js";
import type { ArnsResolver } from "../services/arns-resolver.js";
import type {
  ContentFetcher,
  FetchResult,
} from "../services/content-fetcher.js";
import type { Verifier } from "../services/verifier.js";
import type { ManifestResolver } from "../services/manifest-resolver.js";
import type { TelemetryService } from "../telemetry/service.js";
import type {
  RequestOutcome,
  VerificationOutcome,
} from "../types/telemetry.js";
import type { ContentCache } from "../cache/content-cache.js";
import type { GatewayTemperatureCache } from "../cache/gateway-temperature.js";
import type { GatewaySelector } from "../services/gateway-selector.js";
import {
  addWayfinderHeaders,
  extractManifestInfo,
  isManifestResponse,
} from "../utils/headers.js";
import { sandboxFromTxId, validateSandboxForTxId } from "../utils/url.js";

export interface ProxyHandlerDeps {
  arnsResolver: ArnsResolver;
  contentFetcher: ContentFetcher;
  verifier: Verifier;
  manifestResolver: ManifestResolver;
  config: RouterConfig;
  logger: Logger;
  telemetryService?: TelemetryService | null;
  contentCache?: ContentCache;
  /** Temperature cache for recording verification failures */
  temperatureCache?: GatewayTemperatureCache;
  /** Gateway selector for recording failures (uses internal health cache) */
  gatewaySelector?: GatewaySelector;
}

/**
 * Represents a verification attempt that failed
 */
interface VerificationAttempt {
  gateway: URL;
  error: string;
}

/**
 * Result of successful fetch and verify
 */
interface FetchAndVerifyResult {
  data: Uint8Array;
  headers: Headers;
  gateway: URL;
  contentTxId: string;
  manifestTxId: string | null;
  verificationResult: {
    durationMs: number;
    hash?: string;
    verifiedByGateways?: string[];
  };
}

/**
 * Create proxy handler
 */
export function createProxyHandler(deps: ProxyHandlerDeps) {
  const {
    arnsResolver,
    contentFetcher,
    verifier,
    manifestResolver,
    logger,
    telemetryService,
    contentCache,
    temperatureCache,
    gatewaySelector,
  } = deps;
  const { config } = deps;

  /**
   * Record a verification failure for a gateway.
   * Verification failures are weighted 3x in health tracking because they
   * may indicate malicious behavior (serving wrong content).
   */
  function recordVerificationFailure(gateway: URL): void {
    // Record via gateway selector's health cache with 3x weight
    // This quickly triggers circuit breaker for potentially malicious gateways
    gatewaySelector?.recordVerificationFailure(gateway);

    // Record in temperature cache for routing decisions
    temperatureCache?.recordFailure(gateway.origin);

    logger.warn("Recorded verification failure for gateway", {
      gateway: gateway.origin,
    });
  }

  /**
   * Fetch and verify content with retry on verification failure.
   * Tries multiple gateways before giving up.
   *
   * @param fetchFn - Function to fetch content, accepts excludeGateways parameter
   * @param requestedTxId - The requested transaction ID (may be manifest or content)
   * @param path - The request path
   * @param traceId - Trace ID for logging
   * @returns Verified content data with headers
   */
  async function fetchAndVerifyWithRetry(
    fetchFn: (excludeGateways: URL[]) => Promise<FetchResult>,
    requestedTxId: string,
    path: string,
    traceId: string,
  ): Promise<FetchAndVerifyResult> {
    const maxAttempts = config.verification.retryAttempts;
    const failedGateways: URL[] = [];
    const attempts: VerificationAttempt[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Fetch from gateway, excluding previously failed ones
      const fetchResult = await fetchFn(failedGateways);
      const { response, gateway, headers } = fetchResult;

      logger.info("Attempting verification", {
        requestedTxId,
        gateway: gateway.origin,
        attempt: attempt + 1,
        maxAttempts,
        previouslyFailed: failedGateways.map((g) => g.origin),
        traceId,
      });

      try {
        // Determine content txId (may need manifest resolution)
        const manifestInfo = extractManifestInfo(response.headers);
        const isManifest = isManifestResponse(manifestInfo, requestedTxId);

        let contentTxId = requestedTxId;
        let manifestTxId: string | null = null;

        if (isManifest && manifestInfo.dataId) {
          manifestTxId = manifestInfo.resolvedId || requestedTxId;

          logger.debug("Manifest response detected during retry", {
            manifestTxId,
            dataId: manifestInfo.dataId,
            path,
            attempt: attempt + 1,
            traceId,
          });

          // Verify manifest path mapping
          const pathResolution = await manifestResolver.resolvePath(
            manifestTxId,
            path,
          );

          if (pathResolution.contentTxId !== manifestInfo.dataId) {
            throw new Error(
              `Gateway returned wrong content for manifest path. Expected ${pathResolution.contentTxId}, got ${manifestInfo.dataId}`,
            );
          }

          contentTxId = pathResolution.contentTxId;
        }

        // Check cache before verifying
        if (contentCache) {
          const cached = await contentCache.get(contentTxId, "");
          if (cached) {
            logger.info("Cache hit during retry", {
              contentTxId,
              attempt: attempt + 1,
              traceId,
            });

            // Discard the fetched response since we're using cache
            response.body?.cancel().catch(() => {});

            return {
              data: cached.data,
              headers: contentCache.toResponse(cached).headers as Headers,
              gateway,
              contentTxId,
              manifestTxId,
              verificationResult: {
                durationMs: 0,
                hash: cached.hash,
              },
            };
          }
        }

        // Convert response headers to plain object for SDK
        const headersObj: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headersObj[key] = value;
        });

        // Create verification pipeline
        const { stream, verificationPromise } =
          verifier.createStreamingVerification(
            response.body!,
            contentTxId,
            headersObj,
          );

        // Consume stream to get verified data
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        // Wait for verification to complete
        const verificationResult = await verificationPromise;

        // Concatenate chunks
        const totalLength = chunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        const data = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.length;
        }

        // Update headers for response
        headers.delete("content-encoding");
        headers.set("content-length", String(totalLength));

        logger.info("Verification succeeded", {
          contentTxId,
          manifestTxId,
          gateway: gateway.origin,
          attempt: attempt + 1,
          verificationTimeMs: verificationResult.durationMs,
          traceId,
        });

        return {
          data,
          headers,
          gateway,
          contentTxId,
          manifestTxId,
          verificationResult,
        };
      } catch (error) {
        // VERIFICATION FAILED - record and retry
        const errorMsg = error instanceof Error ? error.message : String(error);

        failedGateways.push(gateway);
        attempts.push({ gateway, error: errorMsg });

        logger.warn("Verification failed, will retry with different gateway", {
          requestedTxId,
          gateway: gateway.origin,
          attempt: attempt + 1,
          maxAttempts,
          remainingAttempts: maxAttempts - attempt - 1,
          error: errorMsg,
          traceId,
        });

        // Record verification failure
        recordVerificationFailure(gateway);

        // Consume/discard any remaining response body
        response.body?.cancel().catch(() => {});

        // Continue to next iteration
      }
    }

    // All attempts exhausted
    logger.error("All verification attempts failed", {
      requestedTxId,
      path,
      attempts: attempts.map((a) => ({
        gateway: a.gateway.origin,
        error: a.error,
      })),
      traceId,
    });

    throw new Error(
      `Verification failed after ${maxAttempts} attempts across different gateways: ${attempts.map((a) => `${a.gateway}: ${a.error}`).join("; ")}`,
    );
  }

  return async (c: Context): Promise<Response> => {
    const requestInfo = c.get("requestInfo") as RequestInfo;
    const traceId = crypto.randomUUID();

    logger.debug("Proxy handler invoked", {
      requestInfo,
      traceId,
    });

    // Handle based on request type
    if (requestInfo.type === "arns") {
      return handleArnsRequest(c, requestInfo, traceId);
    } else if (requestInfo.type === "txid") {
      return handleTxIdRequest(c, requestInfo, traceId);
    } else {
      // Reserved path - should not reach proxy handler
      return c.json({ error: "Not Found" }, 404);
    }
  };

  /**
   * Handle ArNS subdomain request
   */
  async function handleArnsRequest(
    c: Context,
    requestInfo: { type: "arns"; arnsName: string; path: string },
    traceId: string,
  ): Promise<Response> {
    const { arnsName, path } = requestInfo;
    const startTime = Date.now();

    logger.info("Processing ArNS proxy request", {
      arnsName,
      path,
      traceId,
    });

    // Resolve ArNS to txId with consensus
    const resolution = await arnsResolver.resolve(arnsName);
    const { txId } = resolution;

    logger.debug("ArNS resolved", {
      arnsName,
      txId,
      traceId,
    });

    // Handle verification if enabled - use retry wrapper
    if (verifier.enabled) {
      // OPTIMIZATION: Check cache BEFORE fetching from gateway
      // If manifest is cached and content is cached, we can return immediately
      if (contentCache?.isEnabled()) {
        try {
          // Try to resolve path using cached manifest
          const pathResolution = await manifestResolver.resolvePath(txId, path);
          const cachedContent = await contentCache.get(
            pathResolution.contentTxId,
            "",
          );

          if (cachedContent) {
            logger.info("Early cache hit - no gateway fetch needed", {
              arnsName,
              manifestTxId: txId,
              contentTxId: pathResolution.contentTxId,
              path,
              traceId,
            });

            const cachedResponse = contentCache.toResponse(cachedContent);
            const headers = cachedResponse.headers as Headers;

            // Add wayfinder headers
            addWayfinderHeaders(headers, {
              mode: "proxy",
              verified: true,
              routedVia: "cache",
              txId: pathResolution.contentTxId,
              cached: true,
            });

            headers.set("x-wayfinder-manifest-txid", txId);

            // Record telemetry
            recordTelemetryWithVerification({
              traceId,
              gateway: "cache",
              requestType: "arns",
              identifier: arnsName,
              path,
              contentTxId: pathResolution.contentTxId,
              startTime,
              httpStatus: 200,
              bytesReceived: cachedContent.data.length,
              verificationOutcome: "verified",
              verificationDurationMs: 0,
            });

            return new Response(cachedContent.data, {
              status: 200,
              headers,
            });
          }
        } catch {
          // Manifest not cached or path not found - proceed with fetch
          logger.debug("Early cache check failed, proceeding with fetch", {
            arnsName,
            txId,
            path,
            traceId,
          });
        }
      }

      // Create fetch function that can be retried with gateway exclusion
      const fetchFn = (excludeGateways: URL[]) =>
        contentFetcher.fetchByArns({
          arnsName,
          resolvedTxId: txId,
          path,
          originalHeaders: c.req.raw.headers,
          traceId,
          excludeGateways,
        });

      // Fetch and verify with retry
      const result = await fetchAndVerifyWithRetry(
        fetchFn,
        txId,
        path,
        traceId,
      );

      // Cache the verified content
      if (contentCache?.isEnabled()) {
        const headersForCache: Record<string, string> = {};
        result.headers.forEach((value, key) => {
          headersForCache[key] = value;
        });

        const cached = await contentCache.set(result.contentTxId, "", {
          data: result.data,
          contentType:
            result.headers.get("content-type") || "application/octet-stream",
          contentLength: result.data.length,
          headers: headersForCache,
          verifiedAt: Date.now(),
          txId: result.contentTxId,
          hash: result.verificationResult.hash,
        });

        if (cached) {
          logger.info("Verified content added to cache", {
            contentTxId: result.contentTxId,
            manifestTxId: result.manifestTxId,
            path,
            size: result.data.length,
            traceId,
          });
        }
      }

      // Add wayfinder headers
      addWayfinderHeaders(result.headers, {
        mode: "proxy",
        verified: true,
        routedVia: result.gateway.origin,
        verifiedBy: result.verificationResult.verifiedByGateways,
        txId: result.contentTxId,
        verificationTimeMs: result.verificationResult.durationMs,
      });

      if (result.manifestTxId) {
        result.headers.set("x-wayfinder-manifest-txid", result.manifestTxId);
      }

      logger.info("ArNS proxy request completed (verified)", {
        arnsName,
        contentTxId: result.contentTxId,
        manifestTxId: result.manifestTxId,
        gateway: result.gateway.origin,
        verified: true,
        verificationTimeMs: result.verificationResult.durationMs,
        totalDurationMs: Date.now() - startTime,
        traceId,
      });

      // Record successful telemetry
      recordTelemetryWithVerification({
        traceId,
        gateway: result.gateway.origin,
        requestType: "arns",
        identifier: arnsName,
        path,
        contentTxId: result.contentTxId,
        startTime,
        httpStatus: 200,
        bytesReceived: result.data.length,
        verificationOutcome: "verified",
        verificationDurationMs: result.verificationResult.durationMs,
      });

      return new Response(result.data, {
        status: 200,
        headers: result.headers,
      });
    }

    // No verification - pass through directly (single fetch, no retry needed)
    const fetchResult = await contentFetcher.fetchByArns({
      arnsName,
      resolvedTxId: txId,
      path,
      originalHeaders: c.req.raw.headers,
      traceId,
    });

    const { response, gateway, headers } = fetchResult;

    addWayfinderHeaders(headers, {
      mode: "proxy",
      verified: false,
      routedVia: gateway.origin,
      txId,
    });

    logger.info("ArNS proxy request completed (unverified)", {
      arnsName,
      txId,
      gateway: gateway.origin,
      durationMs: Date.now() - startTime,
      traceId,
    });

    // Record telemetry
    recordTelemetry({
      traceId,
      gateway: gateway.origin,
      requestType: "arns",
      identifier: arnsName,
      path,
      outcome: "success",
      httpStatus: response.status,
      startTime,
      bytesReceived:
        parseInt(response.headers.get("content-length") || "0", 10) ||
        undefined,
    });

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  }

  /**
   * Handle transaction ID path request
   */
  async function handleTxIdRequest(
    c: Context,
    requestInfo: TxIdRequestInfo,
    traceId: string,
  ): Promise<Response> {
    const { txId, path, sandboxSubdomain } = requestInfo;
    const startTime = Date.now();

    logger.info("Processing txId proxy request", {
      txId,
      path,
      sandboxSubdomain,
      traceId,
    });

    // Check if we need to redirect to sandbox subdomain
    if (!sandboxSubdomain) {
      // No sandbox subdomain - redirect to sandboxed URL
      const sandbox = sandboxFromTxId(txId);
      const protocol = c.req.url.startsWith("https") ? "https" : "http";
      const url = new URL(c.req.url);
      const portSuffix =
        url.port && url.port !== "80" && url.port !== "443"
          ? `:${url.port}`
          : "";
      const redirectUrl = `${protocol}://${sandbox}.${config.server.baseDomain}${portSuffix}/${txId}${path}`;

      logger.info("Redirecting to sandbox subdomain", {
        txId,
        sandbox,
        redirectUrl,
        traceId,
      });

      return c.redirect(redirectUrl, 302);
    }

    // Validate sandbox matches txId (security check)
    if (!validateSandboxForTxId(sandboxSubdomain, txId)) {
      logger.warn("Sandbox subdomain mismatch", {
        txId,
        sandboxSubdomain,
        expectedSandbox: sandboxFromTxId(txId),
        traceId,
      });
      return c.json(
        {
          error: "Bad Request",
          message: "Sandbox subdomain does not match transaction ID",
        },
        400,
      );
    }

    // Handle verification if enabled - use retry wrapper
    if (verifier.enabled) {
      // OPTIMIZATION: Check cache BEFORE fetching from gateway
      if (contentCache?.isEnabled()) {
        // For txId requests with a path, try to resolve via cached manifest
        if (path && path !== "/") {
          try {
            const pathResolution = await manifestResolver.resolvePath(
              txId,
              path,
            );
            const cachedContent = await contentCache.get(
              pathResolution.contentTxId,
              "",
            );

            if (cachedContent) {
              logger.info("Early cache hit - no gateway fetch needed", {
                txId,
                manifestTxId: txId,
                contentTxId: pathResolution.contentTxId,
                path,
                traceId,
              });

              const cachedResponse = contentCache.toResponse(cachedContent);
              const headers = cachedResponse.headers as Headers;

              addWayfinderHeaders(headers, {
                mode: "proxy",
                verified: true,
                routedVia: "cache",
                txId: pathResolution.contentTxId,
                cached: true,
              });

              headers.set("x-wayfinder-manifest-txid", txId);

              recordTelemetryWithVerification({
                traceId,
                gateway: "cache",
                requestType: "txid",
                identifier: txId,
                path,
                contentTxId: pathResolution.contentTxId,
                startTime,
                httpStatus: 200,
                bytesReceived: cachedContent.data.length,
                verificationOutcome: "verified",
                verificationDurationMs: 0,
              });

              return new Response(cachedContent.data, {
                status: 200,
                headers,
              });
            }
          } catch {
            // Manifest not cached or path not found - proceed with fetch
            logger.debug("Early cache check failed, proceeding with fetch", {
              txId,
              path,
              traceId,
            });
          }
        } else {
          // Direct txId request (no path) - check cache directly
          const cachedContent = await contentCache.get(txId, "");
          if (cachedContent) {
            logger.info("Early cache hit - no gateway fetch needed", {
              txId,
              path,
              traceId,
            });

            const cachedResponse = contentCache.toResponse(cachedContent);
            const headers = cachedResponse.headers as Headers;

            addWayfinderHeaders(headers, {
              mode: "proxy",
              verified: true,
              routedVia: "cache",
              txId,
              cached: true,
            });

            recordTelemetryWithVerification({
              traceId,
              gateway: "cache",
              requestType: "txid",
              identifier: txId,
              path,
              contentTxId: txId,
              startTime,
              httpStatus: 200,
              bytesReceived: cachedContent.data.length,
              verificationOutcome: "verified",
              verificationDurationMs: 0,
            });

            return new Response(cachedContent.data, {
              status: 200,
              headers,
            });
          }
        }
      }

      // Create fetch function that can be retried with gateway exclusion
      const fetchFn = (excludeGateways: URL[]) =>
        contentFetcher.fetchByTxId({
          txId,
          path,
          originalHeaders: c.req.raw.headers,
          traceId,
          excludeGateways,
        });

      // Fetch and verify with retry
      const result = await fetchAndVerifyWithRetry(
        fetchFn,
        txId,
        path,
        traceId,
      );

      // Cache the verified content
      if (contentCache?.isEnabled()) {
        const headersForCache: Record<string, string> = {};
        result.headers.forEach((value, key) => {
          headersForCache[key] = value;
        });

        const cached = await contentCache.set(result.contentTxId, "", {
          data: result.data,
          contentType:
            result.headers.get("content-type") || "application/octet-stream",
          contentLength: result.data.length,
          headers: headersForCache,
          verifiedAt: Date.now(),
          txId: result.contentTxId,
          hash: result.verificationResult.hash,
        });

        if (cached) {
          logger.info("Verified content added to cache", {
            contentTxId: result.contentTxId,
            manifestTxId: result.manifestTxId,
            path,
            size: result.data.length,
            traceId,
          });
        }
      }

      // Add wayfinder headers
      addWayfinderHeaders(result.headers, {
        mode: "proxy",
        verified: true,
        routedVia: result.gateway.origin,
        verifiedBy: result.verificationResult.verifiedByGateways,
        txId: result.contentTxId,
        verificationTimeMs: result.verificationResult.durationMs,
      });

      if (result.manifestTxId) {
        result.headers.set("x-wayfinder-manifest-txid", result.manifestTxId);
      }

      logger.info("TxId proxy request completed (verified)", {
        txId,
        contentTxId: result.contentTxId,
        manifestTxId: result.manifestTxId,
        gateway: result.gateway.origin,
        verified: true,
        verificationTimeMs: result.verificationResult.durationMs,
        totalDurationMs: Date.now() - startTime,
        traceId,
      });

      // Record successful telemetry
      recordTelemetryWithVerification({
        traceId,
        gateway: result.gateway.origin,
        requestType: "txid",
        identifier: txId,
        path,
        contentTxId: result.contentTxId,
        startTime,
        httpStatus: 200,
        bytesReceived: result.data.length,
        verificationOutcome: "verified",
        verificationDurationMs: result.verificationResult.durationMs,
      });

      return new Response(result.data, {
        status: 200,
        headers: result.headers,
      });
    }

    // No verification - pass through directly (single fetch, no retry needed)
    const fetchResult = await contentFetcher.fetchByTxId({
      txId,
      path,
      originalHeaders: c.req.raw.headers,
      traceId,
    });

    const { response, gateway, headers } = fetchResult;

    addWayfinderHeaders(headers, {
      mode: "proxy",
      verified: false,
      routedVia: gateway.origin,
      txId,
    });

    logger.info("TxId proxy request completed (unverified)", {
      txId,
      gateway: gateway.origin,
      durationMs: Date.now() - startTime,
      traceId,
    });

    // Record telemetry
    recordTelemetry({
      traceId,
      gateway: gateway.origin,
      requestType: "txid",
      identifier: txId,
      path,
      outcome: "success",
      httpStatus: response.status,
      startTime,
      bytesReceived:
        parseInt(response.headers.get("content-length") || "0", 10) ||
        undefined,
    });

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  }

  /**
   * Record telemetry for a request
   */
  function recordTelemetry(params: {
    traceId: string;
    gateway: string;
    requestType: "arns" | "txid";
    identifier: string;
    path: string;
    outcome: RequestOutcome;
    httpStatus?: number;
    startTime: number;
    bytesReceived?: number;
  }): void {
    if (!telemetryService) return;

    telemetryService.recordRequest({
      traceId: params.traceId,
      timestamp: params.startTime,
      gateway: params.gateway,
      requestType: params.requestType,
      identifier: params.identifier,
      path: params.path,
      mode: "proxy",
      outcome: params.outcome,
      httpStatus: params.httpStatus,
      latency: {
        totalMs: Date.now() - params.startTime,
      },
      bytesReceived: params.bytesReceived,
    });
  }

  /**
   * Record telemetry for a request with verification
   */
  function recordTelemetryWithVerification(params: {
    traceId: string;
    gateway: string;
    requestType: "arns" | "txid";
    identifier: string;
    path: string;
    contentTxId: string;
    startTime: number;
    httpStatus?: number;
    bytesReceived?: number;
    verificationOutcome: VerificationOutcome;
    verificationDurationMs?: number;
  }): void {
    if (!telemetryService) return;

    telemetryService.recordRequest({
      traceId: params.traceId,
      timestamp: params.startTime,
      gateway: params.gateway,
      requestType: params.requestType,
      identifier: params.identifier,
      path: params.path,
      mode: "proxy",
      outcome:
        params.verificationOutcome === "failed" ? "server_error" : "success",
      httpStatus: params.httpStatus,
      latency: {
        totalMs: Date.now() - params.startTime,
      },
      bytesReceived: params.bytesReceived,
      verification: {
        outcome: params.verificationOutcome,
        durationMs: params.verificationDurationMs,
        contentTxId: params.contentTxId,
      },
    });
  }
}
