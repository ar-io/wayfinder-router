import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GatewayHealthCache } from "./gateway-health.js";
import {
  createTestLogger,
  TEST_GATEWAY_A,
  TEST_GATEWAY_B,
  TEST_GATEWAY_C,
} from "../test-helpers.js";

describe("GatewayHealthCache", () => {
  let cache: GatewayHealthCache;

  beforeEach(() => {
    cache = new GatewayHealthCache({
      healthTtlMs: 300_000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 60_000,
      logger: createTestLogger(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isHealthy", () => {
    it("returns true for unknown gateways", () => {
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(true);
    });

    it("returns false after reaching failure threshold", () => {
      cache.recordFailure(TEST_GATEWAY_A);
      cache.recordFailure(TEST_GATEWAY_A);
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(true);

      cache.recordFailure(TEST_GATEWAY_A);
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(false);
    });

    it("opens circuit immediately on single verification failure with threshold=3", () => {
      cache.recordVerificationFailure(TEST_GATEWAY_A);
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(false);
    });

    it("returns true after circuit breaker reset time elapses", () => {
      vi.useFakeTimers();

      cache.recordFailure(TEST_GATEWAY_A);
      cache.recordFailure(TEST_GATEWAY_A);
      cache.recordFailure(TEST_GATEWAY_A);
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(false);

      vi.advanceTimersByTime(60_001);
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(true);
    });

    it("returns true when health TTL expires and deletes the record", () => {
      vi.useFakeTimers();

      // Record a single failure (below threshold, still healthy but tracked)
      cache.recordFailure(TEST_GATEWAY_A);

      vi.advanceTimersByTime(300_001);
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(true);

      // Record should have been deleted, so stats show 0 total
      expect(cache.stats().total).toBe(0);
    });
  });

  describe("markHealthy", () => {
    it("resets failures and closes circuit", () => {
      cache.recordFailure(TEST_GATEWAY_A);
      cache.recordFailure(TEST_GATEWAY_A);
      cache.recordFailure(TEST_GATEWAY_A);
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(false);

      cache.markHealthy(TEST_GATEWAY_A);
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(true);
    });
  });

  describe("markUnhealthy", () => {
    it("explicitly opens circuit", () => {
      cache.markUnhealthy(TEST_GATEWAY_A);
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(false);
    });

    it("respects custom duration", () => {
      vi.useFakeTimers();

      cache.markUnhealthy(TEST_GATEWAY_A, 10_000);
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(false);

      vi.advanceTimersByTime(10_001);
      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(true);
    });
  });

  describe("filterHealthy", () => {
    it("correctly partitions a gateway list", () => {
      cache.markUnhealthy(TEST_GATEWAY_B);

      const healthy = cache.filterHealthy([
        TEST_GATEWAY_A,
        TEST_GATEWAY_B,
        TEST_GATEWAY_C,
      ]);

      expect(healthy).toContain(TEST_GATEWAY_A);
      expect(healthy).not.toContain(TEST_GATEWAY_B);
      expect(healthy).toContain(TEST_GATEWAY_C);
      expect(healthy).toHaveLength(2);
    });
  });

  describe("clear", () => {
    it("resets everything", () => {
      cache.markUnhealthy(TEST_GATEWAY_A);
      cache.recordFailure(TEST_GATEWAY_B);
      cache.recordFailure(TEST_GATEWAY_B);
      cache.recordFailure(TEST_GATEWAY_B);

      cache.clear();

      expect(cache.isHealthy(TEST_GATEWAY_A)).toBe(true);
      expect(cache.isHealthy(TEST_GATEWAY_B)).toBe(true);
      expect(cache.stats().total).toBe(0);
    });
  });

  describe("stats", () => {
    it("returns accurate counts", () => {
      cache.markUnhealthy(TEST_GATEWAY_A);
      cache.recordFailure(TEST_GATEWAY_B);
      cache.recordFailure(TEST_GATEWAY_B);
      cache.recordFailure(TEST_GATEWAY_B);
      // Gateway C is unknown, not tracked

      const s = cache.stats();
      expect(s.total).toBe(2);
      expect(s.unhealthy).toBe(2);
      expect(s.healthy).toBe(0);
      expect(s.circuitOpen).toBe(2);
      expect(s.maxGateways).toBe(1000);
    });
  });

  describe("pruning", () => {
    it("removes entries older than 2x TTL", () => {
      vi.useFakeTimers();

      const shortCache = new GatewayHealthCache({
        healthTtlMs: 1000,
        circuitBreakerThreshold: 3,
        circuitBreakerResetMs: 500,
        logger: createTestLogger(),
      });

      // Record failures to create tracked entries
      shortCache.recordFailure(TEST_GATEWAY_A);

      // Advance past 2x TTL (2000ms) and past the prune interval (1000ms)
      vi.advanceTimersByTime(2001);

      // Trigger a new failure to invoke maybePrune
      shortCache.recordFailure(TEST_GATEWAY_B);

      // Gateway A should have been pruned (stale), gateway B is fresh
      expect(shortCache.stats().total).toBe(1);
    });

    it("enforces max gateway limit with priority-based eviction", () => {
      vi.useFakeTimers();

      const smallCache = new GatewayHealthCache({
        healthTtlMs: 1000,
        circuitBreakerThreshold: 3,
        circuitBreakerResetMs: 60_000,
        maxGateways: 2,
        logger: createTestLogger(),
      });

      // First call to markUnhealthy triggers maybePrune (lastPruneTime=0),
      // but map is empty, so nothing happens. Then A is added as unhealthy.
      smallCache.markUnhealthy(TEST_GATEWAY_A);
      // Subsequent calls within healthTtlMs skip prune entirely.
      smallCache.recordFailure(TEST_GATEWAY_B);
      smallCache.recordFailure(TEST_GATEWAY_C);

      expect(smallCache.stats().total).toBe(3);

      // Advance past prune interval so next operation triggers maybePrune
      vi.advanceTimersByTime(1001);

      // Update existing gateway A (high priority - circuit open).
      // maybePrune runs first and sees 3 > maxGateways(2), evicts 1.
      // B and C have priority 1 (healthy with failures), A has priority 3.
      // Oldest low-priority entry (B) is evicted first.
      // Then A is updated in place. Final count: 2.
      smallCache.recordFailure(TEST_GATEWAY_A);

      expect(smallCache.stats().total).toBe(2);
      // High-priority gateway A was kept
      expect(smallCache.isHealthy(TEST_GATEWAY_A)).toBe(false);
    });
  });
});
