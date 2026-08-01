import { expect, test } from '../../fixtures';
import { ROUTES } from '../../utils/test-data';

test.describe('Navigation', () => {
  test('moves between dashboard and runs via the nav', { tag: ['@smoke'] }, async ({
    page,
    appShell,
    dashboardPage,
    runsPage,
  }) => {
    await dashboardPage.goto();

    await appShell.goToRuns();
    await expect(page).toHaveURL(new RegExp(`${ROUTES.runs}$`));
    await expect(runsPage.table).toBeVisible();

    await appShell.goToDashboard();
    await expect(page).toHaveURL(new RegExp(`${ROUTES.dashboard}$`));
    await expect(dashboardPage.chart).toBeVisible();
  });

  test('client-side navigation does not reload the document', async ({
    page,
    appShell,
    dashboardPage,
  }) => {
    await dashboardPage.goto();

    /* Stamp the window, navigate, and check the stamp survived. If React Router were
     * doing a full page load the marker would be gone — a one-line proof that the SPA is
     * actually an SPA. */
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__spaMarker = 'kept';
    });

    await appShell.goToRuns();
    await expect(page).toHaveURL(new RegExp(`${ROUTES.runs}$`));

    const marker = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__spaMarker,
    );
    expect(marker).toBe('kept');
  });

  test('browser back and forward follow the app', async ({ page, appShell, dashboardPage }) => {
    await dashboardPage.goto();
    await appShell.goToRuns();
    await expect(page).toHaveURL(new RegExp(`${ROUTES.runs}$`));

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${ROUTES.dashboard}$`));

    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${ROUTES.runs}$`));
  });

  test('renders a not-found page for an unknown route', async ({ notFoundPage }) => {
    await notFoundPage.goto();

    await expect(notFoundPage.root).toBeVisible();
  });

  test('the not-found page offers a way back into the app', async ({ page, notFoundPage }) => {
    await notFoundPage.gotoPath('/runs/../nope');

    await expect(notFoundPage.root).toBeVisible();
    await notFoundPage.backLink.click();
    await expect(page).not.toHaveURL(/nope/);
  });
});
