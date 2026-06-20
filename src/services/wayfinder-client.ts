/**
 * Wayfinder SDK client wrapper
 * Provides a configured instance of the Wayfinder Core SDK
 *
 * Supports split gateway configuration:
 * - Routing: Can use any gateway (network, trusted-peers, static) since data is verified
 * - Verification: Uses only trusted gateways (top-staked or static) for hash verification
 */

import {
  TrustedPeersGatewaysProvider,
  SimpleCacheGatewaysProvider,
  FastestPingRoutingStrategy,
  RandomRoutingStrategy,
  RoundRobinRoutingStrategy,
  HashVerificationStrategy,
  type GatewaysProvider,
  type RoutingStrategy as SdkRoutingStrategy,
  type VerificationStrategy as SdkVerificationStrategy,
  type DataStream,
} from "@ar.io/wayfinder-core";

import type { RouterConfig, Logger, RoutingStrategy } from "../types/index.js";
import { NetworkGatewayManager } from "./network-gateway-manager.js";
import { GatewayTemperatureCache } from "../cache/gateway-temperature.js";
import { GatewayHealthCache } from "../cache/gateway-health.js";
import { TemperatureRoutingStrategy } from "./routing-strategies/temperature-strategy.js";

export interface WayfinderServices {
  /** Provider for routing gateways (where to fetch data) */
  routingGatewaysProvider: GatewaysProvider;
  /** Provider for verification gateways (who to trust for hashes) */
  verificationGatewaysProvider: GatewaysProvider | null;
  /** Routing strategy instance */
  routingStrategy: SdkRoutingStrategy;
  /** Verification strategy instance */
  verificationStrategy: SdkVerificationStrategy | null;
  /** Network gateway manager (if using network sources) */
  networkGatewayManager: NetworkGatewayManager | null;
  /** Gateway temperature cache for performance tracking (if using temperature strategy) */
  temperatureCache: GatewayTemperatureCache | null;
}

/**
 * Create a logger adapter for the Wayfinder SDK
 */
function createSdkLogger(logger: Logger) {
  return {
    debug: (msg: string, ...args: unknown[]) => logger.debug(msg, ...args),
    info: (msg: string, ...args: unknown[]) => logger.info(msg, ...args),
    warn: (msg: string, ...args: unknown[]) => logger.warn(msg, ...args),
    error: (msg: string, ...args: unknown[]) => logger.error(msg, ...args),
  };
}

/**
 * Create routing gateways provider based on configuration.
 * Routing can use any gateway since we verify the data anyway.
 */
function createRoutingGatewaysProvider(
  config: RouterConfig,
  logger: Logger,
  networkManager: NetworkGatewayManager | null,
): GatewaysProvider {
  const sdkLogger = createSdkLogger(logger);

  switch (config.routing.gatewaySource) {
    case "network": {
      if (!networkManager) {
        throw new Error(
          "Network gateway manager required for network routing source",
        );
      }
      // Use ALL gateways from network for routing (sorted by stake, but not filtered)
      return networkManager.createRoutingProvider();
    }

    case "trusted-peers": {
      const baseProvider = new TrustedPeersGatewaysProvider({
        trustedGateway: config.routing.trustedPeerGateway,
        logger: sdkLogger,
      });

      // Wrap with caching (convert ms to seconds)
      return new SimpleCacheGatewaysProvider({
        gatewaysProvider: baseProvider,
        ttlSeconds: Math.floor(config.resilience.gatewayHealthTtlMs / 1000),
        logger: sdkLogger,
      });
    }

    case "static": {
      return {
        getGateways: async () => config.routing.staticGateways,
      };
    }

    case "trusted-ario": {
      // Trusted ar.io gateways - bypasses network/peer discovery
      // Uses the configured TRUSTED_ARIO_GATEWAYS directly
      logger.info("Using trusted ar.io gateways for routing", {
        gatewayCount: config.routing.trustedArioGateways.length,
        gateways: config.routing.trustedArioGateways.map((g) => g.hostname),
      });
      return {
        getGateways: async () => config.routing.trustedArioGateways,
      };
    }

    default:
      throw new Error(
        `Unknown routing gateway source: ${config.routing.gatewaySource}`,
      );
  }
}

