import { defineConfig, devices } from '@playwright/test';

// Not 3000, so a running `bun dev` doesn't get reused with stale `.dev.vars`.
const port = 3100;

export default defineConfig({
	testDir: 'e2e',
	// Not `*.test.ts`, which `bun test` would also pick up.
	testMatch: '*.e2e.ts',
	fullyParallel: true,
	// The dev server compiles each route on first visit, so cold runs are slow.
	timeout: 60_000,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: `http://localhost:${port}`,
		trace: 'on-first-retry',
		permissions: ['clipboard-read', 'clipboard-write']
	},
	// The design is mobile-first; Pixel 7 runs on Chromium.
	projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
	webServer: {
		// Sign-in goes through the dev tools, so `.dev.vars` needs JWT_SECRET and DEV_TOOLS=true.
		command: `bun run db:migrate && vite dev --port ${port} --strictPort`,
		url: `http://localhost:${port}/api/health`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
