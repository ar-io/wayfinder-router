/**
 * Content Fetcher Service
 * Resilient fetch with retry logic and gateway failover
 */

import type { Logger, RouterConfig } from "../types/index.js";
import type { GatewaySelector } from "./gateway-selector.js";
import type { GatewayTemperatureCache } from "../cache/gateway-temperature.js";
import type { HttpClient } from "../http/http-client.js";
import { constructGatewayUrl, constructArnsGatewayUrl } from "../utils/url.js";
import {
  createGatewayRequestHeaders,
  filterGatewayResponseHeaders,
} from "../utils/headers.js";
import { GatewayError } from "../middleware/error-handler.js";

export interface ContentFetcherOptions {
  gatewaySelector: GatewaySelector;
  retryAttempts: number;
  retryDelayMs: number;
  /** Request timeout in ms */
  requestTimeoutMs: number;
  logger: Logger;
  /** Optional temperature cache for performance tracking */
  temperatureCache?: GatewayTemperatureCache;
  /** Optional HTTP client with connection pooling */
  httpClient?: HttpClient;
}

export interface FetchResult {
  response: Response;
  gateway: URL;
  headers: Headers;
}

export interface FetchParams {
  txId: string;
  path: string;
  originalHeaders?: Headers;
  traceId?: string;
  /** Gateways to exclude from selection (e.g., previously failed verification) */
  excludeGateways?: URL[];
}

export interface FetchArnsParams {
  arnsName: string;
  resolvedTxId: string;
  path: string;
  originalHeaders?: Headers;
  traceId?: string;
  /** Gateways to exclude from selection (e.g., previously failed verification) */
  excludeGateways?: URL[];
}

export class ContentFetcher {
  private gatewaySelector: GatewaySelector;
  private retryAttempts: number;
  private retryDelayMs: number;
  private requestTimeoutMs: number;
  private logger: Logger;
  private temperatureCache?: GatewayTemperatureCache;
  private httpClient?: HttpClient;

  constructor(options: ContentFetcherOptions) {
    this.gatewaySelector = options.gatewaySelector;
    this.retryAttempts = options.retryAttempts;
    this.retryDelayMs = options.retryDelayMs;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.logger = options.logger;
    this.temperatureCache = options.temperatureCache;
    this.httpClient = options.httpClient;
  }

