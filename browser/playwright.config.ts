import { defineConfig } from "@playwright/test";

const port = Number(process.env.FLOWLENS_TEST_PORT ?? 5401);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 20_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "node browser/serve-demo.ts",
    cwd: process.cwd(),
    url: `http://127.0.0.1:${port}/api/graph`,
    timeout: 30_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 3000 },
  },
});
