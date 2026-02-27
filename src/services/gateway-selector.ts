/**
 * Gateway Selector Service
 * Smart gateway selection with health tracking and circuit breaker
 */

import type {
  RoutingStrategy as SdkRoutingStrategy,
  GatewaysProvider,
} from "@ar.io/wayfinder-core";

import type { Logger, RouterConfig } from "../types/index.js";
import { GatewayHealthCache } from "../cache/gateway-health.js";
import { NoHealthyGatewaysError } from "../middleware/error-handler.js";
import { sandboxFromTxId } from "../utils/url.js";

export interface GatewaySelectorOptions {
  routingStrategy: SdkRoutingStrategy;
  gatewaysProvider: GatewaysProvider;
  healthTtlMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
  /** Maximum entries in gateway health cache (prevents memory leaks) */
  maxGateways: number;
  retryAttempts: number;
  retryDelayMs: number;
  logger: Logger;
}

export interface SelectGatewayParams {
  txId?: string;
  arnsName?: string;
  path?: string;
  /** Gateways to exclude from selection (e.g., already tried) */
  exclude?: URL[];
}

export class GatewaySelector {
  private routingStrategy: SdkRoutingStrategy;
  private gatewaysProvider: GatewaysProvider;
  private healthCache: GatewayHealthCache;
  private retryAttempts: number;
  private retryDelayMs: number;
  private logger: Logger;

  constructor(options: GatewaySelectorOptions) {
    this.routingStrategy = options.routingStrategy;
    this.gatewaysProvider = options.gatewaysProvider;
    this.retryAttempts = options.retryAttempts;
    this.retryDelayMs = options.retryDelayMs;
    this.logger = options.logger;

    this.healthCache = new GatewayHealthCache({
      healthTtlMs: options.healthTtlMs,
      circuitBreakerThreshold: options.circuitBreakerThreshold,
      circuitBreakerResetMs: options.circuitBreakerResetMs,
      maxGateways: options.maxGateways,
      logger: options.logger,
    });
  }

  /**
   * Select a healthy gateway for the request
   */
  async select(params: SelectGatewayParams): Promise<URL> {
    const { txId, arnsName, path, exclude } = params;

    // Get all available gateways
    const allGateways = await this.gatewaysProvider.getGateways();

    if (allGateways.length === 0) {
      throw new NoHealthyGatewaysError();
    }

    // Filter to healthy gateways
    let healthyGateways = this.healthCache.filterHealthy(allGateways);

    // If no healthy gateways, clear cache and try all
    if (healthyGateways.length === 0) {
      this.logger.warn(
        "All gateways marked unhealthy, clearing health cache and retrying",
      );
      this.healthCache.clear();
      healthyGateways = allGateways;
    }

    // Exclude already-tried gateways (for retry scenarios)
    if (exclude && exclude.length > 0) {
      const excludeSet = new Set(exclude.map((url) => url.toString()));
      const beforeExclude = healthyGateways.length;
      healthyGateways = healthyGateways.filter(
        (gw) => !excludeSet.has(gw.toString()),
      );
      if (healthyGateways.length < beforeExclude) {
        this.logger.debug("Excluded already-tried gateways", {
          excluded: exclude.length,
          remainingHealthy: healthyGateways.length,
        });
      }

      // If all healthy gateways were excluded, fall back to untried gateways
      // (including unhealthy ones - better to try than give up entirely)
      if (healthyGateways.length === 0) {
        this.logger.warn(
          "All healthy gateways already tried, falling back to untried gateways",
        );
        healthyGateways = allGateways.filter(
          (gw) => !excludeSet.has(gw.toString()),
        );
        // If all gateways were tried, use all gateways as last resort
        if (healthyGateways.length === 0) {
          this.logger.warn("All gateways exhausted, retrying from full list");
          healthyGateways = allGateways;
        }
      }
    }

    // Compute subdomain for routing
    const subdomain = txId ? sandboxFromTxId(txId) : arnsName?.toLowerCase();

    this.logger.debug("Selecting gateway", {
      totalGateways: allGateways.length,
      healthyGateways: healthyGateways.length,
      excluded: exclude?.length || 0,
      subdomain,
      path,
    });

    // Try to select a working gateway with retries
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const gateway = await this.routingStrategy.selectGateway({
          gateways: healthyGateways,
          path: path || "/",
          subdomain,
        });

        this.logger.debug("Gateway selected", {
          gateway: gateway.origin,
          attempt: attempt + 1,
        });

        return gateway;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        this.logger.warn("Gateway selection attempt failed", {
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
    throw lastError || new NoHealthyGatewaysError();
  }

  /**
   * Select a gateway specifically for a transaction ID
   */
  async selectForTransaction(
    txId: string,
    path: string = "/",
    exclude?: URL[],
  ): Promise<URL> {
    return this.select({ txId, path, exclude });
  }

  /**
   * Select a gateway specifically for an ArNS name
   */
  async selectForArns(
    arnsName: string,
    path: string = "/",
    exclude?: URL[],
  ): Promise<URL> {
    return this.select({ arnsName, path, exclude });
  }

  /**
   * Mark a gateway as healthy after successful use
   */
  markHealthy(gateway: URL): void {
    this.healthCache.markHealthy(gateway);
  }

  /**
   * Record a failure for a gateway
   */
  recordFailure(gateway: URL): void {
    this.healthCache.recordFailure(gateway);
  }

  /**
   * Record a verification failure for a gateway.
   * Verification failures are weighted more heavily than regular failures
   * because they may indicate malicious behavior (serving wrong content).
   */
  recordVerificationFailure(gateway: URL): void {
    this.healthCache.recordVerificationFailure(gateway);
  }

  /**
   * Explicitly mark a gateway as unhealthy
   */
  markUnhealthy(gateway: URL, durationMs?: number): void {
    this.healthCache.markUnhealthy(gateway, durationMs);
  }

  /**
   * Get health statistics
   */
  healthStats() {
    return this.healthCache.stats();
  }

  /**
   * Clear health cache
   */
  clearHealthCache(): void {
    this.healthCache.clear();
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create gateway selector from services and configuration
 */
export function createGatewaySelector(
  routingStrategy: SdkRoutingStrategy,
  gatewaysProvider: GatewaysProvider,
  config: RouterConfig,
  logger: Logger,
): GatewaySelector {
  return new GatewaySelector({
    routingStrategy,
    gatewaysProvider,
    healthTtlMs: config.resilience.gatewayHealthTtlMs,
    circuitBreakerThreshold: config.resilience.circuitBreakerThreshold,
    circuitBreakerResetMs: config.resilience.circuitBreakerResetMs,
    maxGateways: config.resilience.gatewayHealthMaxEntries,
    retryAttempts: config.routing.retryAttempts,
    retryDelayMs: config.routing.retryDelayMs,
    logger,
  });
}
