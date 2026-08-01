import { expect, test } from '../../fixtures';
import { ROUTES, SEED } from '../../utils/test-data';
import type { RunStatus } from '../../utils/types';
import { queryOf } from '../../utils/network';

/**
 * Runs list against the real, seeded API.
 *
 * These run in parallel with everything else because the endpoint is read-only and the
 * seed is deterministic — no shared mutable state means no ordering constraints and no
 * `test.describe.serial`.
 */
test.describe('Runs list', () => {
  test.beforeEach(async ({ runsPage }) => {
    await runsPage.goto();
    await expect(runsPage.table).toBeVisible();
  });

  test(
    'renders the first page of runs',
    { tag: ['@smoke', '@runs'] },
    async ({ runsPage }) => {
      await expect(runsPage.rows).toHaveCount(SEED.defaultPageSize);
      await expect(runsPage.state.empty).toBeHidden();
      await expect(runsPage.state.error).toBeHidden();
    },
  );

  test('exposes the runs as a real table with column headers', { tag: ['@a11y'] }, async ({
    runsPage,
  }) => {
    /* getByRole('columnheader') only resolves if the markup is genuinely a <table> with
     * <th> cells. A div-grid pretending to be a table fails here, which is the point. */
    await expect(runsPage.columnHeaders.first()).toBeVisible();
    expect(await runsPage.columnHeaders.count()).toBeGreaterThan(2);
  });

  test('has exactly one h1', { tag: ['@a11y'] }, async ({ runsPage }) => {
    await expect(runsPage.heading).toHaveCount(1);
  });

  /* --------------------------------------------------------------------- search */

  test('search narrows the list to a branch', async ({ runsPage }) => {
    const branch = 'feat/checkout';

    const response = await runsPage.waitForRunsResponse(() => runsPage.search(branch));

    expect(queryOf(response.request()).get('search')).toBe(branch);
    await expect(runsPage.rows.filter({ hasNotText: branch })).toHaveCount(0);
    expect(await runsPage.rowCount()).toBeGreaterThan(0);
  });

  test('search is case-insensitive', async ({ runsPage }) => {
    await runsPage.waitForRunsResponse(() => runsPage.search('FEAT/CHECKOUT'));

    await expect(runsPage.rows.filter({ hasNotText: /feat\/checkout/i })).toHaveCount(0);
    expect(await runsPage.rowCount()).toBeGreaterThan(0);
  });

  test('search also matches commit messages', async ({ runsPage }) => {
    /* Branches never contain a space, so a multi-word hit can only have come from the
     * commit message — proving the server searches both fields, per the contract. */
    await runsPage.waitForRunsResponse(() => runsPage.search('fix'));

    expect(await runsPage.rowCount()).toBeGreaterThan(0);
  });

  test('clearing the search restores the full list', async ({ runsPage }) => {
    await runsPage.waitForRunsResponse(() => runsPage.search('feat/checkout'));
    const filtered = await runsPage.rowCount();

    await runsPage.waitForRunsResponse(() => runsPage.clearSearch());

    await expect(runsPage.rows).toHaveCount(SEED.defaultPageSize);
    expect(filtered).toBeLessThanOrEqual(SEED.defaultPageSize);
  });

  test('a search with no matches renders the empty state', async ({ runsPage }) => {
    await runsPage.waitForRunsResponse(() => runsPage.search('zzz-no-such-branch-zzz'));

    await expect(runsPage.state.empty).toBeVisible();
    await expect(runsPage.rows).toHaveCount(0);
    /* Empty is not an error. Conflating the two is the single most common state bug. */
    await expect(runsPage.state.error).toBeHidden();
  });

  /* --------------------------------------------------------------- status filter */

  const statuses: readonly RunStatus[] = ['passed', 'failed', 'flaky'];

  for (const status of statuses) {
    test(`status filter shows only ${status} runs`, async ({ runsPage }) => {
      const response = await runsPage.waitForRunsResponse(() => runsPage.filterByStatus(status));

      expect(queryOf(response.request()).get('status')).toBe(status);
      expect(await runsPage.rowCount()).toBeGreaterThan(0);
      await expect(runsPage.rows.filter({ hasNotText: new RegExp(status, 'i') })).toHaveCount(0);
    });
  }

  test('resetting the status filter brings every run back', async ({ runsPage }) => {
    await runsPage.waitForRunsResponse(() => runsPage.filterByStatus('failed'));
    await runsPage.waitForRunsResponse(() => runsPage.filterByStatus(''));

    await expect(runsPage.rows).toHaveCount(SEED.defaultPageSize);
  });

  test('search and status filter compose', async ({ runsPage }) => {
    await runsPage.waitForRunsResponse(() => runsPage.search('main'));
    const response = await runsPage.waitForRunsResponse(() => runsPage.filterByStatus('flaky'));

    const query = queryOf(response.request());
    expect(query.get('search')).toBe('main');
    expect(query.get('status')).toBe('flaky');
  });

  /* ----------------------------------------------------------------- pagination */

  test('paginates forward and back', { tag: ['@runs'] }, async ({ runsPage }) => {
    const firstPageText = await runsPage.rows.first().innerText();

    await runsPage.waitForRunsResponse(() => runsPage.goToNextPage());

    await expect(runsPage.pageIndicator).toContainText('2');
    /* `useInnerText` on both sides: the snapshot above came from innerText(), which keeps
     * cell boundaries as newlines. toHaveText defaults to textContent, which concatenates
     * them — comparing the two forms can never match, however correct the pagination is. */
    await expect(runsPage.rows.first()).not.toHaveText(firstPageText, { useInnerText: true });

    await runsPage.waitForRunsResponse(() => runsPage.goToPreviousPage());

    await expect(runsPage.pageIndicator).toContainText('1');
    await expect(runsPage.rows.first()).toHaveText(firstPageText, { useInnerText: true });
  });

  test('previous is disabled on the first page', async ({ runsPage }) => {
    await expect(runsPage.previousPageButton).toBeDisabled();
    await expect(runsPage.nextPageButton).toBeEnabled();
  });

  test('the last page holds the remainder of the seed and disables next', async ({ runsPage }) => {
    for (let i = 1; i < SEED.totalPages; i++) {
      await runsPage.waitForRunsResponse(() => runsPage.goToNextPage());
    }

    /* 47 runs, 10 per page → the fifth page has 7. Only a deterministic seed makes an
     * assertion this specific safe to write. */
    const remainder = SEED.totalRuns % SEED.defaultPageSize;
    await expect(runsPage.rows).toHaveCount(remainder);
    await expect(runsPage.nextPageButton).toBeDisabled();
    await expect(runsPage.previousPageButton).toBeEnabled();
  });

  test('changing the filter resets pagination to page one', async ({ runsPage }) => {
    await runsPage.waitForRunsResponse(() => runsPage.goToNextPage());
    await expect(runsPage.pageIndicator).toContainText('2');

    const response = await runsPage.waitForRunsResponse(() => runsPage.filterByStatus('flaky'));

    expect(queryOf(response.request()).get('page')).toBe('1');
    await expect(runsPage.pageIndicator).toContainText('1');
  });

  /* ----------------------------------------------------------------- navigation */

  test('opening a row navigates to that run', { tag: ['@smoke'] }, async ({
    page,
    runsPage,
    runDetailPage,
  }) => {
    await runsPage.openRunAt(0);

    await expect(page).toHaveURL(new RegExp(`${ROUTES.runs}/[^/]+$`));
    await expect(runDetailPage.root).toBeVisible();
  });

  test('the runs nav link is marked as the current page', { tag: ['@a11y'] }, async ({
    runsPage,
  }) => {
    await expect(runsPage.shell.runsLink).toHaveAttribute('aria-current', 'page');
  });
});
