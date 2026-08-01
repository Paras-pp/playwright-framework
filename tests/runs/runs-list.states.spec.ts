import { expect, test } from '../../fixtures';
import { emptyRunsPage, makeRun, makeRunsPage } from '../../utils/factories';
import { API_GLOB, SEED } from '../../utils/test-data';

/**
 * The four states of the runs list, driven by network interception.
 *
 * This file is the argument for Playwright over a Grid-based Selenium suite in one page.
 * Every one of these branches — empty, HTTP 500, dropped connection, in-flight — is
 * reachable in a couple of lines and is *deterministic*. The Selenium equivalent needs a
 * proxy (BrowserMob/mitm), a test-only backend endpoint, or a `Thread.sleep` and a prayer.
 *
 * There is not a single timeout in this file. The loading-state test holds the request
 * open and releases it on the test's own command, so it is exact rather than "probably
 * still spinning after 500ms".
 */
test.describe('Runs list — states', () => {
  test('renders the empty state when the API returns no runs', async ({ runsPage, mock }) => {
    await mock.runs(emptyRunsPage());

    await runsPage.goto();

    await expect(runsPage.state.empty).toBeVisible();
    await expect(runsPage.rows).toHaveCount(0);
    await expect(runsPage.state.error).toBeHidden();
    await expect(runsPage.state.loading).toBeHidden();
  });

  test(
    'renders the error state with a retry button on a 500',
    { tag: ['@states'] },
    async ({ runsPage, mock }) => {
      await mock.runsFail(500);

      await runsPage.goto();

      await expect(runsPage.state.error).toBeVisible();
      await expect(runsPage.state.retryButton).toBeVisible();
      await expect(runsPage.table).toBeHidden();
      /* An error is not an empty list. Rendering "no runs found" on a 500 tells the user
       * their data is gone when it is merely unreachable. */
      await expect(runsPage.state.empty).toBeHidden();
    },
  );

  test('retry refetches and recovers', { tag: ['@states'] }, async ({ runsPage, mock }) => {
    /* Fail exactly once, then let the real API answer. Proves the retry button issues a
     * new request rather than re-rendering the same failed promise. */
    await mock.failThenRecover(API_GLOB.runsListAny, 1);

    await runsPage.goto();
    await expect(runsPage.state.error).toBeVisible();

    await runsPage.state.retry();

    await expect(runsPage.table).toBeVisible();
    await expect(runsPage.rows).toHaveCount(SEED.defaultPageSize);
    await expect(runsPage.state.error).toBeHidden();
  });

  test('renders the error state when the connection drops', async ({ runsPage, mock }) => {
    /* abort() is not the same test as a 500: no response arrives at all. Apps that only
     * check `response.ok` hang forever here. */
    await mock.runsAbort();

    await runsPage.goto();

    await expect(runsPage.state.error).toBeVisible();
    await expect(runsPage.state.retryButton).toBeVisible();
  });

  test('shows a loading state while the request is in flight', { tag: ['@states'] }, async ({
    runsPage,
    mock,
  }) => {
    const release = await mock.runsStall();

    await runsPage.goto();

    /* The request is pinned open, so this assertion is not a race — the spinner cannot
     * disappear until the line after next runs. */
    await expect(runsPage.state.loading).toBeVisible();
    await expect(runsPage.table).toBeHidden();

    release();

    await expect(runsPage.state.loading).toBeHidden();
    await expect(runsPage.table).toBeVisible();
  });

  test('does not flash the empty state while loading', async ({ runsPage, mock }) => {
    const release = await mock.runsStall();

    await runsPage.goto();
    await expect(runsPage.state.loading).toBeVisible();

    /* Loading and empty are mutually exclusive; showing "no runs" during the first fetch
     * is the flicker users report as "it said I had nothing". */
    await expect(runsPage.state.empty).toBeHidden();

    release();
    await expect(runsPage.table).toBeVisible();
  });

  test('renders exactly the rows the API returned', async ({ runsPage, mock }) => {
    /* Fabricating the payload decouples this from the seed: the assertion is about
     * rendering, so the data should be the test's, not the server's. */
    await mock.runs(
      makeRunsPage({
        items: [
          makeRun({ branch: 'release/2026.08', commitMessage: 'feat: ship flake budgets' }),
          makeRun({ branch: 'hotfix/login', commitMessage: 'fix: null token on refresh', status: 'failed' }),
        ],
        total: 2,
      }),
    );

    await runsPage.goto();

    await expect(runsPage.rows).toHaveCount(2);
    await expect(runsPage.rowByBranch('release/2026.08')).toBeVisible();
    await expect(runsPage.rowByBranch('hotfix/login')).toContainText(/fail/i);
    await expect(runsPage.pagination).toBeVisible();
  });

  test('hides pagination when everything fits on one page', async ({ runsPage, mock }) => {
    await mock.runs(makeRunsPage({ count: 3, total: 3 }));

    await runsPage.goto();

    await expect(runsPage.rows).toHaveCount(3);
    await expect(runsPage.nextPageButton).toBeDisabled();
  });

  test('a 404 from the collection endpoint is still an error state', async ({ runsPage, mock }) => {
    await mock.runsFail(404, 'not_found');

    await runsPage.goto();

    await expect(runsPage.state.error).toBeVisible();
  });

  test('logs no console errors on the happy path', async ({ runsPage, consoleErrors }) => {
    await runsPage.goto();
    await expect(runsPage.rows).toHaveCount(SEED.defaultPageSize);

    expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