/**
 * Create verification gateways provider based on configuration.
 * Verification requires trusted gateways (high stake = more skin in the game).
 */
function createVerificationGatewaysProvider(
  config: RouterConfig,
  _logger: Logger,
  networkManager: NetworkGatewayManager | null,
): GatewaysProvider | null {
  if (!config.verification.enabled) {
    return null;
  }

  switch (config.verification.gatewaySource) {
    case "top-staked": {
      if (!networkManager) {
        throw new Error(
          "Network gateway manager required for top-staked verification source",
        );
      }
      // Use top N staked gateways for verification
      return networkManager.createVerificationProvider(
        config.verification.gatewayCount,
      );
    }

    case "static": {
      return {
        getGateways: async () => config.verification.staticGateways,
      };
    }

    default:
      throw new Error(
        `Unknown verification gateway source: ${config.verification.gatewaySource}`,
      );
  }
}

/**
 * Create routing strategy based on configuration
 */
function createRoutingStrategy(
  strategy: RoutingStrategy,
  gatewaysProvider: GatewaysProvider,
  logger: Logger,
  temperatureCache: GatewayTemperatureCache | null,
  healthCache: GatewayHealthCache | null,
): SdkRoutingStrategy {
  const sdkLogger = createSdkLogger(logger);

  switch (strategy) {
    case "fastest":
      return new FastestPingRoutingStrategy({
        gatewaysProvider,
        logger: sdkLogger,
        timeoutMs: 1000,
        maxConcurrency: 10,
      });

    case "random":
      return new RandomRoutingStrategy({
        gatewaysProvider,
        logger: sdkLogger,
      });

    case "round-robin":
      return new RoundRobinRoutingStrategy({
        gatewaysProvider,
      });

    case "temperature":
      if (!temperatureCache) {
        throw new Error("Temperature cache required for temperature strategy");
      }
      return new TemperatureRoutingStrategy({
        gatewaysProvider,
        temperatureCache,
        healthCache: healthCache ?? undefined,
        logger,
      });

    default:
      throw new Error(`Unknown routing strategy: ${strategy}`);
  }
}

/**
 * Create verification strategy based on configuration.
 * Uses the verification gateways provider for trusted hash verification.
 */
function createVerificationStrategy(
  config: RouterConfig,
  verificationProvider: GatewaysProvider | null,
  logger: Logger,
): SdkVerificationStrategy | null {
  if (!config.verification.enabled || !verificationProvider) {
    return null;
  }

  const sdkLogger = createSdkLogger(logger);

  // Use dynamic wrapper around SDK's HashVerificationStrategy
  // This fetches gateways from the provider on each verification
  return new DynamicHashVerificationStrategy({
    gatewaysProvider: verificationProvider,
    logger: sdkLogger,
  });
}

/**
 * Dynamic wrapper around SDK's HashVerificationStrategy.
 *
 * The SDK's HashVerificationStrategy takes static trustedGateways in the constructor,
 * but we need dynamic gateways from a provider (e.g., top-staked from network).
 *
 * This wrapper:
 * 1. Fetches current gateways from the provider on each verification
 * 2. Creates a HashVerificationStrategy with those gateways
 * 3. Delegates verification to the SDK's implementation
 *
 * The SDK's HashVerificationStrategy handles:
 * - HEAD -> GET -> HEAD pattern to hydrate gateway cache if needed
 * - Proper sandbox subdomain URL construction
 * - Hash comparison and error handling
 */
class DynamicHashVerificationStrategy implements SdkVerificationStrategy {
  private gatewaysProvider: GatewaysProvider;
  private logger: ReturnType<typeof createSdkLogger>;
  private _cachedGateways: URL[] = [];

  // Required by VerificationStrategy interface - returns cached gateways
  get trustedGateways(): URL[] {
    return this._cachedGateways;
  }