  /**
   * Fetch with connection pooling if available, otherwise use native fetch
   */
  private async doFetch(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<Response> {
    if (this.httpClient) {
      return this.httpClient.fetch(url, options);
    }
    return fetch(url, {
      ...options,
      redirect: "follow",
    });
  }

  /**
   * Fetch content for a transaction ID
   */
  async fetchByTxId(params: FetchParams): Promise<FetchResult> {
    const {
      txId,
      path,
      originalHeaders,
      traceId,
      excludeGateways = [],
    } = params;

    let lastError: Error | undefined;
    let lastGateway: URL | undefined;
    const triedGateways: URL[] = [];

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      const startTime = Date.now();

      try {
        // Select a gateway, excluding already-tried ones AND externally excluded ones
        const allExcluded = [...excludeGateways, ...triedGateways];
        const gateway = await this.gatewaySelector.selectForTransaction(
          txId,
          path,
          allExcluded.length > 0 ? allExcluded : undefined,
        );
        lastGateway = gateway;
        triedGateways.push(gateway);

        // Construct the gateway URL
        const gatewayUrl = constructGatewayUrl({
          gateway,
          txId,
          path,
          useSubdomain: true,
        });

        this.logger.debug("Fetching from gateway", {
          gateway: gateway.origin,
          gatewayUrl: gatewayUrl.toString(),
          txId,
          attempt: attempt + 1,
          triedGateways: triedGateways.length,
          pooled: !!this.httpClient,
        });

        // Create request headers
        const requestHeaders = createGatewayRequestHeaders({
          originalHeaders,
          traceId,
        });

        // Convert Headers to plain object for HttpClient compatibility
        const headersObj: Record<string, string> = {};
        requestHeaders.forEach((value, key) => {
          headersObj[key] = value;
        });

        // Fetch from gateway with timeout (using connection pool if available)
        const response = await this.doFetch(gatewayUrl.toString(), {
          method: "GET",
          headers: headersObj,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });

        if (!response.ok) {
          throw new GatewayError(
            gateway.origin,
            `Gateway returned ${response.status}: ${response.statusText}`,
            response.status,
          );
        }

        // Calculate latency and record success
        const latencyMs = Date.now() - startTime;

        // Mark gateway as healthy
        this.gatewaySelector.markHealthy(gateway);

        // Record temperature (latency) for performance tracking
        this.temperatureCache?.recordSuccess(gateway.origin, latencyMs);

        // Filter response headers
        const filteredHeaders = filterGatewayResponseHeaders(response.headers);

        this.logger.debug("Content fetched successfully", {
          gateway: gateway.origin,
          txId,
          latencyMs,
          contentType: response.headers.get("content-type"),
          contentLength: response.headers.get("content-length"),
        });

        return {
          response,
          gateway,
          headers: filteredHeaders,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Record failure for the gateway
        if (lastGateway) {
          this.gatewaySelector.recordFailure(lastGateway);
          this.temperatureCache?.recordFailure(lastGateway.origin);
        }

        this.logger.warn("Fetch attempt failed", {
          txId,
          gateway: lastGateway?.origin,
          attempt: attempt + 1,
          maxAttempts: this.retryAttempts,
          error: lastError.message,
        });

        // Wait before retry
        if (attempt < this.retryAttempts - 1) {
          await this.delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    // All attempts failed
    throw (
      lastError ||
      new GatewayError(
        lastGateway?.origin || "unknown",
        "All fetch attempts failed",
      )
    );
  }

  /**
   * Fetch content for an ArNS name (using resolved txId)
   */
  async fetchByArns(params: FetchArnsParams): Promise<FetchResult> {
    const {
      arnsName,
      resolvedTxId,
      path,
      originalHeaders,
      traceId,
      excludeGateways = [],
    } = params;

    let lastError: Error | undefined;
    let lastGateway: URL | undefined;
    const triedGateways: URL[] = [];

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      const startTime = Date.now();

      try {
        // Select a gateway, excluding already-tried ones AND externally excluded ones
        const allExcluded = [...excludeGateways, ...triedGateways];
        const gateway = await this.gatewaySelector.selectForArns(
          arnsName,
          path,
          allExcluded.length > 0 ? allExcluded : undefined,
        );
        lastGateway = gateway;
        triedGateways.push(gateway);

        // For ArNS, we use the arnsName as subdomain
        const gatewayUrl = constructArnsGatewayUrl({
          gateway,
          arnsName,
          path,
        });

        this.logger.debug("Fetching ArNS content from gateway", {
          gateway: gateway.origin,
          gatewayUrl: gatewayUrl.toString(),
          arnsName,
          resolvedTxId,
          attempt: attempt + 1,
          triedGateways: triedGateways.length,
          pooled: !!this.httpClient,
        });

        // Create request headers
        const requestHeaders = createGatewayRequestHeaders({
          originalHeaders,
          traceId,
        });

        // Convert Headers to plain object for HttpClient compatibility
        const headersObj: Record<string, string> = {};
        requestHeaders.forEach((value, key) => {
          headersObj[key] = value;
        });

        // Fetch from gateway with timeout (using connection pool if available)
        const response = await this.doFetch(gatewayUrl.toString(), {
          method: "GET",
          headers: headersObj,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });

        if (!response.ok) {
          throw new GatewayError(
            gateway.origin,
            `Gateway returned ${response.status}: ${response.statusText}`,
            response.status,
          );
        }

        // Calculate latency and record success
        const latencyMs = Date.now() - startTime;

        // Mark gateway as healthy
        this.gatewaySelector.markHealthy(gateway);

        // Record temperature (latency) for performance tracking
        this.temperatureCache?.recordSuccess(gateway.origin, latencyMs);

        // Filter response headers
        const filteredHeaders = filterGatewayResponseHeaders(response.headers);

        this.logger.debug("ArNS content fetched successfully", {
          gateway: gateway.origin,
          arnsName,
          resolvedTxId,
          latencyMs,
          contentType: response.headers.get("content-type"),
        });

        return {
          response,
          gateway,
          headers: filteredHeaders,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Record failure for the gateway
        if (lastGateway) {
          this.gatewaySelector.recordFailure(lastGateway);
          this.temperatureCache?.recordFailure(lastGateway.origin);
        }

        this.logger.warn("ArNS fetch attempt failed", {
          arnsName,
          gateway: lastGateway?.origin,
          attempt: attempt + 1,
          maxAttempts: this.retryAttempts,
          error: lastError.message,
        });

        // Wait before retry
        if (attempt < this.retryAttempts - 1) {
          await this.delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    // All attempts failed
    throw (
      lastError ||
      new GatewayError(
        lastGateway?.origin || "unknown",
        "All ArNS fetch attempts failed",
      )
    );
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create content fetcher from configuration
 */
export function createContentFetcher(
  gatewaySelector: GatewaySelector,
  config: RouterConfig,
  logger: Logger,
  temperatureCache?: GatewayTemperatureCache,
  httpClient?: HttpClient,
): ContentFetcher {
  return new ContentFetcher({
    gatewaySelector,
    retryAttempts: config.routing.retryAttempts,
    retryDelayMs: config.routing.retryDelayMs,
    requestTimeoutMs: config.http.requestTimeoutMs,
    logger,
    temperatureCache,
    httpClient,
  });
}
