import { defineConfig, devices } from '@playwright/test';

import { STORAGE_STATE } from './fixtures/auth.fixture';
import type { FlakeboardOptions } from './fixtures/options.fixture';

/**
 * Flakeboard end-to-end configuration.
 *
 * Design notes (the things an interviewer will actually ask about):
 *
 * 1. `fullyParallel` is on. Every test file AND every test inside a file can run
 *    concurrently, because no test mutates shared server state — reads are read-only
 *    and write-ish scenarios are driven through network interception instead.
 * 2. Authentication happens ONCE in the `setup` project, which writes a storageState
 *    file. Browser projects depend on it, so no test pays for a login. Specs that
 *    genuinely need to be logged out opt back in with
 *    `test.use({ storageState: STORAGE_STATE_ANONYMOUS })`.
 * 3. Sharding is normally a CLI concern (`--shard=1/4`), but it is also readable from
 *    the environment so the same command works in a CI matrix without argument
 *    plumbing.
 * 4. On CI the reporter is `blob`, which is what makes `playwright merge-reports`
 *    able to stitch four shards back into one HTML report.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const isCI = !!process.env.CI;

/** Shard from env so a CI matrix does not have to rewrite the test command. */
const shardFromEnv =
  process.env.SHARD_INDEX && process.env.SHARD_TOTAL
    ? { current: Number(process.env.SHARD_INDEX), total: Number(process.env.SHARD_TOTAL) }
    : undefined;

export default defineConfig<FlakeboardOptions>({
  testDir: './tests',
  outputDir: './test-results',
  snapshotDir: './tests/__snapshots__',

  /* Run every file and every test in parallel. */
  fullyParallel: true,

  /* A stray `test.only` should fail the pipeline, not silently skip 60 tests. */
  forbidOnly: isCI,

  /*
   * One retry on CI, zero locally. Retries exist to absorb infrastructure noise
   * (a cold container, a slow first paint) — not to paper over a real race. Any test
   * that passes only on retry shows up as "flaky" in the report and gets fixed;
   * that is literally what the app under test is about.
   */
  retries: isCI ? 1 : 0,

  /* Let Playwright pick locally; pin on CI so timing is comparable run to run. */
  workers: isCI ? 2 : undefined,

  ...(shardFromEnv ? { shard: shardFromEnv } : {}),

  /* Per-test budget. Individual assertions get 5s (below). */
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toMatchAriaSnapshot: { pathTemplate: '{snapshotDir}/aria/{testFileName}/{arg}{ext}' },
  },

  /*
   * blob on CI so shards can be merged into a single HTML report;
   * html + list locally so `npm test` is pleasant to watch.
   */
  reporter: isCI
    ? [['blob'], ['github'], ['list']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,

    /* Custom option, consumed by the API fixtures. See fixtures/options.fixture.ts. */
    apiBaseURL: API_BASE_URL,

    /* Trace on first retry gives a full timeline for every failure, for free. */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',

    /* Fail fast on a hung click rather than burning the whole test timeout. */
    actionTimeout: 10_000,
    navigationTimeout: 15_000,

    testIdAttribute: 'data-testid',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  },

  projects: [
    /* ---------------------------------------------------------------- setup */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    /* ------------------------------------------------------------ API suite */
    /* No browser is launched at all — these hit Express directly. */
    {
      name: 'api',
      testDir: './tests/api',
      use: { ...devices['Desktop Chrome'] },
    },

    /* ------------------------------------------------------- browser suites */
    {
      name: 'chromium',
      testIgnore: /tests\/api\//,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
    },
    {
      name: 'firefox',
      testIgnore: /tests\/api\//,
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'], storageState: STORAGE_STATE },
    },
    {
      name: 'webkit',
      testIgnore: /tests\/api\//,
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'], storageState: STORAGE_STATE },
    },
  ],

  /*
   * Boots the app under test unless you already have one running. `reuseExistingServer`
   * keeps the local loop fast; CI always gets a cold, known-good start.
   * Set PW_SKIP_WEBSERVER=1 to manage the app yourself (or to just run `--list`).
   *
   * Deliberately the PRODUCTION build (`vite preview`), not the dev server.
   *
   * React StrictMode double-invokes effects in development, so every fetch fires twice.
   * That makes any count-scoped interception — `route(..., { times: 1 })`, "fail the
   * first attempt then recover", "hold the next request open" — non-deterministic: the
   * first request consumes the mock and the second sails through to the real API, so
   * the error and loading states under test never appear. Testing the built artifact
   * is both the honest thing to assert against and the thing that removes the race.
   */
  ...(process.env.PW_SKIP_WEBSERVER
    ? {}
    : {
        webServer: {
          command: 'npm run dev:e2e --prefix ../flakeboard',
          url: `${API_BASE_URL}/api/health`,
          reuseExistingServer: !isCI,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
});
