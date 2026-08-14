import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run each test file in its own worker thread.
    //
    // The default `forks` pool intermittently evaluated `src/middleware/error-handler.ts`
    // twice inside a single worker, producing two distinct copies of the custom error
    // classes. `instanceof` then failed against errors that were otherwise correct
    // (matching `name` and `code`), so assertions like
    // `expect(err).toBeInstanceOf(ArnsResolutionError)` failed in roughly a third of
    // runs — always in whichever files happened to share a worker.
    //
    // This only ever affected the test runner's module graph. The router itself runs
    // under Bun as a single module graph, so the `instanceof` checks in
    // `createErrorResponse` / `app.onError` are not impacted.
    pool: "threads",
  },
});
