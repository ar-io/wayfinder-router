/**
 * Network Gateway Manager
 *
 * Enterprise-grade service for managing gateway lists from the ar.io network.
 * Provides separate views for routing (all gateways) and verification (top staked).
 *
 * Features:
 * - Fetches all gateways from ar.io network registry
 * - Maintains sorted list by total stake (operator + delegated)
 * - Automatic refresh with configurable interval
 * - Graceful degradation with fallback gateways
 * - Deduplication of concurrent fetches
 * - Stale cache preservation on fetch failures
 */

import { ARIO } from "@ar.io/sdk";
import { createSolanaRpc } from "@solana/kit";
import type { GatewaysProvider } from "@ar.io/wayfinder-core";
import type { Logger } from "../types/index.js";

export interface GatewayInfo {
  url: URL;
  operatorStake: number;
  delegatedStake: number;
  totalStake: number;
  fqdn: string;
}

export interface NetworkGatewayManagerOptions {
  /** How often to refresh gateway lists (default: 24 hours) */
  refreshIntervalMs?: number;
  /** Minimum gateways required to operate */
  minGateways?: number;
  /** Fallback gateways if network fetch fails */
  fallbackGateways?: URL[];
  /** Solana RPC URL for fetching gateway registry */
  solanaRpcUrl?: string;
  /** Logger instance */
  logger: Logger;
}

interface GatewayCache {
  /** All gateways sorted by total stake descending */
  allGateways: GatewayInfo[];
  /** When the cache was last updated */
  fetchedAt: number;
  /** Whether this is from fallback (not live network data) */
  isFallback: boolean;
}

/**
 * Manages gateway lists from the ar.io network.
 * Single source of truth for both routing and verification gateway needs.
 */
export class NetworkGatewayManager {
  private refreshIntervalMs: number;
  private minGateways: number;
  private fallbackGateways: URL[];
  private solanaRpcUrl: string;
  private logger: Logger;

  private cache: GatewayCache | null = null;
  private fetchPromise: Promise<GatewayInfo[]> | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  // Statistics for monitoring
  private stats = {
    fetchAttempts: 0,
    fetchSuccesses: 0,
    fetchFailures: 0,
    lastFetchDurationMs: 0,
    lastError: null as string | null,
  };

  constructor(options: NetworkGatewayManagerOptions) {
    this.refreshIntervalMs = options.refreshIntervalMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.minGateways = options.minGateways ?? 3;
    this.fallbackGateways = options.fallbackGateways ?? [
      new URL("https://turbo-gateway.com"),
      new URL("https://ardrive.net"),
      new URL("https://permagate.io"),
    ];
    this.solanaRpcUrl =
      options.solanaRpcUrl ?? "https://api.mainnet-beta.solana.com";
    this.logger = options.logger;
  }

  /**
   * Initialize the manager by fetching gateways from the network.
   * Should be called on startup before serving requests.
   */
  async initialize(): Promise<void> {
    this.logger.info("Initializing network gateway manager...");

    try {
      await this.fetchGateways();
      this.scheduleRefresh();
      this.isInitialized = true;

      const cache = this.cache!;
      this.logger.info("Network gateway manager initialized", {
        totalGateways: cache.allGateways.length,
        topGateway: cache.allGateways[0]?.fqdn,
        topStake: cache.allGateways[0]?.totalStake,
        isFallback: cache.isFallback,
      });
    } catch (error) {
      // Log error but don't fail - use fallbacks
      this.logger.error("Failed to initialize from network, using fallbacks", {
        error: error instanceof Error ? error.message : String(error),
        fallbackCount: this.fallbackGateways.length,
      });

      // Set up fallback cache
      this.cache = {
        allGateways: this.fallbackGateways.map((url) => ({
          url,
          operatorStake: 0,
          delegatedStake: 0,
          totalStake: 0,
          fqdn: url.hostname,
        })),
        fetchedAt: Date.now(),
        isFallback: true,
      };

      this.isInitialized = true;
      this.scheduleRefresh(); // Still schedule refresh to try again later
    }
  }

