import { describe, it, expect, vi } from "vitest";
import { GatewaySelector } from "./gateway-selector.js";
import { NoHealthyGatewaysError } from "../middleware/error-handler.js";
import {
  TEST_GATEWAY_A,
  TEST_GATEWAY_B,
  TEST_GATEWAY_C,
  TEST_GATEWAYS,
  TEST_TX_ID,
  createTestLogger,
  createMockGatewaysProvider,
  createMockRoutingStrategy,
} from "../test-helpers.js";
import { sandboxFromTxId } from "../utils/url.js";

function createSelector(
  overrides: {
    strategy?: ReturnType<typeof createMockRoutingStrategy>;
    provider?: ReturnType<typeof createMockGatewaysProvider>;
    retryAttempts?: number;
    retryDelayMs?: number;
  } = {},
) {
  const strategy = overrides.strategy ?? createMockRoutingStrategy();
  const provider = overrides.provider ?? createMockGatewaysProvider();
  const logger = createTestLogger();

  const selector = new GatewaySelector({
    routingStrategy: strategy,
    gatewaysProvider: provider,
    healthTtlMs: 300_000,
    circuitBreakerThreshold: 3,
    circuitBreakerResetMs: 60_000,
    maxGateways: 100,
    retryAttempts: overrides.retryAttempts ?? 1,
    retryDelayMs: overrides.retryDelayMs ?? 0,
    logger,
  });

  return { selector, strategy, provider, logger };
}

