import { test as base } from '@playwright/test';

/**
 * Custom, typed test options.
 *
 * An "option" is a fixture whose value can be set from `use: {}` in playwright.config.ts
 * and overridden per project — the same mechanism `baseURL` and `headless` use. Declaring
 * `apiBaseURL` this way (rather than reading `process.env` at import time) means:
 *
 *   - it is visible and typed in the config,
 *   - a project can point at a different API without touching a spec,
 *   - `defineConfig<FlakeboardOptions>` type-checks the value.
 *
 * It is worker-scoped because the worker-level API context depends on it, and a
 * worker-scoped fixture may only depend on other worker-scoped fixtures.
 */
export interface FlakeboardOptions {
  /** Origin of the Express API. Distinct from `baseURL`, which is the React app. */
  apiBaseURL: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no test-scoped options here
export const optionsTest = base.extend<{}, FlakeboardOptions>({
  apiBaseURL: [
    process.env.API_BASE_URL ?? 'http://localhost:3001',
    { option: true, scope: 'worker' },
  ],
});
