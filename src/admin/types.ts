/**
 * Admin UI Types
 */

import type { Logger, RouterConfig } from "../types/index.js";
import type { GatewaySelector } from "../services/gateway-selector.js";
import type { TelemetryService } from "../telemetry/service.js";
import type { ContentCache } from "../cache/content-cache.js";
import type { GatewayPingService } from "../services/gateway-ping-service.js";
import type { BlocklistService } from "../moderation/blocklist-service.js";
import type { WayfinderServices } from "../services/wayfinder-client.js";

export interface AdminDeps {
  config: RouterConfig;
  logger: Logger;
  version: string;
  startTime: number;
  gatewaySelector: GatewaySelector;
  telemetryService: TelemetryService | null;
  contentCache: ContentCache;
  pingService: GatewayPingService | null;
  blocklistService: BlocklistService | null;
  wayfinderServices: WayfinderServices;
  onRestart?: () => void;
}

export interface AdminConfig {
  enabled: boolean;
  port: number;
  host: string;
  token: string;
}
