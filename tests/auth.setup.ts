import { STORAGE_STATE, expect, test as setup } from '../fixtures';
import { CREDENTIALS, ROUTES, TOKEN_STORAGE_KEY } from '../utils/test-data';

/**
 * The `setup` project. Runs before every browser project (see `dependencies` in
 * playwright.config.ts) and produces the authenticated storage state the whole suite
 * reuses.
 *
 * Why log in through the UI here instead of POSTing to /api/auth/login and writing the
 * token by hand? Because this doubles as the smoke test for the login flow itself. If
 * login is broken, the setup project fails once with a clear message and every dependent
 * project is skipped — instead of 150 tests failing with "expected dashboard, got /login".
 * That is a much better failure to wake up to.
 *
 * Playwright captures `localStorage` per origin in storageState, which is exactly where
 * the contract puts the token, so no manual token plumbing is needed.
 */
setup('authenticate and persist storage state', async ({ page, loginPage }) => {
  await loginPage.goto();

  await expect(loginPage.root, 'login form should render').toBeVisible();

  await loginPage.login(CREDENTIALS.valid);

  /* Web-first assertions: each of these retries until true or the timeout expires.
   * There is no sleep here and there never needs to be one. */
  await expect(page).toHaveURL(new RegExp(`${ROUTES.dashboard}$`));
  await expect(page.getByTestId('app-shell')).toBeVisible();

  const token = await loginPage.storedToken();
  expect(token, `token should be persisted under ${TOKEN_STORAGE_KEY}`).toBeTruthy();

  await page.context().storageState({ path: STORAGE_STATE });
});
