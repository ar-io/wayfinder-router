import { describe, it, expect, vi } from "vitest";
import { RequestDeduplicator } from "./deduplicator.js";
import { createTestLogger } from "../test-helpers.js";

function createDeduplicator<T = string>() {
  const logger = createTestLogger();
  const dedup = new RequestDeduplicator<T>({ logger, name: "test" });
  return { dedup, logger };
}

describe("RequestDeduplicator", () => {
  it("first call for a key executes the function", async () => {
    const { dedup } = createDeduplicator();
    const fn = vi.fn().mockResolvedValue("result-A");

    const result = await dedup.dedupe("key1", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe("result-A");
  });

  it("concurrent calls for same key share the same promise", async () => {
    const { dedup } = createDeduplicator();
    let resolveOuter!: (v: string) => void;
    const fn = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => {
        resolveOuter = resolve;
      }),
    );

    // Start three concurrent calls for the same key
    const p1 = dedup.dedupe("key1", fn);
    const p2 = dedup.dedupe("key1", fn);
    const p3 = dedup.dedupe("key1", fn);

    // fn should only be called once
    expect(fn).toHaveBeenCalledTimes(1);

    // Resolve the shared promise
    resolveOuter("shared-result");

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // All callers get the same result
    expect(r1).toBe("shared-result");
    expect(r2).toBe("shared-result");
    expect(r3).toBe("shared-result");
  });

  it("after first call completes, next call executes fresh", async () => {
    const { dedup } = createDeduplicator();
    const fn = vi
      .fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");

    const r1 = await dedup.dedupe("key1", fn);
    const r2 = await dedup.dedupe("key1", fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(r1).toBe("first");
    expect(r2).toBe("second");
  });

  it("error in fn propagates to all waiting callers", async () => {
    const { dedup } = createDeduplicator();
    let rejectOuter!: (e: Error) => void;
    const fn = vi.fn().mockReturnValue(
      new Promise<string>((_, reject) => {
        rejectOuter = reject;
      }),
    );

    const p1 = dedup.dedupe("key1", fn);
    const p2 = dedup.dedupe("key1", fn);

    expect(fn).toHaveBeenCalledTimes(1);

    const error = new Error("something went wrong");
    rejectOuter(error);

    await expect(p1).rejects.toThrow("something went wrong");
    await expect(p2).rejects.toThrow("something went wrong");
  });

  it("after error, next call for same key tries again fresh", async () => {
    const { dedup } = createDeduplicator();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient failure"))
      .mockResolvedValueOnce("recovered");

    await expect(dedup.dedupe("key1", fn)).rejects.toThrow("transient failure");

    const result = await dedup.dedupe("key1", fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result).toBe("recovered");
  });

  it("different keys execute independently and concurrently", async () => {
    const { dedup } = createDeduplicator();
    let resolveA!: (v: string) => void;
    let resolveB!: (v: string) => void;

    const fnA = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => {
        resolveA = resolve;
      }),
    );
    const fnB = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => {
        resolveB = resolve;
      }),
    );

    const pA = dedup.dedupe("keyA", fnA);
    const pB = dedup.dedupe("keyB", fnB);

    // Both functions should be called (different keys)
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);

    // Both should be in-flight
    expect(dedup.size).toBe(2);

    resolveA("result-A");
    resolveB("result-B");

    const [rA, rB] = await Promise.all([pA, pB]);

    expect(rA).toBe("result-A");
    expect(rB).toBe("result-B");
  });
});