  /**
   * Get ALL gateways for routing (sorted by stake, but includes all).
   * Routing can use any gateway since we verify the data anyway.
   */
  async getAllGateways(): Promise<URL[]> {
    await this.ensureInitialized();
    return this.cache!.allGateways.map((g) => g.url);
  }

  /**
   * Get ALL gateways with full info for routing.
   */
  async getAllGatewaysWithInfo(): Promise<GatewayInfo[]> {
    await this.ensureInitialized();
    return [...this.cache!.allGateways];
  }

  /**
   * Get top N staked gateways for verification.
   * These are the most trusted gateways (highest stake = most skin in the game).
   */
  async getTopStakedGateways(count: number): Promise<URL[]> {
    await this.ensureInitialized();
    return this.cache!.allGateways.slice(0, count).map((g) => g.url);
  }

  /**
   * Get top N staked gateways with full info.
   */
  async getTopStakedGatewaysWithInfo(count: number): Promise<GatewayInfo[]> {
    await this.ensureInitialized();
    return this.cache!.allGateways.slice(0, count);
  }

  /**
   * Create a GatewaysProvider for routing (all gateways).
   */
  createRoutingProvider(): GatewaysProvider {
    return {
      getGateways: () => this.getAllGateways(),
    };
  }

  /**
   * Create a GatewaysProvider for verification (top N staked).
   */
  createVerificationProvider(count: number): GatewaysProvider {
    return {
      getGateways: () => this.getTopStakedGateways(count),
    };
  }

  /**
   * Force a refresh of the gateway list.
   */
  async refresh(): Promise<void> {
    this.logger.info("Forcing gateway list refresh");
    await this.fetchGateways();
  }

  /**
   * Get current statistics for monitoring.
   */
  getStats(): {
    initialized: boolean;
    gatewayCount: number;
    cacheAge: number | null;
    isFallback: boolean;
    fetchAttempts: number;
    fetchSuccesses: number;
    fetchFailures: number;
    lastFetchDurationMs: number;
    lastError: string | null;
    nextRefreshMs: number | null;
  } {
    return {
      initialized: this.isInitialized,
      gatewayCount: this.cache?.allGateways.length ?? 0,
      cacheAge: this.cache ? Date.now() - this.cache.fetchedAt : null,
      isFallback: this.cache?.isFallback ?? true,
      ...this.stats,
      nextRefreshMs: this.cache
        ? Math.max(
            0,
            this.refreshIntervalMs - (Date.now() - this.cache.fetchedAt),
          )
        : null,
    };
  }

  /**
   * Stop the refresh timer and cleanup.
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.logger.info("Network gateway manager stopped");
  }

  /**
   * Ensure the manager is initialized before use.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // If cache is empty, try to fetch
    if (!this.cache || this.cache.allGateways.length === 0) {
      await this.fetchGateways();
    }

    // Final fallback
    if (!this.cache || this.cache.allGateways.length === 0) {
      this.cache = {
        allGateways: this.fallbackGateways.map((url) => ({
          url,
          operatorStake: 0,
          delegatedStake: 0,
          totalStake: 0,
          fqdn: url.hostname,
        })),
        fetchedAt: Date.now(),
        isFallback: true,
      };
    }
  }

  /**
   * Fetch gateways from the ar.io network.
   * Deduplicates concurrent requests.
   */
  private async fetchGateways(): Promise<GatewayInfo[]> {
    // Deduplicate concurrent fetches
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.doFetch();

    try {
      return await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }
  }

