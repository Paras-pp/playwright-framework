import {
  request as playwrightRequest,
  type APIRequestContext,
  type BrowserContextOptions,
} from '@playwright/test';
import path from 'node:path';

import { API, CREDENTIALS, TOKEN_STORAGE_KEY } from '../utils/test-data';
import type { LoginSuccess } from '../utils/types';
import { optionsTest } from './options.fixture';

/**
 * Where the authenticated browser state is cached.
 *
 * The `setup` project logs in ONCE through the real UI and writes cookies + localStorage
 * here. Every browser project then starts already signed in. With ~50 browser tests
 * across 3 browsers that is ~150 logins removed from the run — minutes of wall clock and,
 * more importantly, 150 fewer chances for an unrelated login hiccup to fail a test that
 * was never about login.
 *
 * The trade-off, stated honestly: tests now share an identity and cannot assert on
 * first-login side effects. Specs that need a clean session opt out with
 * `test.use({ storageState: STORAGE_STATE_ANONYMOUS })`, which is explicit at the top of
 * the file rather than hidden in a base class.
 */
export const STORAGE_STATE = path.join(__dirname, '..', 'playwright/.auth/user.json');

/** Explicitly empty state: "this test is logged out, and that is the point." */
export const STORAGE_STATE_ANONYMOUS: NonNullable<BrowserContextOptions['storageState']> = {
  cookies: [],
  origins: [],
};

export interface AuthWorkerFixtures {
  /** API context bound to the Express origin, one per worker. */
  apiContext: APIRequestContext;
  /** A valid bearer token, obtained once per worker. */
  authToken: string;
}

export interface AuthTestFixtures {
  /**
   * Puts a valid token into `localStorage` for the current page's origin without going
   * through the login form. For specs that need a *fresh* authenticated session but are
   * not testing login itself.
   */
  signInProgrammatically: () => Promise<void>;
  /** Wipes the token from `localStorage`. */
  clearSession: () => Promise<void>;
}

export const authTest = optionsTest.extend<AuthTestFixtures, AuthWorkerFixtures>({
  /**
   * Worker-scoped, so N tests in a worker share one HTTP connection pool and one login.
   * Note this is NOT the built-in `request` fixture: that one inherits `baseURL`, which
   * points at the React dev server. The API lives on a different port.
   */
  apiContext: [
    async ({ apiBaseURL }, use) => {
      const context = await playwrightRequest.newContext({ baseURL: apiBaseURL });
      await use(context);
      await context.dispose();
    },
    { scope: 'worker' },
  ],

  authToken: [
    async ({ apiContext, apiBaseURL }, use) => {
      const response = await apiContext.post(API.login, {
        data: { email: CREDENTIALS.valid.email, password: CREDENTIALS.valid.password },
      });

      if (!response.ok()) {
        /* Fail loudly here rather than letting 40 tests fail with a confusing 401.
         * A broken fixture should read as a broken fixture. */
        throw new Error(
          `authToken fixture: login failed with ${response.status()} ${response.statusText()}. ` +
            `Is the Flakeboard API running on ${apiBaseURL}, and are the seeded ` +
            `credentials still ${CREDENTIALS.valid.email}?`,
        );
      }

      const body = (await response.json()) as LoginSuccess;
      await use(body.token);
    },
    { scope: 'worker' },
  ],

  signInProgrammatically: async ({ page, authToken }, use) => {
    await use(async () => {
      await page.addInitScript(
        ([key, token]: [string, string]) => {
          window.localStorage.setItem(key, token);
        },
        [TOKEN_STORAGE_KEY, authToken] as [string, string],
      );
    });
  },

  clearSession: async ({ page }, use) => {
    await use(async () => {
      await page.evaluate((key: string) => window.localStorage.removeItem(key), TOKEN_STORAGE_KEY);
    });
  },
});
