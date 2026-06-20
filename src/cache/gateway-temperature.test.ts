import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GatewayTemperatureCache } from "./gateway-temperature.js";
import {
  createTestLogger,
  TEST_GATEWAY_A,
  TEST_GATEWAY_B,
  TEST_GATEWAY_C,
} from "../test-helpers.js";

describe("GatewayTemperatureCache", () => {
  let cache: GatewayTemperatureCache;

  beforeEach(() => {
    cache = new GatewayTemperatureCache({
      logger: createTestLogger(),
      windowMs: 5 * 60 * 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getScore", () => {
    it("returns default score (50) for unknown gateways", () => {
      expect(cache.getScore("https://unknown.example.com")).toBe(50);
    });
  });

  describe("recordSuccess", () => {
    it("increases score for low latency (<100ms)", () => {
      const gw = TEST_GATEWAY_A.toString();
      // Record several fast successes
      for (let i = 0; i < 5; i++) {
        cache.recordSuccess(gw, 50);
      }
      const score = cache.getScore(gw);
      expect(score).toBeGreaterThan(50);
    });

    it("decreases score for high latency (>1000ms)", () => {
      const gw = TEST_GATEWAY_A.toString();
      for (let i = 0; i < 5; i++) {
        cache.recordSuccess(gw, 2000);
      }
      const score = cache.getScore(gw);
      expect(score).toBeLessThan(50);
    });
  });

  describe("recordFailure", () => {
    it("decreases success rate, lowering score", () => {
      const gw = TEST_GATEWAY_A.toString();
      // Record some successes with moderate latency
      for (let i = 0; i < 5; i++) {
        cache.recordSuccess(gw, 300);
      }
      const scoreBeforeFailures = cache.getScore(gw);

      // Now record many failures
      for (let i = 0; i < 10; i++) {
        cache.recordFailure(gw);
      }
      const scoreAfterFailures = cache.getScore(gw);
      expect(scoreAfterFailures).toBeLessThan(scoreBeforeFailures);
    });
  });

  describe("score clamping", () => {
    it("clamps score to minimum 1, never 0", () => {
      const gw = TEST_GATEWAY_A.toString();
      // Drive score as low as possible: many failures + high latency
      for (let i = 0; i < 20; i++) {
        cache.recordSuccess(gw, 5000);
      }
      for (let i = 0; i < 50; i++) {
        cache.recordFailure(gw);
      }
      const score = cache.getScore(gw);
      expect(score).toBeGreaterThanOrEqual(1);
    });

    it("clamps score to maximum 100", () => {
      const gw = TEST_GATEWAY_A.toString();
      for (let i = 0; i < 50; i++) {
        cache.recordSuccess(gw, 10);
      }
      cache.recordPing(gw, 10);
      const score = cache.getScore(gw);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe("selectWeighted", () => {
    it("returns the single gateway when array has one entry", () => {
      const result = cache.selectWeighted([TEST_GATEWAY_A]);
      expect(result).toBe(TEST_GATEWAY_A);
    });

    it("throws on empty array", () => {
      expect(() => cache.selectWeighted([])).toThrow(
        "No gateways to select from",
      );
    });

    it("statistically favors higher-scored gateways", () => {
      const gwA = TEST_GATEWAY_A;
      const gwB = TEST_GATEWAY_B;

      // Make gateway A fast (score ~85)
      for (let i = 0; i < 20; i++) {
        cache.recordSuccess(gwA.toString(), 50);
      }
      // Make gateway B slow (score ~20)
      for (let i = 0; i < 10; i++) {
        cache.recordSuccess(gwB.toString(), 2000);
      }
      for (let i = 0; i < 10; i++) {
        cache.recordFailure(gwB.toString());
      }

      let aCount = 0;
      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        const selected = cache.selectWeighted([gwA, gwB]);
        if (selected === gwA) aCount++;
      }

      // Gateway A should be selected >60% of the time
      expect(aCount / iterations).toBeGreaterThan(0.6);
    });
  });

  describe("recordPing", () => {
    it("boosts score with fast ping latency", () => {
      const gw = TEST_GATEWAY_A.toString();
      const scoreBefore = cache.getScore(gw);
      cache.recordPing(gw, 20);
      const scoreAfter = cache.getScore(gw);
      expect(scoreAfter).toBeGreaterThan(scoreBefore);
    });
  });

  describe("ping staleness", () => {
    it("ignores ping data older than 8 hours", () => {
      vi.useFakeTimers();
      const gw = TEST_GATEWAY_A.toString();

      cache.recordPing(gw, 20);
      const scoreWithPing = cache.getScore(gw);
      expect(scoreWithPing).toBeGreaterThan(50);

      // Advance time past 8 hours
      vi.advanceTimersByTime(8 * 60 * 60 * 1000 + 1);

      const scoreAfterStale = cache.getScore(gw);
      expect(scoreAfterStale).toBe(50);
    });
  });

  describe("stale data", () => {
    it("resets counters when data is outside the window", () => {
      vi.useFakeTimers();
      const gw = TEST_GATEWAY_A.toString();

      for (let i = 0; i < 10; i++) {
        cache.recordSuccess(gw, 50);
      }
      const scoreFresh = cache.getScore(gw);
      expect(scoreFresh).toBeGreaterThan(50);

      // Advance past the 5-minute window
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Score should revert to default after cleanup
      const scoreStale = cache.getScore(gw);
      expect(scoreStale).toBe(50);
    });
  });

  describe("getGatewayScore", () => {
    it("returns detailed scoring info", () => {
      const gw = TEST_GATEWAY_A.toString();
      cache.recordSuccess(gw, 100);
      cache.recordSuccess(gw, 200);
      cache.recordFailure(gw);
      cache.recordPing(gw, 50);

      const info = cache.getGatewayScore(gw);
      expect(info.gateway).toBe(gw);
      expect(info.score).toBeGreaterThan(0);
      expect(info.avgLatencyMs).toBe(150);
      expect(info.successRate).toBeCloseTo(2 / 3);
      expect(info.requestCount).toBe(3);
      expect(info.pingLatencyMs).toBe(50);
    });

    it("returns defaults for unknown gateway", () => {
      const info = cache.getGatewayScore("https://unknown.example.com");
      expect(info.score).toBe(50);
      expect(info.avgLatencyMs).toBeNull();
      expect(info.p95LatencyMs).toBeNull();
      expect(info.successRate).toBeNull();
      expect(info.requestCount).toBe(0);
      expect(info.pingLatencyMs).toBeNull();
    });
  });

  describe("getAllScores", () => {
    it("returns scores sorted by score descending", () => {
      // Fast gateway
      for (let i = 0; i < 10; i++) {
        cache.recordSuccess(TEST_GATEWAY_A.toString(), 50);
      }
      // Slow gateway
      for (let i = 0; i < 10; i++) {
        cache.recordSuccess(TEST_GATEWAY_B.toString(), 2000);
      }
      // Medium gateway
      for (let i = 0; i < 10; i++) {
        cache.recordSuccess(TEST_GATEWAY_C.toString(), 300);
      }

      const scores = cache.getAllScores();
      expect(scores.length).toBe(3);
      expect(scores[0].score).toBeGreaterThanOrEqual(scores[1].score);
      expect(scores[1].score).toBeGreaterThanOrEqual(scores[2].score);
      expect(scores[0].gateway).toBe(TEST_GATEWAY_A.toString());
    });
  });

  describe("stats", () => {
    it("returns correct counts", () => {
      cache.recordSuccess(TEST_GATEWAY_A.toString(), 100);
      cache.recordSuccess(TEST_GATEWAY_A.toString(), 200);
      cache.recordSuccess(TEST_GATEWAY_B.toString(), 150);

      const s = cache.stats();
      expect(s.gatewayCount).toBe(2);
      expect(s.totalSamples).toBe(3);
      expect(s.windowMs).toBe(5 * 60 * 1000);
    });
  });

  describe("clear", () => {
    it("resets everything", () => {
      cache.recordSuccess(TEST_GATEWAY_A.toString(), 100);
      cache.recordSuccess(TEST_GATEWAY_B.toString(), 200);
      cache.recordPing(TEST_GATEWAY_C.toString(), 50);

      cache.clear();

      const s = cache.stats();
      expect(s.gatewayCount).toBe(0);
      expect(s.totalSamples).toBe(0);

      expect(cache.getScore(TEST_GATEWAY_A.toString())).toBe(50);
      expect(cache.getAllScores()).toEqual([]);
    });
  });

  describe("pruning", () => {
    it("removes stale gateways after 2x window", () => {
      vi.useFakeTimers();

      const shortCache = new GatewayTemperatureCache({
        windowMs: 1000,
        logger: createTestLogger(),
      });

      // Record data for two gateways
      shortCache.recordSuccess(TEST_GATEWAY_A.toString(), 100);
      shortCache.recordSuccess(TEST_GATEWAY_B.toString(), 200);
      expect(shortCache.stats().gatewayCount).toBe(2);

      // Advance past 2x window (2000ms) so entries become stale
      vi.advanceTimersByTime(2001);

      // Pruning happens during record operations; trigger it
      shortCache.recordSuccess(TEST_GATEWAY_C.toString(), 100);

      // A and B should have been pruned (stale beyond 2x window)
      // Only C should remain
      expect(shortCache.stats().gatewayCount).toBe(1);
      expect(shortCache.getScore(TEST_GATEWAY_A.toString())).toBe(50);
      expect(shortCache.getScore(TEST_GATEWAY_B.toString())).toBe(50);
    });
  });
});
