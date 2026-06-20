import { describe, it, expect, beforeEach } from "vitest";
import { ManifestCache } from "./manifest-cache.js";
import { createTestLogger, TEST_TX_ID, TEST_TX_ID_2 } from "../test-helpers.js";
import type { VerifiedManifest } from "../types/manifest.js";

const TX_ID_3 = "cCC3TGQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_X";

function makeManifest(txId: string): VerifiedManifest {
  return {
    txId,
    manifest: {
      manifest: "arweave/paths",
      version: "0.2.0",
      paths: {
        "index.html": { id: "abc123" },
      },
    },
    verifiedAt: Date.now(),
    sizeBytes: 256,
  };
}

describe("ManifestCache", () => {
  let cache: ManifestCache;

  beforeEach(() => {
    cache = new ManifestCache({
      maxSize: 100,
      logger: createTestLogger(),
    });
  });

  // --- get / set ---

  it("returns null for a key that was never set", () => {
    expect(cache.get("nonexistent")).toBeNull();
  });

  it("stores and retrieves a manifest", () => {
    const manifest = makeManifest(TEST_TX_ID);
    cache.set(manifest);

    const cached = cache.get(TEST_TX_ID);
    expect(cached).not.toBeNull();
    expect(cached!.txId).toBe(TEST_TX_ID);
    expect(cached!.manifest.paths["index.html"].id).toBe("abc123");
  });

  it("overwrites an existing entry with the same txId", () => {
    const m1 = makeManifest(TEST_TX_ID);
    const m2 = { ...makeManifest(TEST_TX_ID), sizeBytes: 512 };

    cache.set(m1);
    cache.set(m2);

    expect(cache.get(TEST_TX_ID)!.sizeBytes).toBe(512);
    expect(cache.stats().size).toBe(1);
  });

  // --- has ---

  it("returns true for a cached txId", () => {
    cache.set(makeManifest(TEST_TX_ID));
    expect(cache.has(TEST_TX_ID)).toBe(true);
  });

  it("returns false for a non-cached txId", () => {
    expect(cache.has("missing")).toBe(false);
  });

  // --- delete ---

  it("removes a manifest by txId", () => {
    cache.set(makeManifest(TEST_TX_ID));
    expect(cache.delete(TEST_TX_ID)).toBe(true);
    expect(cache.get(TEST_TX_ID)).toBeNull();
  });

  it("returns false when deleting a non-existent key", () => {
    expect(cache.delete("missing")).toBe(false);
  });

  // --- clear ---

  it("removes all cached manifests", () => {
    cache.set(makeManifest(TEST_TX_ID));
    cache.set(makeManifest(TEST_TX_ID_2));
    expect(cache.stats().size).toBe(2);

    cache.clear();
    expect(cache.stats().size).toBe(0);
    expect(cache.get(TEST_TX_ID)).toBeNull();
  });

  // --- LRU eviction ---

  it("evicts the least recently used entry when maxSize is reached", async () => {
    const small = new ManifestCache({
      maxSize: 2,
      logger: createTestLogger(),
    });

    const m1 = makeManifest(TEST_TX_ID);
    small.set(m1);

    // Wait a tick so m2 gets a later timestamp
    await new Promise((r) => setTimeout(r, 15));

    const m2 = makeManifest(TEST_TX_ID_2);
    small.set(m2);

    // Access m1 so it gets the latest lastAccessed time
    await new Promise((r) => setTimeout(r, 15));
    small.get(TEST_TX_ID);

    // Insert m3 — should evict m2 (the least recently accessed)
    await new Promise((r) => setTimeout(r, 15));
    const m3 = makeManifest(TX_ID_3);
    small.set(m3);

    expect(small.stats().size).toBe(2);
    expect(small.has(TEST_TX_ID)).toBe(true);
    expect(small.has(TX_ID_3)).toBe(true);
    expect(small.has(TEST_TX_ID_2)).toBe(false);
  });

  it("does not evict when overwriting an existing key at capacity", () => {
    const small = new ManifestCache({
      maxSize: 2,
      logger: createTestLogger(),
    });

    small.set(makeManifest(TEST_TX_ID));
    small.set(makeManifest(TEST_TX_ID_2));

    // Overwrite existing key — should NOT trigger eviction
    small.set({ ...makeManifest(TEST_TX_ID), sizeBytes: 999 });

    expect(small.stats().size).toBe(2);
    expect(small.has(TEST_TX_ID)).toBe(true);
    expect(small.has(TEST_TX_ID_2)).toBe(true);
  });

  // --- stats with hit/miss tracking ---

  it("starts with zero hits and misses", () => {
    const stats = cache.stats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it("tracks hits and misses correctly", () => {
    cache.set(makeManifest(TEST_TX_ID));

    cache.get(TEST_TX_ID); // hit
    cache.get(TEST_TX_ID); // hit
    cache.get("missing"); // miss

    const stats = cache.stats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
  });

  it("reports correct size and maxSize", () => {
    cache.set(makeManifest(TEST_TX_ID));
    const stats = cache.stats();
    expect(stats.size).toBe(1);
    expect(stats.maxSize).toBe(100);
  });

  // --- Prometheus metrics ---

  it("generates Prometheus-formatted metrics", () => {
    cache.set(makeManifest(TEST_TX_ID));
    cache.get(TEST_TX_ID);
    cache.get("miss");

    const metrics = cache.getPrometheusMetrics();
    expect(metrics).toContain("wayfinder_manifest_cache_size 1");
    expect(metrics).toContain("wayfinder_manifest_cache_hits_total 1");
    expect(metrics).toContain("wayfinder_manifest_cache_misses_total 1");
  });
});
