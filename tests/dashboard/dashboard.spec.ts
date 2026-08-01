import { expect, test } from '../../fixtures';
import { makeFlakyResponse, makeTopFlaky } from '../../utils/factories';
import { SEED } from '../../utils/test-data';
import type { FlakyResponse } from '../../utils/types';

test.describe('Dashboard', () => {
  /* ------------------------------------------------------ against the real API */

  test(
    'renders the three stat tiles with values',
    { tag: ['@smoke', '@dashboard'] },
    async ({ dashboardPage }) => {
      await dashboardPage.goto();

      for (const tile of dashboardPage.statTiles) {
        await expect(tile).toBeVisible();
        /* A tile that renders but shows nothing is the failure mode worth catching —
         * `toBeVisible` alone would happily pass on an empty box. */
        await expect(tile).not.toBeEmpty();
      }
    },
  );

  test('reports the seeded run count', { tag: ['@dashboard'] }, async ({ dashboardPage }) => {
    await dashboardPage.goto();

    await expect(dashboardPage.statTotalRuns).toContainText(String(SEED.totalRuns));
  });

  test('shows the flake rate as a percentage', async ({ dashboardPage }) => {
    await dashboardPage.goto();

    await expect(dashboardPage.statFlakeRate).toContainText('%');
  });

  test('renders the flake-rate chart from real data', async ({ dashboardPage }) => {
    await dashboardPage.goto();

    await expect(dashboardPage.chart).toBeVisible();
    expect(await dashboardPage.chartPoints.count()).toBeGreaterThan(0);
  });

  test('lists the top flaky tests', { tag: ['@dashboard'] }, async ({ dashboardPage }) => {
    await dashboardPage.goto();

    await expect(dashboardPage.topFlakyTable).toBeVisible();
    expect(await dashboardPage.topFlakyRows.count()).toBeGreaterThanOrEqual(
      SEED.reliablyFlakyCount,
    );
  });

  test('has exactly one h1 and a table with headers', { tag: ['@a11y'] }, async ({
    dashboardPage,
  }) => {
    await dashboardPage.goto();

    await expect(dashboardPage.heading).toHaveCount(1);
    await expect(dashboardPage.topFlakyHeaders.first()).toBeVisible();
  });

  /* ------------------------------------------------------------- mocked payloads */

  test('plots one point per day in the window', async ({ dashboardPage, mock }) => {
    const payload: FlakyResponse = makeFlakyResponse();
    await mock.flaky(payload);

    await dashboardPage.goto();

    /* 30 days in, 30 points out. Asserting an exact count only works because the payload
     * is ours — against live data this would be a flaky assertion about flakiness. */
    await expect(dashboardPage.chartPoints).toHaveCount(payload.series.length);
    expect(payload.series).toHaveLength(SEED.flakeWindowDays);
  });

  test('renders the exact flaky tests the API returned', async ({ dashboardPage, mock }) => {
    const topFlaky = [
      makeTopFlaky({ title: 'checkout applies the discount code', flakeRate: 0.41 }),
      makeTopFlaky({ title: 'auth refreshes an expiring token', flakeRate: 0.22 }),
    ];
    await mock.flaky(makeFlakyResponse({ topFlaky }));

    await dashboardPage.goto();

    await expect(dashboardPage.topFlakyRows).toHaveCount(2);
    await expect(dashboardPage.flakyRowByTitle('checkout applies the discount code')).toBeVisible();
    await expect(dashboardPage.flakyRowByTitle(/auth refreshes/)).toContainText('22');
  });

  test('renders an empty state when nothing is flaky', async ({ dashboardPage, mock }) => {
    /* The dashboard reads two endpoints. Its empty state means "nothing has ever been
     * uploaded", so it needs both to be empty — an empty flaky list on top of 47 real
     * runs is a populated dashboard with no flakes, which is a different screen. */
    await mock.flaky({ series: [], topFlaky: [] });
    await mock.runsEmpty();

    await dashboardPage.goto();

    await expect(dashboardPage.state.empty).toBeVisible();
    await expect(dashboardPage.topFlakyRows).toHaveCount(0);
    await expect(dashboardPage.state.error).toBeHidden();
  });

  test('renders an error state with retry on a 500', { tag: ['@states'] }, async ({
    dashboardPage,
    mock,
  }) => {
    await mock.flakyFail(500);

    await dashboardPage.goto();

    await expect(dashboardPage.state.error).toBeVisible();
    await expect(dashboardPage.state.retryButton).toBeVisible();
    await expect(dashboardPage.chart).toBeHidden();
  });

  test('recovers when retry succeeds', async ({ dashboardPage, mock }) => {
    await mock.flaky(makeFlakyResponse());
    await mock.failThenRecover('**/api/flaky*', 1);

    await dashboardPage.goto();
    await expect(dashboardPage.state.error).toBeVisible();

    await dashboardPage.state.retry();

    await expect(dashboardPage.chart).toBeVisible();
    await expect(dashboardPage.state.error).toBeHidden();
  });

  test('shows a loading state while the chart data is in flight', { tag: ['@states'] }, async ({
    dashboardPage,
    mock,
  }) => {
    const release = await mock.flakyStall();

    await dashboardPage.goto();

    await expect(dashboardPage.state.loading).toBeVisible();
    await expect(dashboardPage.chart).toBeHidden();

    release();

    await expect(dashboardPage.chart).toBeVisible();
    await expect(dashboardPage.state.loading).toBeHidden();
  });

  test('exposes the top flaky table to assistive tech', { tag: ['@a11y'] }, async ({
    dashboardPage,
    mock,
  }) => {
    await mock.flaky(
      makeFlakyResponse({
        topFlaky: [
          makeTopFlaky({ title: 'checkout applies the discount code' }),
          makeTopFlaky({ title: 'auth refreshes an expiring token' }),
        ],
      }),
    );

    await dashboardPage.goto();

    /* The ARIA snapshot is the accessibility contract in executable form. It survives a
     * CSS rewrite and fails a semantics regression — the exact inverse of a screenshot
     * diff, which is why both have a place and this one runs on every commit. */
    await expect(dashboardPage.topFlakyTable).toMatchAriaSnapshot(`
      - table:
        - rowgroup
        - rowgroup:
          - row:
            - cell "checkout applies the discount code"
          - row:
            - cell "auth refreshes an expiring token"
    `);
  });
});
