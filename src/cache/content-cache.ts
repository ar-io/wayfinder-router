/**
 * Verified Content Cache
 * LRU cache for verified Arweave content
 *
 * Since Arweave data is immutable, once we've verified content by its hash,
 * we can safely cache it indefinitely. The LRU eviction ensures storage stays bounded.
 *
 * Two modes:
 * - In-memory (contentPath empty): data stored directly in LRU entries
 * - Disk-backed (contentPath set): LRU holds metadata only, data stored as files on disk
 */

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { writeFile, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { LRUCache } from "lru-cache";
import type { Logger } from "../types/index.js";

export interface CachedContent {
  data: Uint8Array;
  contentType: string;
  contentLength: number;
  headers: Record<string, string>;
  verifiedAt: number;
  txId: string;
  hash?: string; // The verified hash
  sourceGateway?: string; // Gateway that originally served this content
  accessCount: number; // Track popularity
  lastAccessed: number; // Timestamp of last access
}

/** Metadata stored alongside disk data */
interface DiskMeta {
  contentType: string;
  contentLength: number;
  headers: Record<string, string>;
  verifiedAt: number;
  txId: string;
  hash?: string;
  accessCount: number;
  lastAccessed: number;
  key: string; // The LRU cache key (txId:path)
}

export interface ContentCacheOptions {
  enabled?: boolean;
  maxSizeBytes?: number;
  maxEntries?: number;
  ttlMs?: number; // 0 = no TTL (immutable content mode)
  maxItemSizeBytes?: number; // Don't cache items larger than this
  contentPath?: string; // Empty = in-memory only, set for disk-backed
  logger?: Logger;
}

export class ContentCache {
  private cache: LRUCache<string, CachedContent>;
  private currentSizeBytes: number;
  private maxSizeBytes: number;
  private maxItemSizeBytes: number;
  private enabled: boolean;
  private logger?: Logger;
  private hits: number = 0;
  private misses: number = 0;
  private contentPath: string | null;
  private isDiskBacked: boolean;

  constructor(options: ContentCacheOptions = {}) {
    const {
      enabled = true,
      maxSizeBytes = 100 * 1024 * 1024, // 100MB default
      maxEntries = 1000,
      ttlMs = 0, // No TTL by default - Arweave content is immutable
      maxItemSizeBytes = 10 * 1024 * 1024, // 10MB max per item
      contentPath = "",
      logger,
    } = options;

    this.enabled = enabled;
    this.maxSizeBytes = maxSizeBytes;
    this.maxItemSizeBytes = maxItemSizeBytes;
    this.currentSizeBytes = 0;
    this.logger = logger;
    this.contentPath = contentPath || null;
    this.isDiskBacked = !!this.contentPath;

    // Ensure cache directory exists for disk-backed mode
    if (this.isDiskBacked && this.contentPath) {
      mkdirSync(this.contentPath, { recursive: true });
    }

    // Configure LRU cache
    const cacheOptions: LRUCache.Options<string, CachedContent, unknown> = {
      max: maxEntries,
      dispose: (value, key) => {
        this.currentSizeBytes -= value.contentLength;
        this.logger?.debug("Cache entry evicted", {
          txId: value.txId,
          size: value.contentLength,
        });
        // Clean up disk files on eviction
        if (this.isDiskBacked) {
          this.deleteFromDisk(key).catch((err) => {
            this.logger?.warn(
              "Failed to delete evicted cache files from disk",
              {
                key,
                error: err instanceof Error ? err.message : String(err),
              },
            );
          });
        }
      },
      noDisposeOnSet: true,
      // Update access time on get
      updateAgeOnGet: true,
    };

    // Only set TTL if specified (0 means no TTL for immutable content)
    if (ttlMs > 0) {
      cacheOptions.ttl = ttlMs;
    }

    this.cache = new LRUCache<string, CachedContent>(cacheOptions);

    // Restore index from disk on startup
    if (this.isDiskBacked && this.contentPath) {
      this.restoreFromDisk();
    }

    this.logger?.info("Content cache initialized", {
      enabled,
      maxSizeBytes,
      maxEntries,
      ttlMs: ttlMs || "infinite (immutable mode)",
      maxItemSizeBytes,
      diskBacked: this.isDiskBacked,
      contentPath: this.contentPath || "(in-memory)",
    });
  }

  /**
   * Create cache key from txId and path
   */
  private createKey(txId: string, path: string): string {
    return `${txId}:${path}`;
  }

  /**
   * Compute SHA-256 hex of a cache key for disk filenames
   */
  private diskFileName(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  /**
   * Path to data file on disk
   */
  private dataFilePath(key: string): string {
    return join(this.contentPath!, `${this.diskFileName(key)}.bin`);
  }

  /**
   * Path to metadata file on disk
   */
  private metaFilePath(key: string): string {
    return join(this.contentPath!, `${this.diskFileName(key)}.meta.json`);
  }

  /**
   * Atomically write data and metadata to disk
   */
  private async writeToDisk(
    key: string,
    data: Uint8Array,
    meta: DiskMeta,
  ): Promise<void> {
    const dataPath = this.dataFilePath(key);
    const metaPath = this.metaFilePath(key);
    const dataTmp = dataPath + ".tmp";
    const metaTmp = metaPath + ".tmp";

    // Write to .tmp files first, then rename.
    // Rename meta BEFORE data so a crash-orphan is .meta.json without .bin
    // (restoreFromDisk already cleans up that case).
    await writeFile(dataTmp, data);
    await writeFile(metaTmp, JSON.stringify(meta));
    await rename(metaTmp, metaPath);
    await rename(dataTmp, dataPath);
  }

  /**
   * Read data from disk for a given cache key
   */
  private async readFromDisk(key: string): Promise<Uint8Array | null> {
    try {
      const data = await readFile(this.dataFilePath(key));
      return new Uint8Array(data);
    } catch {
      return null;
    }
  }

  /**
   * Delete disk files for a cache key
   */
  private async deleteFromDisk(key: string): Promise<void> {
    const dataPath = this.dataFilePath(key);
    const metaPath = this.metaFilePath(key);
    await unlink(dataPath).catch(() => {});
    await unlink(metaPath).catch(() => {});
    // Clean up any leftover .tmp files
    await unlink(dataPath + ".tmp").catch(() => {});
    await unlink(metaPath + ".tmp").catch(() => {});
  }

  /**
   * Restore LRU index from disk on startup.
   * Scans cache directory for .meta.json files, verifies .bin exists, populates LRU.
   */
  private restoreFromDisk(): void {
    if (!this.contentPath) return;

    try {
      const files = readdirSync(this.contentPath);
      const metaFiles = files.filter((f) => f.endsWith(".meta.json"));
      let restored = 0;
      let skipped = 0;

      // Clean up leftover .tmp files from interrupted writes
      for (const file of files) {
        if (file.endsWith(".tmp")) {
          try {
            unlinkSync(join(this.contentPath, file));
          } catch {
            // ignore
          }
        }
      }

      for (const metaFile of metaFiles) {
        const hash = metaFile.replace(".meta.json", "");
        const binFile = `${hash}.bin`;

        if (!files.includes(binFile)) {
          // .bin missing, clean up orphaned .meta.json
          try {
            unlinkSync(join(this.contentPath, metaFile));
          } catch {
            // ignore
          }
          skipped++;
          continue;
        }

        try {
          const metaJson = readFileSync(
            join(this.contentPath, metaFile),
            "utf-8",
          );
          const meta: DiskMeta = JSON.parse(metaJson);

          // Check if adding this entry would exceed max size
          if (this.currentSizeBytes + meta.contentLength > this.maxSizeBytes) {
            // Delete files for entries that don't fit
            try {
              unlinkSync(join(this.contentPath, metaFile));
              unlinkSync(join(this.contentPath, binFile));
            } catch {
              // ignore
            }
            skipped++;
            continue;
          }

          // Create a placeholder entry (empty data, real metadata)
          const entry: CachedContent = {
            data: new Uint8Array(0),
            contentType: meta.contentType,
            contentLength: meta.contentLength,
            headers: meta.headers,
            verifiedAt: meta.verifiedAt,
            txId: meta.txId,
            hash: meta.hash,
            accessCount: meta.accessCount,
            lastAccessed: meta.lastAccessed,
          };

          this.cache.set(meta.key, entry);
          this.currentSizeBytes += meta.contentLength;
          restored++;
        } catch {
          skipped++;
        }
      }

      this.logger?.info("Content cache restored from disk", {
        restored,
        skipped,
        totalSize: this.currentSizeBytes,
        path: this.contentPath,
      });
    } catch (err) {
      this.logger?.warn("Failed to restore content cache from disk", {
        error: err instanceof Error ? err.message : String(err),
        path: this.contentPath,
      });
    }
  }

  /**
   * Calculate eviction score for a cache entry.
   * Lower score = more likely to be evicted.
   *
   * Factors considered:
   * - Recency: Recently accessed items get higher scores
   * - Popularity: Frequently accessed items get higher scores
   * - Size: Larger items get slightly lower scores (prefer evicting big items)
   */
  private evictionScore(entry: CachedContent): number {
    const now = Date.now();
    const ageMs = now - entry.lastAccessed;
    const ageMinutes = ageMs / 60000;

    // Popularity boost: log scale to prevent outliers from dominating
    // accessCount 0 = 0, 1 = 1, 10 = 3.3, 100 = 6.6
    const popularity = Math.log2(entry.accessCount + 1);

    // Recency: decays over time
    // Items accessed 1 minute ago score higher than items accessed 60 minutes ago
    const recency = 100 / (ageMinutes + 1);

    // Size penalty: slightly prefer evicting larger items to free more space
    // Normalized to MB to keep it in reasonable range
    const sizeMB = entry.contentLength / (1024 * 1024);
    const sizePenalty = sizeMB * 0.5; // Small penalty per MB

    // Combined score: popularity and recency boost, size penalty
    return popularity * 10 + recency - sizePenalty;
  }

  /**
   * Select the best candidate for eviction based on weighted scoring.
   * Returns the key of the entry with the lowest score.
   */
  private selectEvictionCandidate(): string | null {
    let lowestScore = Infinity;
    let candidateKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      const score = this.evictionScore(entry);
      if (score < lowestScore) {
        lowestScore = score;
        candidateKey = key;
      }
    }

    return candidateKey;
  }

  /**
   * Check if cache is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get cached content
   * In disk-backed mode, lazily reads data from disk.
   */
  async get(txId: string, path: string = "/"): Promise<CachedContent | null> {
    if (!this.enabled) return null;

    const key = this.createKey(txId, path);
    const cached = this.cache.get(key);

    if (cached) {
      // In disk-backed mode, read data from disk
      if (this.isDiskBacked) {
        const data = await this.readFromDisk(key);
        if (!data) {
          // Disk file missing — evict stale index entry
          this.logger?.warn("Cache disk file missing, evicting entry", {
            txId,
            path,
          });
          this.cache.delete(key);
          this.misses++;
          return null;
        }
        // Return a copy with real data
        this.hits++;
        cached.accessCount++;
        cached.lastAccessed = Date.now();
        return { ...cached, data };
      }

      // In-memory mode — data is already in the entry
      this.hits++;
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      this.logger?.debug("Content cache hit", {
        txId,
        path,
        size: cached.contentLength,
        accessCount: cached.accessCount,
      });
      return cached;
    }

    this.misses++;
    this.logger?.debug("Content cache miss", { txId, path });
    return null;
  }

  /**
   * Cache verified content
   * In disk-backed mode, writes data to disk and stores empty placeholder in LRU.
   */
  async set(
    txId: string,
    path: string,
    content: Omit<CachedContent, "accessCount" | "lastAccessed">,
  ): Promise<boolean> {
    if (!this.enabled) return false;

    const contentSize = content.contentLength;

    // Skip if single item exceeds max item size
    if (contentSize > this.maxItemSizeBytes) {
      this.logger?.debug("Content too large to cache (exceeds max item size)", {
        txId,
        path,
        size: contentSize,
        maxItemSize: this.maxItemSizeBytes,
      });
      return false;
    }

    // Skip if single item exceeds total cache size
    if (contentSize > this.maxSizeBytes) {
      this.logger?.debug(
        "Content too large to cache (exceeds total cache size)",
        {
          txId,
          path,
          size: contentSize,
          maxSize: this.maxSizeBytes,
        },
      );
      return false;
    }

    // Evict using weighted algorithm until we have space
    // The algorithm considers: recency, popularity, and size
    while (
      this.currentSizeBytes + contentSize > this.maxSizeBytes &&
      this.cache.size > 0
    ) {
      const keyToEvict = this.selectEvictionCandidate();
      if (keyToEvict) {
        this.cache.delete(keyToEvict);
      } else {
        // Fallback to oldest key if scoring fails
        const oldest = this.cache.keys().next().value;
        if (oldest) {
          this.cache.delete(oldest);
        }
      }
    }

    const key = this.createKey(txId, path);
    const now = Date.now();

    if (this.isDiskBacked) {
      // Write data + metadata to disk
      const meta: DiskMeta = {
        contentType: content.contentType,
        contentLength: content.contentLength,
        headers: content.headers,
        verifiedAt: content.verifiedAt,
        txId: content.txId,
        hash: content.hash,
        accessCount: 0,
        lastAccessed: now,
        key,
      };

      try {
        await this.writeToDisk(key, content.data, meta);
      } catch (err) {
        this.logger?.warn("Failed to write cache entry to disk", {
          txId,
          path,
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      }

      // Store placeholder (empty data) in LRU
      const placeholder: CachedContent = {
        ...content,
        data: new Uint8Array(0),
        accessCount: 0,
        lastAccessed: now,
      };
      this.cache.set(key, placeholder);
    } else {
      // In-memory mode — store full data in LRU
      const fullContent: CachedContent = {
        ...content,
        accessCount: 0,
        lastAccessed: now,
      };
      this.cache.set(key, fullContent);
    }

    this.currentSizeBytes += contentSize;

    this.logger?.info("Verified content cached", {
      txId,
      path,
      size: contentSize,
      totalCacheSize: this.currentSizeBytes,
      cacheEntries: this.cache.size,
      diskBacked: this.isDiskBacked,
    });

    return true;
  }

  /**
   * Check if content is cached
   */
  has(txId: string, path: string = "/"): boolean {
    if (!this.enabled) return false;
    const key = this.createKey(txId, path);
    return this.cache.has(key);
  }

  /**
   * Invalidate cached content
   */
  invalidate(txId: string, path?: string): void {
    if (path) {
      const key = this.createKey(txId, path);
      this.cache.delete(key);
    } else {
      // Invalidate all entries for this txId
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${txId}:`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
    this.logger?.info("Content cache cleared");
  }

  /**
   * Get cache statistics
   */
  stats(): {
    enabled: boolean;
    entries: number;
    sizeBytes: number;
    maxSizeBytes: number;
    utilizationPercent: number;
    hits: number;
    misses: number;
    hitRate: number;
    diskBacked: boolean;
  } {
    const totalRequests = this.hits + this.misses;
    return {
      enabled: this.enabled,
      entries: this.cache.size,
      sizeBytes: this.currentSizeBytes,
      maxSizeBytes: this.maxSizeBytes,
      utilizationPercent: (this.currentSizeBytes / this.maxSizeBytes) * 100,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      diskBacked: this.isDiskBacked,
    };
  }

  /**
   * Convert cached content to Response with appropriate headers
   */
  toResponse(cached: CachedContent): Response {
    const headers = new Headers(cached.headers);

    // IMPORTANT: Remove content-encoding since cached data is decompressed
    // (Node.js fetch() auto-decompresses, so we store decompressed data)
    headers.delete("content-encoding");
    // Ensure content-length matches actual data size
    headers.set("content-length", String(cached.data.length));

    // Add cache indicators
    headers.set("x-wayfinder-cached", "true");
    headers.set("x-wayfinder-verified", "true");
    headers.set(
      "x-wayfinder-cache-age",
      String(Date.now() - cached.verifiedAt),
    );

    // Since content is verified and immutable, allow strong caching
    if (!headers.has("cache-control")) {
      headers.set("cache-control", "public, max-age=31536000, immutable");
    }

    return new Response(cached.data, {
      status: 200,
      headers,
    });
  }

  /**
   * Get Prometheus-style metrics
   */
  getPrometheusMetrics(): string {
    const stats = this.stats();
    const lines: string[] = [];

    lines.push(
      "# HELP wayfinder_content_cache_entries Number of cached content entries",
    );
    lines.push("# TYPE wayfinder_content_cache_entries gauge");
    lines.push(`wayfinder_content_cache_entries ${stats.entries}`);
    lines.push("");

    lines.push(
      "# HELP wayfinder_content_cache_size_bytes Current cache size in bytes",
    );
    lines.push("# TYPE wayfinder_content_cache_size_bytes gauge");
    lines.push(`wayfinder_content_cache_size_bytes ${stats.sizeBytes}`);
    lines.push("");

    lines.push(
      "# HELP wayfinder_content_cache_max_bytes Maximum cache size in bytes",
    );
    lines.push("# TYPE wayfinder_content_cache_max_bytes gauge");
    lines.push(`wayfinder_content_cache_max_bytes ${stats.maxSizeBytes}`);
    lines.push("");

    lines.push("# HELP wayfinder_content_cache_hits_total Total cache hits");
    lines.push("# TYPE wayfinder_content_cache_hits_total counter");
    lines.push(`wayfinder_content_cache_hits_total ${stats.hits}`);
    lines.push("");

    lines.push(
      "# HELP wayfinder_content_cache_misses_total Total cache misses",
    );
    lines.push("# TYPE wayfinder_content_cache_misses_total counter");
    lines.push(`wayfinder_content_cache_misses_total ${stats.misses}`);
    lines.push("");

    lines.push(
      "# HELP wayfinder_content_cache_disk_backed Whether cache is disk-backed",
    );
    lines.push("# TYPE wayfinder_content_cache_disk_backed gauge");
    lines.push(
      `wayfinder_content_cache_disk_backed ${stats.diskBacked ? 1 : 0}`,
    );
    lines.push("");

    return lines.join("\n");
  }
}
