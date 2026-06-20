import { describe, it, expect, beforeEach } from "vitest";
import {
  RequestTracker,
  getRequestTracker,
  resetRequestTracker,
} from "./request-tracker.js";
import { createTestLogger } from "../test-helpers.js";

describe("RequestTracker", () => {
  let tracker: RequestTracker;

  beforeEach(() => {
    tracker = new RequestTracker({ logger: createTestLogger() });
  });

  describe("increment", () => {
    it("returns true and increases active count", () => {
      expect(tracker.getCount()).toBe(0);

      const result = tracker.increment();

      expect(result).toBe(true);
      expect(tracker.getCount()).toBe(1);
    });

    it("increments count for each call", () => {
      tracker.increment();
      tracker.increment();
      tracker.increment();

      expect(tracker.getCount()).toBe(3);
    });
  });

  describe("decrement", () => {
    it("decreases active count", () => {
      tracker.increment();
      tracker.increment();
      expect(tracker.getCount()).toBe(2);

      tracker.decrement();

      expect(tracker.getCount()).toBe(1);
    });

    it("never goes below 0", () => {
      // Start at 0, decrement multiple times
      tracker.decrement();
      tracker.decrement();
      tracker.decrement();

      expect(tracker.getCount()).toBe(0);
    });

    it("does not go below 0 after incrementing and decrementing past zero", () => {
      tracker.increment();
      tracker.decrement();
      tracker.decrement(); // extra decrement

      expect(tracker.getCount()).toBe(0);
    });
  });

  describe("startDraining", () => {
    it("makes increment() return false", () => {
      tracker.startDraining();

      const result = tracker.increment();

      expect(result).toBe(false);
      expect(tracker.getCount()).toBe(0); // count should not increase
    });

    it("resolves drain promise when count reaches 0 via decrement", async () => {
      tracker.increment();
      tracker.increment();

      const drainPromise = tracker.startDraining();

      // New requests should be rejected
      expect(tracker.increment()).toBe(false);

      // Drain existing requests
      tracker.decrement();
      tracker.decrement();

      // Drain promise should resolve
      await drainPromise;

      expect(tracker.getCount()).toBe(0);
    });

    it("resolves immediately if count is already 0", async () => {
      const drainPromise = tracker.startDraining();

      // Should resolve without any decrements needed
      await drainPromise;

      expect(tracker.getCount()).toBe(0);
    });

    it("returns the same promise when called multiple times", async () => {
      const promise1 = tracker.startDraining();
      const promise2 = tracker.startDraining();

      expect(promise1).toBe(promise2);

      await promise1;
    });
  });

  describe("isDraining", () => {
    it("returns false initially", () => {
      expect(tracker.isDraining()).toBe(false);
    });

    it("returns true after startDraining is called", () => {
      tracker.startDraining();

      expect(tracker.isDraining()).toBe(true);
    });

    it("reflects draining state accurately throughout lifecycle", async () => {
      expect(tracker.isDraining()).toBe(false);

      tracker.increment();
      expect(tracker.isDraining()).toBe(false);

      const drainPromise = tracker.startDraining();
      expect(tracker.isDraining()).toBe(true);

      tracker.decrement();
      await drainPromise;

      // Still draining even after promise resolves (state not auto-cleared)
      expect(tracker.isDraining()).toBe(true);
    });
  });

  describe("reset", () => {
    it("clears draining state", () => {
      tracker.startDraining();
      expect(tracker.isDraining()).toBe(true);

      tracker.reset();

      expect(tracker.isDraining()).toBe(false);
    });

    it("clears count", () => {
      tracker.increment();
      tracker.increment();
      tracker.increment();
      expect(tracker.getCount()).toBe(3);

      tracker.reset();

      expect(tracker.getCount()).toBe(0);
    });

    it("allows increment() to succeed again after reset", () => {
      tracker.startDraining();
      expect(tracker.increment()).toBe(false);

      tracker.reset();

      expect(tracker.increment()).toBe(true);
      expect(tracker.getCount()).toBe(1);
    });

    it("allows a new drain cycle after reset", async () => {
      tracker.increment();
      const drainPromise1 = tracker.startDraining();
      tracker.decrement();
      await drainPromise1;

      tracker.reset();

      // Start a new cycle
      tracker.increment();
      tracker.increment();
      const drainPromise2 = tracker.startDraining();

      tracker.decrement();
      tracker.decrement();

      await drainPromise2;
      expect(tracker.getCount()).toBe(0);
    });
  });
});

describe("getRequestTracker / resetRequestTracker", () => {
  beforeEach(() => {
    resetRequestTracker();
  });

  it("returns a singleton instance", () => {
    const tracker1 = getRequestTracker();
    const tracker2 = getRequestTracker();

    expect(tracker1).toBe(tracker2);
  });

  it("resetRequestTracker clears the singleton", () => {
    const tracker1 = getRequestTracker();
    tracker1.increment();

    resetRequestTracker();

    const tracker2 = getRequestTracker();
    expect(tracker2).not.toBe(tracker1);
    expect(tracker2.getCount()).toBe(0);
  });
});
