/**
 * Shared test helpers for wayfinder-router tests
 */

import { vi } from "vitest";
import type { Logger } from "./types/index.js";

// --- Standard test fixtures ---

export const TEST_GATEWAY_A = new URL("https://gw-a.example.com");
export const TEST_GATEWAY_B = new URL("https://gw-b.example.com");
export const TEST_GATEWAY_C = new URL("https://gw-c.example.com");
export const TEST_GATEWAYS = [TEST_GATEWAY_A, TEST_GATEWAY_B, TEST_GATEWAY_C];

// Valid base64url 43-char Arweave transaction ID
export const TEST_TX_ID = "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA";
export const TEST_TX_ID_2 = "bNbA3TEQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_U";

// --- Mock factories ---

export function createTestLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    fatal: vi.fn(),
  } as unknown as Logger;
}

export function createMockGatewaysProvider(gateways: URL[] = TEST_GATEWAYS) {
  return {
    getGateways: vi.fn().mockResolvedValue(gateways),
  };
}

export function createMockRoutingStrategy(gateway: URL = TEST_GATEWAY_A) {
  return {
    selectGateway: vi.fn().mockResolvedValue(gateway),
  };
}

export function createMockVerificationStrategy(shouldPass: boolean = true) {
  return {
    trustedGateways: [TEST_GATEWAY_A],
    verifyData: shouldPass
      ? vi.fn().mockResolvedValue(undefined)
      : vi.fn().mockRejectedValue(new Error("Verification failed")),
  };
}