  constructor(options: {
    gatewaysProvider: GatewaysProvider;
    logger: ReturnType<typeof createSdkLogger>;
  }) {
    this.gatewaysProvider = options.gatewaysProvider;
    this.logger = options.logger;
  }

  async verifyData(params: {
    data: DataStream;
    txId: string;
    headers: Record<string, string>;
  }): Promise<void> {
    const { data, txId } = params;

    // Get current trusted gateways from the provider
    const gateways = await this.gatewaysProvider.getGateways();

    if (gateways.length === 0) {
      throw new Error("No trusted gateways available for verification");
    }

    // Cache gateways for the trustedGateways getter
    this._cachedGateways = gateways;

    this.logger.debug("Using SDK HashVerificationStrategy", {
      txId,
      gatewayCount: gateways.length,
      gateways: gateways.map((g) => g.toString()),
    });

    // Create SDK's HashVerificationStrategy with current gateways
    const sdkStrategy = new HashVerificationStrategy({
      trustedGateways: gateways,
      maxConcurrency: 3,
      logger: this.logger,
    });

    // Delegate to SDK's implementation
    await sdkStrategy.verifyData({ data, txId });
  }
}

/**
 * Check if network gateway manager is needed based on configuration.
 */
function needsNetworkManager(config: RouterConfig): boolean {
  return (
    config.routing.gatewaySource === "network" ||
    config.verification.gatewaySource === "top-staked"
  );
}

/**
 * Create network gateway manager if needed.
 * Call initialize() on the returned manager before using.
 */
export function createNetworkManager(
  config: RouterConfig,
  logger: Logger,
): NetworkGatewayManager | null {
  if (!needsNetworkManager(config)) {
    return null;
  }

  return new NetworkGatewayManager({
    refreshIntervalMs: config.networkGateways.refreshIntervalMs,
    minGateways: config.networkGateways.minGateways,
    fallbackGateways: config.networkGateways.fallbackGateways,
    solanaRpcUrl: config.networkGateways.solanaRpcUrl,
    logger,
  });
}

/**
 * Initialize Wayfinder SDK services.
 * The networkManager must be initialized before calling this function.
 */
export function createWayfinderServices(
  config: RouterConfig,
  logger: Logger,
  networkManager: NetworkGatewayManager | null,
  healthCache?: GatewayHealthCache,
): WayfinderServices {
  // Create routing gateways provider
  const routingGatewaysProvider = createRoutingGatewaysProvider(
    config,
    logger,
    networkManager,
  );

  // Create verification gateways provider (separate from routing)
  const verificationGatewaysProvider = createVerificationGatewaysProvider(
    config,
    logger,
    networkManager,
  );

  // Create temperature cache if using temperature strategy
  const temperatureCache =
    config.routing.strategy === "temperature"
      ? new GatewayTemperatureCache({
          windowMs: config.routing.temperatureWindowMs,
          maxSamples: config.routing.temperatureMaxSamples,
          logger,
        })
      : null;

  // Create routing strategy
  const routingStrategy = createRoutingStrategy(
    config.routing.strategy,
    routingGatewaysProvider,
    logger,
    temperatureCache,
    healthCache ?? null,
  );

  // Create verification strategy
  const verificationStrategy = createVerificationStrategy(
    config,
    verificationGatewaysProvider,
    logger,
  );

  logger.info("Wayfinder services initialized", {
    routingGatewaySource: config.routing.gatewaySource,
    verificationGatewaySource: config.verification.gatewaySource,
    routingStrategy: config.routing.strategy,
    verificationEnabled: config.verification.enabled,
    verificationGatewayCount:
      config.verification.gatewaySource === "top-staked"
        ? config.verification.gatewayCount
        : config.verification.staticGateways.length,
    usesNetworkManager: networkManager !== null,
    hasTemperatureCache: temperatureCache !== null,
  });

  return {
    routingGatewaysProvider,
    verificationGatewaysProvider,
    routingStrategy,
    verificationStrategy,
    networkGatewayManager: networkManager,
    temperatureCache,
  };
}
