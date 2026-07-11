import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["src/test/setup.ts"],
    // Project-local linked worktrees must never be treated as a second test
    // suite. Explicit includes make the boundary deterministic on every OS.
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/.temp/**", "**/.worktrees/**"]
  }
});
