import { describe, it, expect, beforeEach } from "vitest";
import { ArnsCache } from "./arns-cache.js";
import { createTestLogger, TEST_TX_ID, TEST_TX_ID_2 } from "../test-helpers.js";
import type { ArnsResolution } from "../types/index.js";

function makeResolution(txId: string, ttlMs: number = 0): ArnsResolution {
  return { txId, ttlMs, resolvedAt: Date.now() };
}

describe("ArnsCache", () => {
  let cache: ArnsCache;

  beforeEach(() => {
    cache = new ArnsCache({
      maxSize: 100,
      defaultTtlMs: 300_000,
      logger: createTestLogger(),
    });
  });

  // --- get / set ---

  it("returns null for a key that was never set", () => {
    expect(cache.get("unknown-name")).toBeNull();
  });

  it("stores and retrieves a resolution", () => {
    const res = makeResolution(TEST_TX_ID);
    cache.set("my-app", res);

    const cached = cache.get("my-app");
    expect(cached).not.toBeNull();
    expect(cached!.txId).toBe(TEST_TX_ID);
  });

  // --- case-insensitive key normalization ---

  it("normalizes keys to lowercase on set and get", () => {
    const res = makeResolution(TEST_TX_ID);
    cache.set("My-App", res);

    expect(cache.get("my-app")).not.toBeNull();
    expect(cache.get("MY-APP")).not.toBeNull();
    expect(cache.get("My-App")).not.toBeNull();
  });

  it("overwrites entry when same name is set with different casing", () => {
    cache.set("APP", makeResolution(TEST_TX_ID));
    cache.set("app", makeResolution(TEST_TX_ID_2));

    const cached = cache.get("App");
    expect(cached!.txId).toBe(TEST_TX_ID_2);
  });

  // --- invalidate ---

  it("invalidates a cached entry", () => {
    cache.set("to-remove", makeResolution(TEST_TX_ID));
    expect(cache.get("to-remove")).not.toBeNull();

    cache.invalidate("to-remove");
    expect(cache.get("to-remove")).toBeNull();
  });

  it("invalidate is case-insensitive", () => {
    cache.set("CaseName", makeResolution(TEST_TX_ID));
    cache.invalidate("casename");
    expect(cache.get("CaseName")).toBeNull();
  });

  it("invalidating a non-existent key does not throw", () => {
    expect(() => cache.invalidate("nope")).not.toThrow();
  });

  // --- clear ---

  it("clears all cached entries", () => {
    cache.set("a", makeResolution(TEST_TX_ID));
    cache.set("b", makeResolution(TEST_TX_ID_2));
    expect(cache.stats().size).toBe(2);

    cache.clear();
    expect(cache.stats().size).toBe(0);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBeNull();
  });

  // --- stats ---

  it("reports size and maxSize", () => {
    const stats = cache.stats();
    expect(stats.size).toBe(0);
    expect(stats.maxSize).toBe(100);
  });

  it("size increases as entries are added", () => {
    cache.set("x", makeResolution(TEST_TX_ID));
    cache.set("y", makeResolution(TEST_TX_ID_2));
    expect(cache.stats().size).toBe(2);
  });

  // --- TTL ---

  it("uses resolution.ttlMs when provided", () => {
    // A very short TTL (1 ms) should expire almost immediately
    const res = makeResolution(TEST_TX_ID, 1);
    cache.set("ephemeral", res);

    // The LRU cache checks TTL lazily on access; force expiration
    // by waiting a tick
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cache.get("ephemeral")).toBeNull();
        resolve();
      }, 50);
    });
  });

  it("uses defaultTtlMs when resolution.ttlMs is 0", () => {
    const shortTtlCache = new ArnsCache({
      maxSize: 10,
      defaultTtlMs: 1, // 1 ms default
      logger: createTestLogger(),
    });

    shortTtlCache.set("item", makeResolution(TEST_TX_ID, 0));

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(shortTtlCache.get("item")).toBeNull();
        resolve();
      }, 50);
    });
  });

  // --- defaults ---

  it("uses sensible defaults when no options provided", () => {
    const defaultCache = new ArnsCache();
    const stats = defaultCache.stats();
    expect(stats.maxSize).toBe(10_000);
    expect(stats.size).toBe(0);
  });
});
