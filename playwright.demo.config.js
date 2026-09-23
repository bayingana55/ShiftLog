import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "demo.spec.js",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3102/ShiftLog/",
    ...(process.env.PLAYWRIGHT_CHROME_PATH
      ? {
          launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROME_PATH },
        }
      : {}),
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "node scripts/serve-demo.js",
    url: "http://127.0.0.1:3102/ShiftLog/",
    reuseExistingServer: false,
  },
});