  /**
   * Perform the actual fetch from ar.io network.
   */
  private async doFetch(): Promise<GatewayInfo[]> {
    const startTime = Date.now();
    this.stats.fetchAttempts++;

    this.logger.debug("Fetching gateways from ar.io network...");

    try {
      const rpc = createSolanaRpc(this.solanaRpcUrl);
      const ario = ARIO.init({ rpc });

      // Fetch ALL gateways (the SDK paginates internally)
      const result = await ario.getGateways({
        limit: 1000,
      });

      if (result.items === undefined || result.items.length === 0) {
        throw new Error("No gateways returned from ar.io network");
      }

      this.logger.debug("Received gateways from network", {
        count: result.items.length,
      });

      // Process and filter gateways
      const gateways: GatewayInfo[] = [];

      for (const gateway of result.items) {
        // Only include joined gateways with valid FQDN
        if (gateway.status !== "joined" || !gateway.settings?.fqdn) {
          continue;
        }

        const operatorStake = gateway.operatorStake || 0;
        const delegatedStake = gateway.totalDelegatedStake || 0;

        try {
          gateways.push({
            url: new URL(`https://${gateway.settings.fqdn}`),
            operatorStake,
            delegatedStake,
            totalStake: operatorStake + delegatedStake,
            fqdn: gateway.settings.fqdn,
          });
        } catch {
          // Skip gateways with invalid URLs
          this.logger.debug("Skipping gateway with invalid FQDN", {
            fqdn: gateway.settings.fqdn,
          });
        }
      }

      // Validate minimum gateways
      if (gateways.length < this.minGateways) {
        throw new Error(
          `Only ${gateways.length} valid gateways found, minimum required is ${this.minGateways}`,
        );
      }

      // Sort by total stake descending
      gateways.sort((a, b) => b.totalStake - a.totalStake);

      // Update cache
      this.cache = {
        allGateways: gateways,
        fetchedAt: Date.now(),
        isFallback: false,
      };

      const durationMs = Date.now() - startTime;
      this.stats.fetchSuccesses++;
      this.stats.lastFetchDurationMs = durationMs;
      this.stats.lastError = null;

      this.logger.info("Gateway list updated from network", {
        totalGateways: gateways.length,
        topGateway: gateways[0]?.fqdn,
        topStake: gateways[0]?.totalStake,
        durationMs,
      });

      return gateways;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.stats.fetchFailures++;
      this.stats.lastFetchDurationMs = durationMs;
      this.stats.lastError = errorMessage;

      this.logger.error("Failed to fetch gateways from network", {
        error: errorMessage,
        durationMs,
        hasStaleCache: this.cache !== null,
      });

      // If we have stale cache, keep using it
      if (this.cache && this.cache.allGateways.length > 0) {
        this.logger.warn("Using stale gateway cache", {
          cacheAge: Date.now() - this.cache.fetchedAt,
          gatewayCount: this.cache.allGateways.length,
        });
        return this.cache.allGateways;
      }

      // Return fallbacks
      this.logger.warn("Using fallback gateways", {
        count: this.fallbackGateways.length,
      });

      const fallbackGateways = this.fallbackGateways.map((url) => ({
        url,
        operatorStake: 0,
        delegatedStake: 0,
        totalStake: 0,
        fqdn: url.hostname,
      }));

      this.cache = {
        allGateways: fallbackGateways,
        fetchedAt: Date.now(),
        isFallback: true,
      };

      return fallbackGateways;
    }
  }

  /**
   * Schedule periodic refresh of the gateway list.
   */
  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    // Refresh slightly before cache would be considered stale
    const refreshInterval = Math.max(this.refreshIntervalMs - 60_000, 60_000);

    this.refreshTimer = setInterval(async () => {
      try {
        this.logger.debug("Scheduled gateway refresh starting");
        await this.fetchGateways();
      } catch (error) {
        this.logger.warn("Scheduled gateway refresh failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, refreshInterval);

    // Don't prevent process exit
    this.refreshTimer.unref();

    this.logger.debug("Gateway refresh scheduled", {
      intervalMs: refreshInterval,
    });
  }
}

/**
 * Create a network gateway manager from configuration.
 */
export function createNetworkGatewayManager(
  options: NetworkGatewayManagerOptions,
): NetworkGatewayManager {
  return new NetworkGatewayManager(options);
}
