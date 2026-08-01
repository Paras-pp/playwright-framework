import { STORAGE_STATE_ANONYMOUS, expect, test } from '../../fixtures';
import { API_GLOB, NON_EXISTENT_RUN_ID, ROUTES, TOKEN_STORAGE_KEY } from '../../utils/test-data';

const PROTECTED_ROUTES = [
  { name: 'dashboard', path: ROUTES.dashboard },
  { name: 'runs list', path: ROUTES.runs },
  { name: 'run detail', path: ROUTES.runDetail(NON_EXISTENT_RUN_ID) },
] as const;

test.describe('Route protection (logged out)', () => {
  test.use({ storageState: STORAGE_STATE_ANONYMOUS });

  /* One test per route, generated from data. Playwright reports each as its own test, so
   * a failure names the exact route instead of "the loop broke somewhere". */
  for (const route of PROTECTED_ROUTES) {
    test(`redirects an anonymous visit to the ${route.name} to /login`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page).toHaveURL(new RegExp(`${ROUTES.login}$`));
      await expect(page.getByTestId('login-form')).toBeVisible();
    });
  }

  test('does not render app chrome before redirecting', async ({ page, appShell }) => {
    await page.goto(ROUTES.runs);

    await expect(page).toHaveURL(new RegExp(`${ROUTES.login}$`));
    await expect(appShell.root).toBeHidden();
  });
});

test.describe('Session (logged in)', () => {
  /* No storageState override: these inherit the project's authenticated state, which is
   * the whole point of the setup project. Not one of these tests pays for a login. */

  test('a signed-in user visiting /login is bounced to the dashboard', async ({ page }) => {
    await page.goto(ROUTES.login);

    await expect(page).toHaveURL(new RegExp(`${ROUTES.dashboard}$`));
    await expect(page.getByTestId('app-shell')).toBeVisible();
  });

  test(
    'session survives a full page reload',
    { tag: ['@smoke'] },
    async ({ page, runsPage }) => {
      await runsPage.goto();
      await expect(runsPage.table).toBeVisible();

      await page.reload();

      await expect(runsPage.table).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${ROUTES.runs}$`));
    },
  );

  test('session is shared with a second tab in the same context', async ({ page, context }) => {
    await page.goto(ROUTES.dashboard);

    const secondTab = await context.newPage();
    await secondTab.goto(ROUTES.runs);

    await expect(secondTab.getByTestId('runs-table')).toBeVisible();
    await expect(secondTab).not.toHaveURL(new RegExp(`${ROUTES.login}$`));
    await secondTab.close();
  });

  test('logout clears the token and returns to /login', async ({ page, appShell }) => {
    await page.goto(ROUTES.dashboard);

    await appShell.logout();

    await expect(page).toHaveURL(new RegExp(`${ROUTES.login}$`));
    await expect
      .poll(() => page.evaluate((key: string) => localStorage.getItem(key), TOKEN_STORAGE_KEY))
      .toBeNull();
  });

  test('the back button cannot restore the app after logout', async ({ page, appShell }) => {
    /* Two authenticated entries before logging out. Logout replaces the current entry
     * rather than pushing, so with a single visit `goBack()` would land on about:blank
     * and prove nothing — the pop has to land on a real guarded route. */
    await page.goto(ROUTES.dashboard);
    await page.goto(ROUTES.runs);
    await appShell.logout();
    await expect(page).toHaveURL(new RegExp(`${ROUTES.login}$`));

    await page.goBack();

    /* The guard has to re-run on a history pop, not just on first mount. This is the bug
     * every hand-rolled auth guard ships at least once. */
    await expect(page).toHaveURL(new RegExp(`${ROUTES.login}$`));
    await expect(appShell.root).toBeHidden();
  });

  test('an expired token is rejected and the user is sent to /login', async ({ page, mock }) => {
    /* Simulate the server deciding the stored token is no longer good. */
    await mock.fail(API_GLOB.runsListAny, 401, 'unauthorized');

    await page.goto(ROUTES.runs);

    await expect(page).toHaveURL(new RegExp(`${ROUTES.login}$`));
  });
});
