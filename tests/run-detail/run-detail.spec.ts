import { expect, test } from '../../fixtures';
import { makeFailingTest, makeRunDetail, makeTest } from '../../utils/factories';
import { API_GLOB, NON_EXISTENT_RUN_ID, ROUTES } from '../../utils/test-data';
import type { RunsPage } from '../../utils/types';

const MOCK_RUN_ID = 'run-mock-0001';

test.describe('Run detail', () => {
  /* ------------------------------------------------------ against the real API */

  test(
    'renders the tests of a real run',
    { tag: ['@smoke', '@run-detail'] },
    async ({ api, runDetailPage }) => {
      /* Hybrid test: the API picks the fixture data, the UI is what is under test.
       * Hard-coding a seed id here would be a second contract nobody agreed to. */
      const listResponse = await api.listRuns({ pageSize: 1 });
      expect(listResponse.ok()).toBeTruthy();
      const { items } = (await listResponse.json()) as RunsPage;
      const run = items[0];
      expect(run, 'seed data should contain at least one run').toBeDefined();

      await runDetailPage.gotoRun(run!.id);

      await expect(runDetailPage.root).toBeVisible();
      /* The h1 is the commit message — the branch and short SHA sit in the subtitle
       * beneath it. Assert each against the element that actually carries it. */
      await expect(runDetailPage.title).toContainText(run!.commitMessage);
      await expect(runDetailPage.root).toContainText(run!.branch);
      await expect(runDetailPage.testRows).toHaveCount(run!.total);
    },
  );

  test('renders the tests table with real column headers', { tag: ['@a11y'] }, async ({
    api,
    runDetailPage,
  }) => {
    const response = await api.listRuns({ pageSize: 1 });
    const { items } = (await response.json()) as RunsPage;

    await runDetailPage.gotoRun(items[0]!.id);

    await expect(runDetailPage.columnHeaders.first()).toBeVisible();
    await expect(runDetailPage.heading).toHaveCount(1);
  });

  test('links back to the runs list', async ({ page, runDetailPage, mock }) => {
    await mock.runDetail(MOCK_RUN_ID, makeRunDetail({ id: MOCK_RUN_ID }));

    await runDetailPage.gotoRun(MOCK_RUN_ID);
    await runDetailPage.goBackToRuns();

    await expect(page).toHaveURL(new RegExp(`${ROUTES.runs}$`));
  });

  /* ------------------------------------------------------------- mocked payloads */

  test('shows error output for failing tests only', { tag: ['@run-detail'] }, async ({
    runDetailPage,
    mock,
  }) => {
    const failing = makeFailingTest({ title: 'checkout retries the payment webhook' });
    const passing = makeTest({ title: 'login renders the form' });
    const detail = makeRunDetail({ id: MOCK_RUN_ID, tests: [passing, failing] });

    await mock.runDetail(MOCK_RUN_ID, detail);
    await runDetailPage.gotoRun(MOCK_RUN_ID);

    await expect(runDetailPage.errorOf(failing.title)).toBeVisible();
    await expect(runDetailPage.errorOf(failing.title)).toContainText('TimeoutError');
    /* The passing test must not carry an error block — a stray one means the component
     * is rendering `error` for the wrong row, which is invisible until you look. */
    await expect(runDetailPage.errorOf(passing.title)).toHaveCount(0);
    await expect(runDetailPage.errorBlocks).toHaveCount(1);
  });

  test('renders every test status', async ({ runDetailPage, mock }) => {
    const tests = [
      makeTest({ title: 'passes cleanly', status: 'passed' }),
      makeTest({ title: 'is flaky on retry', status: 'flaky', retries: 1 }),
      makeFailingTest({ title: 'fails outright' }),
    ];
    await mock.runDetail(MOCK_RUN_ID, makeRunDetail({ id: MOCK_RUN_ID, tests }));

    await runDetailPage.gotoRun(MOCK_RUN_ID);

    await expect(runDetailPage.testRows).toHaveCount(3);
    await expect(runDetailPage.statusOf('passes cleanly')).toContainText(/pass/i);
    await expect(runDetailPage.statusOf('is flaky on retry')).toContainText(/flak/i);
    await expect(runDetailPage.statusOf('fails outright')).toContainText(/fail/i);
  });

  test('surfaces the retry count that makes a test flaky', async ({ runDetailPage, mock }) => {
    const flaky = makeTest({ title: 'auth refresh token', status: 'flaky', retries: 2 });
    await mock.runDetail(MOCK_RUN_ID, makeRunDetail({ id: MOCK_RUN_ID, tests: [flaky] }));

    await runDetailPage.gotoRun(MOCK_RUN_ID);

    await expect(runDetailPage.testRowByTitle(flaky.title)).toContainText('2');
  });

  test('handles a run with no tests', async ({ runDetailPage, mock }) => {
    await mock.runDetail(MOCK_RUN_ID, makeRunDetail({ id: MOCK_RUN_ID, tests: [] }));

    await runDetailPage.gotoRun(MOCK_RUN_ID);

    await expect(runDetailPage.state.empty).toBeVisible();
    await expect(runDetailPage.testRows).toHaveCount(0);
  });

  test('exposes the tests table to assistive tech', { tag: ['@a11y'] }, async ({
    runDetailPage,
    mock,
  }) => {
    const tests = [
      makeTest({ title: 'renders the cart', status: 'passed' }),
      makeFailingTest({ title: 'applies the discount' }),
    ];
    await mock.runDetail(MOCK_RUN_ID, makeRunDetail({ id: MOCK_RUN_ID, tests }));

    await runDetailPage.gotoRun(MOCK_RUN_ID);

    /* ARIA snapshot scoped to the table. Because the payload is mocked, the tree is
     * byte-stable across browsers and machines — the only way an ARIA snapshot is worth
     * having in CI. */
    await expect(runDetailPage.testsTable).toMatchAriaSnapshot(`
      - table "Individual test results, with error output where the test did not pass":
        - caption: Individual test results, with error output where the test did not pass
        - rowgroup:
          - row "Test Status Retries Duration":
            - columnheader "Test"
            - columnheader "Status"
            - columnheader "Retries"
            - columnheader "Duration"
        - rowgroup:
          - row /renders the cart tests\\/checkout\\/discount\\.spec\\.ts Passed 0 \\d+[hmsp]+/:
            - cell "renders the cart tests/checkout/discount.spec.ts"
            - cell "Passed"
            - cell "0"
            - cell /\\d+[hmsp]+/
          - 'row /applies the discount tests\\/checkout\\/discount\\.spec\\.ts TimeoutError: locator\\.click: Timeout \\d+[hmsp]+ exceeded\\. Call log: - waiting for getByRole\\(''button'', \\{ name: ''Apply'' \\}\\) - locator resolved to hidden <button disabled>Apply<\\/button> Failed 2 \\d+[hmsp]+/':
            - 'cell /applies the discount tests\\/checkout\\/discount\\.spec\\.ts TimeoutError: locator\\.click: Timeout \\d+[hmsp]+ exceeded\\. Call log: - waiting for getByRole\\(''button'', \\{ name: ''Apply'' \\}\\) - locator resolved to hidden <button disabled>Apply<\\/button>/':
              - text: applies the discount tests/checkout/discount.spec.ts
              - code: "/TimeoutError: locator\\\\.click: Timeout \\\\d+[hmsp]+ exceeded\\\\. Call log: - waiting for getByRole\\\\('button', \\\\{ name: 'Apply' \\\\}\\\\) - locator resolved to hidden <button disabled>Apply<\\\\/button>/"
            - cell "Failed"
            - cell "2"
            - cell /\\d+[hmsp]+/
    `);
  });

  /* ------------------------------------------------------------------- failures */

  test('shows a not-found state for an unknown run id', { tag: ['@run-detail'] }, async ({
    runDetailPage,
  }) => {
    /* Real 404 from the real server — the contract guarantees it. */
    await runDetailPage.gotoRun(NON_EXISTENT_RUN_ID);

    await expect(runDetailPage.state.error).toBeVisible();
    await expect(runDetailPage.testsTable).toBeHidden();
  });

  test('shows an error state and recovers via retry on a 500', async ({
    runDetailPage,
    mock,
  }) => {
    /* Registration order matters: Playwright runs route handlers last-registered-first,
     * so the one-shot failure must be installed AFTER the success handler it falls
     * through to. Getting this backwards is a genuinely confusing hour of debugging. */
    await mock.runDetail(MOCK_RUN_ID, makeRunDetail({ id: MOCK_RUN_ID }));
    await mock.failThenRecover(API_GLOB.runDetail(MOCK_RUN_ID), 1);

    await runDetailPage.gotoRun(MOCK_RUN_ID);
    await expect(runDetailPage.state.error).toBeVisible();

    await runDetailPage.state.retry();

    await expect(runDetailPage.testsTable).toBeVisible();
  });

  test('shows a loading state while the run is being fetched', async ({
    runDetailPage,
    mock,
  }) => {
    await mock.runDetail(MOCK_RUN_ID, makeRunDetail({ id: MOCK_RUN_ID }));
    const release = await mock.stall(API_GLOB.runDetail(MOCK_RUN_ID));

    await runDetailPage.gotoRun(MOCK_RUN_ID);

    await expect(runDetailPage.state.loading).toBeVisible();

    release();

    await expect(runDetailPage.testsTable).toBeVisible();
    await expect(runDetailPage.state.loading).toBeHidden();
  });
});