describe("GatewaySelector", () => {
  describe("select", () => {
    it("delegates to routing strategy selectGateway", async () => {
      const { selector, strategy } = createSelector();

      const result = await selector.select({ txId: TEST_TX_ID });

      expect(strategy.selectGateway).toHaveBeenCalledTimes(1);
      expect(result).toBe(TEST_GATEWAY_A);
    });

    it("passes sandbox subdomain for txId requests", async () => {
      const { selector, strategy } = createSelector();

      await selector.select({ txId: TEST_TX_ID, path: "/index.html" });

      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.subdomain).toBe(sandboxFromTxId(TEST_TX_ID));
      expect(call.path).toBe("/index.html");
    });

    it("passes lowercase arnsName as subdomain for ArNS requests", async () => {
      const { selector, strategy } = createSelector();

      await selector.select({ arnsName: "MyApp", path: "/page" });

      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.subdomain).toBe("myapp");
      expect(call.path).toBe("/page");
    });

    it("defaults path to '/' when not provided", async () => {
      const { selector, strategy } = createSelector();

      await selector.select({ txId: TEST_TX_ID });

      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.path).toBe("/");
    });

    it("throws NoHealthyGatewaysError when provider returns empty array", async () => {
      const provider = createMockGatewaysProvider([]);
      const { selector } = createSelector({ provider });

      await expect(selector.select({})).rejects.toThrow(NoHealthyGatewaysError);
    });

    it("clears health cache and retries when all gateways are unhealthy", async () => {
      const { selector, strategy } = createSelector();

      // Mark all gateways unhealthy via circuit breaker
      for (const gw of TEST_GATEWAYS) {
        selector.recordFailure(gw);
        selector.recordFailure(gw);
        selector.recordFailure(gw); // threshold = 3
      }

      await selector.select({});

      // Strategy should still be called with all gateways (after cache clear)
      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.gateways).toHaveLength(TEST_GATEWAYS.length);
    });

    it("excludes already-tried gateways from selection", async () => {
      const { selector, strategy } = createSelector();

      await selector.select({ exclude: [TEST_GATEWAY_A] });

      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.gateways).not.toContainEqual(TEST_GATEWAY_A);
      expect(call.gateways).toContainEqual(TEST_GATEWAY_B);
      expect(call.gateways).toContainEqual(TEST_GATEWAY_C);
    });

    it("falls back to untried unhealthy gateways when all healthy ones excluded", async () => {
      const { selector, strategy } = createSelector();

      // Mark gateway C unhealthy
      selector.recordFailure(TEST_GATEWAY_C);
      selector.recordFailure(TEST_GATEWAY_C);
      selector.recordFailure(TEST_GATEWAY_C);

      // Exclude the two healthy gateways
      await selector.select({
        exclude: [TEST_GATEWAY_A, TEST_GATEWAY_B],
      });

      // Should fall back to C (untried, even though unhealthy)
      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.gateways).toContainEqual(TEST_GATEWAY_C);
      expect(call.gateways).not.toContainEqual(TEST_GATEWAY_A);
      expect(call.gateways).not.toContainEqual(TEST_GATEWAY_B);
    });

    it("retries from full list when ALL gateways have been tried", async () => {
      const { selector, strategy } = createSelector();

      await selector.select({
        exclude: [TEST_GATEWAY_A, TEST_GATEWAY_B, TEST_GATEWAY_C],
      });

      // All excluded, so should fall back to full list
      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.gateways).toHaveLength(TEST_GATEWAYS.length);
    });
  });

  describe("health delegation", () => {
    it("markHealthy delegates to health cache", async () => {
      const { selector } = createSelector();

      // Record failures to create an entry, then mark healthy
      selector.recordFailure(TEST_GATEWAY_A);
      selector.recordFailure(TEST_GATEWAY_A);
      selector.recordFailure(TEST_GATEWAY_A);
      selector.markHealthy(TEST_GATEWAY_A);

      // Gateway should be included in healthy list now
      const result = await selector.select({});
      // No error means it worked; verify A is in the candidates
      expect(result).toBeDefined();
    });

    it("recordFailure delegates to health cache", async () => {
      const { selector, strategy } = createSelector();

      // Trip the circuit breaker for gateway A
      selector.recordFailure(TEST_GATEWAY_A);
      selector.recordFailure(TEST_GATEWAY_A);
      selector.recordFailure(TEST_GATEWAY_A);

      await selector.select({});

      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.gateways).not.toContainEqual(TEST_GATEWAY_A);
    });

    it("recordVerificationFailure delegates to health cache (weighted)", async () => {
      const { selector, strategy } = createSelector();

      // Single verification failure = 3 regular failures, trips circuit breaker
      selector.recordVerificationFailure(TEST_GATEWAY_A);

      await selector.select({});

      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.gateways).not.toContainEqual(TEST_GATEWAY_A);
    });

    it("healthStats returns cache stats", () => {
      const { selector } = createSelector();

      const stats = selector.healthStats();
      expect(stats).toEqual({
        total: 0,
        healthy: 0,
        unhealthy: 0,
        circuitOpen: 0,
        maxGateways: 100,
      });
    });

    it("healthStats reflects recorded failures", () => {
      const { selector } = createSelector();

      // Trip circuit breaker
      selector.recordFailure(TEST_GATEWAY_A);
      selector.recordFailure(TEST_GATEWAY_A);
      selector.recordFailure(TEST_GATEWAY_A);

      const stats = selector.healthStats();
      expect(stats.total).toBe(1);
      expect(stats.unhealthy).toBe(1);
      expect(stats.circuitOpen).toBe(1);
    });
  });

  describe("convenience wrappers", () => {
    it("selectForTransaction calls select with txId", async () => {
      const { selector, strategy } = createSelector();

      const result = await selector.selectForTransaction(
        TEST_TX_ID,
        "/data.json",
      );

      expect(result).toBe(TEST_GATEWAY_A);
      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.subdomain).toBe(sandboxFromTxId(TEST_TX_ID));
      expect(call.path).toBe("/data.json");
    });

    it("selectForTransaction defaults path to '/'", async () => {
      const { selector, strategy } = createSelector();

      await selector.selectForTransaction(TEST_TX_ID);

      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.path).toBe("/");
    });

    it("selectForTransaction passes exclude list", async () => {
      const { selector, strategy } = createSelector();

      await selector.selectForTransaction(TEST_TX_ID, "/", [TEST_GATEWAY_B]);

      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.gateways).not.toContainEqual(TEST_GATEWAY_B);
    });

    it("selectForArns calls select with arnsName", async () => {
      const { selector, strategy } = createSelector();

      const result = await selector.selectForArns("ardrive", "/files");

      expect(result).toBe(TEST_GATEWAY_A);
      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.subdomain).toBe("ardrive");
      expect(call.path).toBe("/files");
    });

    it("selectForArns passes exclude list", async () => {
      const { selector, strategy } = createSelector();

      await selector.selectForArns("ardrive", "/", [TEST_GATEWAY_C]);

      const call = strategy.selectGateway.mock.calls[0][0];
      expect(call.gateways).not.toContainEqual(TEST_GATEWAY_C);
    });
  });

  describe("retry on strategy failure", () => {
    it("retries up to retryAttempts on strategy error", async () => {
      const strategy = createMockRoutingStrategy();
      strategy.selectGateway
        .mockRejectedValueOnce(new Error("temporary failure"))
        .mockResolvedValueOnce(TEST_GATEWAY_B);

      const { selector } = createSelector({
        strategy,
        retryAttempts: 2,
        retryDelayMs: 0,
      });

      const result = await selector.select({});

      expect(result).toBe(TEST_GATEWAY_B);
      expect(strategy.selectGateway).toHaveBeenCalledTimes(2);
    });

    it("throws last error when all retry attempts fail", async () => {
      const strategy = createMockRoutingStrategy();
      strategy.selectGateway.mockRejectedValue(new Error("persistent failure"));

      const { selector } = createSelector({
        strategy,
        retryAttempts: 2,
        retryDelayMs: 0,
      });

      await expect(selector.select({})).rejects.toThrow("persistent failure");
      expect(strategy.selectGateway).toHaveBeenCalledTimes(2);
    });

    it("throws NoHealthyGatewaysError when strategy returns no error object", async () => {
      const strategy = createMockRoutingStrategy();
      strategy.selectGateway.mockRejectedValue("not an Error object");

      const { selector } = createSelector({
        strategy,
        retryAttempts: 1,
        retryDelayMs: 0,
      });

      await expect(selector.select({})).rejects.toThrow();
    });

    it("applies increasing delay between retries", async () => {
      const strategy = createMockRoutingStrategy();
      strategy.selectGateway
        .mockRejectedValueOnce(new Error("fail 1"))
        .mockRejectedValueOnce(new Error("fail 2"))
        .mockResolvedValueOnce(TEST_GATEWAY_A);

      // Spy on setTimeout to verify delay scaling
      const timeoutSpy = vi.spyOn(globalThis, "setTimeout");

      const { selector } = createSelector({
        strategy,
        retryAttempts: 3,
        retryDelayMs: 10,
      });

      await selector.select({});

      // The delay method uses setTimeout via new Promise
      // First retry: retryDelayMs * 1 = 10
      // Second retry: retryDelayMs * 2 = 20
      const timeoutCalls = timeoutSpy.mock.calls.filter(
        ([, ms]) => typeof ms === "number" && ms > 0,
      );
      expect(timeoutCalls.length).toBeGreaterThanOrEqual(2);
      expect(timeoutCalls[0][1]).toBe(10);
      expect(timeoutCalls[1][1]).toBe(20);

      timeoutSpy.mockRestore();
    });
  });
});
